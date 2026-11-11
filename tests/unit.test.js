import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupEnv } from './helpers.js';

const dir = setupEnv();
process.env.RETENTION_DAYS = '5';
process.env.PORT = 'abc'; // inválida: deve ser ignorada
const S = '../app/src/';
const http = await import(S + 'utils/http.js');
const hash = await import(S + 'utils/hash.js');
const validate = await import(S + 'services/validate.js');
const cfg = await import(S + 'config.js');

after(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('utils/http', () => {
  test('HttpError', () => {
    const e = new http.HttpError(418, 'x', { a: 1 });
    assert.equal(e.status, 418);
    assert.equal(e.message, 'x');
    assert.deepEqual(e.extra, { a: 1 });
    assert.equal(new http.HttpError(400, 'y').extra.constructor, Object);
  });
  test('asyncHandler resolve e encaminha rejeição', async () => {
    let called = false;
    await http.asyncHandler(async () => { called = true; })({}, {}, () => assert.fail());
    assert.ok(called);
    const err = new Error('boom');
    let got;
    await http.asyncHandler(async () => { throw err; })({}, {}, (e) => { got = e; });
    await new Promise((r) => setImmediate(r));
    assert.equal(got, err);
  });
  test('DAY_MS', () => assert.equal(http.DAY_MS, 86400000));
});

describe('utils/hash', () => {
  test('newId', () => {
    const id = hash.newId();
    assert.match(id, /^[2-9a-zA-Z]{10}$/);
    assert.notEqual(id, hash.newId());
  });
  test('md5Buffer / md5File / md5FileContent', async () => {
    assert.equal(hash.md5Buffer(Buffer.from('abc')), '900150983cd24fb0d6963f7d28e17f72');
    const f = path.join(dir, 'f.txt');
    fs.writeFileSync(f, 'abc');
    assert.equal(await hash.md5File(f), '900150983cd24fb0d6963f7d28e17f72');
    assert.equal(hash.md5FileContent('h', 'n.txt'), 'h  n.txt\n');
  });
});

describe('services/validate', () => {
  const { sanitizeFileName: s } = validate;
  test('sanitizeFileName', () => {
    assert.equal(s('../../etc/passwd'), 'passwd');
    assert.equal(s('a\\b\\c.txt'), 'c.txt');
    assert.equal(s('a\x00b<>:"|?*.txt'), 'ab.txt');
    assert.equal(s('..hidden...txt'), 'hidden.txt');
    assert.equal(s('name. . '), 'name');
    assert.equal(s('', 'fb'), 'fb');
    assert.equal(s(null), 'arquivo');
    assert.equal(s('/'), 'arquivo');
    const long = s('a'.repeat(300) + '.zip');
    assert.equal(long.length, 180);
    assert.ok(long.endsWith('.zip'));
  });
  test('getExtension / isAllowedExtension', () => {
    assert.equal(validate.getExtension('A.ZIP'), '.zip');
    assert.equal(validate.getExtension(undefined), '');
    assert.ok(validate.isAllowedExtension('a.bin', []));
    assert.ok(validate.isAllowedExtension('a.bin', undefined));
    assert.ok(validate.isAllowedExtension('a.zip', ['.zip']));
    assert.ok(!validate.isAllowedExtension('a.exe', ['.zip']));
  });
});

describe('config', () => {
  test('env e defaults', () => {
    assert.equal(cfg.config.retentionDays, 5);
    assert.equal(cfg.config.port, 8000);
    assert.deepEqual(cfg.getEnvOverriddenKeys().sort(), ['host', 'retentionDays', 'storageDir']);
    assert.ok(fs.existsSync(cfg.CONFIG_PATH)); // criado com padrões
  });
  test('validateEditable', () => {
    const v = cfg.validateEditable;
    assert.equal(v('retentionDays', '2.5'), 2.5);
    assert.equal(v('maxFileSizeBytes', 2 * 1024 * 1024), 2097152);
    assert.throws(() => v('nope', 1), /não pode ser alterado/);
    assert.throws(() => v('retentionDays', 'x'), /numérico/);
    assert.throws(() => v('retentionDays', ''), /numérico/);
    assert.throws(() => v('maxFileSizeBytes', 2097152.5), /inteiro/);
    assert.throws(() => v('retentionDays', 0), /entre/);
    assert.throws(() => v('retentionDays', 366), /entre/);
  });
  test('ensureStorageDirs / paths / publicConfig', () => {
    cfg.ensureStorageDirs();
    for (const d of Object.values(cfg.paths)) assert.ok(fs.statSync(d).isDirectory());
    const p = cfg.publicConfig();
    assert.deepEqual(Object.keys(p).sort(), ['allowedExtensions', 'chunkSizeBytes', 'maxFileSizeBytes', 'maxPasteSizeBytes', 'retentionDays']);
  });
  test('updateConfig', () => {
    assert.throws(() => cfg.updateConfig(null), /objeto/);
    assert.throws(() => cfg.updateConfig([]), /objeto/);
    assert.throws(() => cfg.updateConfig({}), /Nenhuma/);
    assert.throws(() => cfg.updateConfig({ port: 1 }), /não pode/);
    let evt;
    cfg.configEvents.once('change', (u, p) => { evt = [u, p]; });
    const r = cfg.updateConfig({ retentionDays: 7, cleanupIntervalMinutes: 5 });
    assert.deepEqual(r.updated, { retentionDays: 7, cleanupIntervalMinutes: 5 });
    assert.equal(r.warnings.length, 1); // retentionDays vem de env
    assert.equal(cfg.config.retentionDays, 7);
    assert.equal(evt[1].retentionDays, 5);
    const file = JSON.parse(fs.readFileSync(cfg.CONFIG_PATH, 'utf8'));
    assert.equal(file.retentionDays, 7);
    assert.equal(file.port, 8000); // preservado
  });
  test('updateConfig com arquivo ilegível usa padrões', () => {
    fs.writeFileSync(cfg.CONFIG_PATH, '{ruim');
    const r = cfg.updateConfig({ incompleteUploadTtlHours: 2 });
    assert.equal(r.updated.incompleteUploadTtlHours, 2);
    assert.equal(JSON.parse(fs.readFileSync(cfg.CONFIG_PATH, 'utf8')).port, 8000);
  });
});

describe('config: leitura do arquivo e sanitização', () => {
  const run = async (content, env = {}) => {
    const d = setupEnv();
    fs.mkdirSync(path.dirname(process.env.CONFIG_PATH), { recursive: true });
    if (content !== null) fs.writeFileSync(process.env.CONFIG_PATH, content);
    const saved = { ...process.env };
    delete process.env.RETENTION_DAYS;
    delete process.env.PORT;
    delete process.env.HOST;
    Object.assign(process.env, env);
    const mod = await import(`${S}config.js?case=${Math.random()}`);
    process.env = saved;
    fs.rmSync(d, { recursive: true, force: true });
    return mod;
  };
  test('JSON inválido -> padrões', async () => {
    const m = await run('{x');
    assert.equal(m.config.retentionDays, 3);
  });
  test('JSON não-objeto -> padrões', async () => {
    const m = await run('[1]');
    assert.equal(m.config.port, 8000);
  });
  test('valores fora do limite e extensões', async () => {
    const m = await run(JSON.stringify({ retentionDays: -1, port: 99999, host: '', storageDir: '', allowedExtensions: ['ZIP', ' .7z ', '', 'zip'] }));
    assert.equal(m.config.retentionDays, 3);
    assert.equal(m.config.port, 8000);
    assert.deepEqual(m.config.allowedExtensions, ['.zip', '.7z']);
    const m2 = await run(JSON.stringify({ allowedExtensions: 'x', port: 9000, host: 'h' }));
    assert.deepEqual(m2.config.allowedExtensions, []);
    assert.equal(m2.config.port, 9000);
    assert.equal(m2.config.host, 'h');
  });
});
