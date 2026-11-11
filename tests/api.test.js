import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { setupEnv } from './helpers.js';

const PORT = 18761;
const dir = setupEnv(PORT);
const S = '../app/src/';
const { server } = await import(S + 'server.js');
const { config, paths } = await import(S + 'config.js');
const { db, closeDb } = await import(S + 'db.js');
const { runCleanup, stopCleanup, startCleanup } = await import(S + 'services/cleanup.js');
const { updateConfig } = await import(S + 'config.js');

const base = `http://127.0.0.1:${PORT}`;
const j = (p, method = 'GET', body) =>
  fetch(base + p, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });

after(async () => {
  stopCleanup();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('sistema e docs', () => {
  test('health / stats / config público', async () => {
    assert.deepEqual(await (await j('/api/health')).json(), { status: 'ok' });
    assert.equal((await (await j('/api/stats')).json()).totalItems, 0);
    const c = await (await j('/api/config/public')).json();
    assert.ok(c.stats && c.retentionDays);
  });
  test('openapi e docs', async () => {
    const pt = await (await j('/api/openapi.json')).json();
    const en = await (await j('/api/openapi.json?lang=en-US')).json();
    assert.ok(pt.paths && en.paths);
    assert.notEqual(JSON.stringify(pt), JSON.stringify(en));
    assert.equal((await j('/docs')).status, 200);
  });
  test('404 JSON e HTML', async () => {
    const a = await j('/api/nao-existe');
    assert.equal(a.status, 404);
    assert.ok((await a.json()).error);
    const h = await j('/pagina-inexistente');
    assert.equal(h.status, 404);
    assert.match(await h.text(), /404/);
  });
  test('JSON inválido -> 400; estático', async () => {
    const r = await fetch(base + '/api/pastes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{x' });
    assert.equal(r.status, 400);
    const html = await fetch(base + '/pastes/xx');
    assert.equal(html.status, 404);
    assert.equal((await j('/')).status, 200);
    assert.equal((await j('/pastes')).status, 200);
    assert.equal((await j('/files')).status, 200);
  });
});

describe('pastes', () => {
  let paste;
  test('criar', async () => {
    const r = await j('/api/pastes', 'POST', { title: '  Meu Título  ', content: 'olá mundo' });
    assert.equal(r.status, 201);
    paste = await r.json();
    assert.equal(paste.title, 'Meu Título');
    assert.equal(paste.fileName, 'Meu Título.txt');
    const r2 = await (await j('/api/pastes', 'POST', { content: 'x', title: 5 })).json();
    assert.equal(r2.title, null);
    assert.match(r2.fileName, /^paste-/);
  });
  test('validações', async () => {
    assert.equal((await j('/api/pastes', 'POST', { content: '   ' })).status, 400);
    assert.equal((await j('/api/pastes', 'POST', {})).status, 400);
    const big = 'a'.repeat(config.maxPasteSizeBytes + 1);
    assert.equal((await j('/api/pastes', 'POST', { content: big })).status, 413);
    const huge = 'a'.repeat(config.maxPasteSizeBytes * 6 + 100 * 1024);
    assert.equal((await j('/api/pastes', 'POST', { content: huge })).status, 413);
  });
  test('ler / raw / download / md5', async () => {
    const g = await (await j(`/api/pastes/${paste.id}`)).json();
    assert.equal(g.content, 'olá mundo');
    const raw = await j(`/pastes/${paste.id}/raw`);
    assert.equal(await raw.text(), 'olá mundo');
    assert.equal(raw.headers.get('x-content-type-options'), 'nosniff');
    const dl = await j(`/p/${paste.id}/download`);
    assert.match(dl.headers.get('content-disposition'), /attachment/);
    assert.equal(await dl.text(), 'olá mundo');
    const md5 = await j(`/pastes/${paste.id}/download.md5`);
    assert.equal(await md5.text(), `${paste.md5}  Meu Título.txt\n`);
    assert.equal((await j(`/pastes/${paste.id}`)).status, 200);
  });
  test('404 e 410', async () => {
    assert.equal((await j('/api/pastes/inexistente1')).status, 404);
    assert.equal((await j('/api/pastes/!!')).status, 404);
    assert.equal((await j('/pastes/inexistente1')).status, 404);
    assert.equal((await j('/pastes/inexistente1/raw')).status, 404);
    assert.equal((await j('/pastes/inexistente1/download')).status, 404);
    assert.equal((await j('/pastes/inexistente1/download.md5')).status, 404);
    db.prepare('UPDATE pastes SET expires_at = 1 WHERE id = ?').run(paste.id);
    assert.equal((await j(`/api/pastes/${paste.id}`)).status, 410);
    assert.equal((await j(`/pastes/${paste.id}`)).status, 410);
  });
  test('arquivo ausente no disco -> erro em raw', async () => {
    const p = await (await j('/api/pastes', 'POST', { content: 'zz' })).json();
    fs.rmSync(path.join(paths.pastes, `${p.id}.txt`));
    assert.notEqual((await j(`/pastes/${p.id}/raw`)).status, 200);
    assert.notEqual((await j(`/pastes/${p.id}/download`)).status, 200);
    assert.equal((await j(`/api/pastes/${p.id}`)).status, 500);
  });
});

async function upload(name, buf, { chunkSize } = {}) {
  const init = await (await j('/api/uploads/init', 'POST', { fileName: name, size: buf.length })).json();
  const cs = chunkSize || init.chunkSize;
  for (let i = 0; i < init.totalChunks; i++) {
    const part = buf.subarray(i * cs, (i + 1) * cs);
    const r = await fetch(`${base}/api/uploads/${init.uploadId}/chunk/${i}`, { method: 'PUT', body: part });
    assert.equal(r.status, 200);
  }
  return init;
}

describe('uploads e arquivos', () => {
  const content = Buffer.from('0123456789abcdef');
  let file;
  before(() => updateConfig({ chunkSizeBytes: 1024 * 1024 }));

  test('init: validações', async () => {
    assert.equal((await j('/api/uploads/init', 'POST', {})).status, 400);
    assert.equal((await j('/api/uploads/init', 'POST', { fileName: 'a.txt', size: 0 })).status, 400);
    assert.equal((await j('/api/uploads/init', 'POST', { fileName: 'a.txt', size: 'x' })).status, 400);
    assert.equal((await j('/api/uploads/init', 'POST', { fileName: 'a.txt', size: config.maxFileSizeBytes + 1 })).status, 413);
    config.allowedExtensions = ['.zip'];
    assert.equal((await j('/api/uploads/init', 'POST', { fileName: 'a.exe', size: 10 })).status, 415);
    config.allowedExtensions = [];
    assert.equal((await j('/api/uploads/init', 'POST', { fileName: 'a.txt', size: 1024 ** 4 - 1 })).status, 413);
    config.maxFileSizeBytes = 1024 ** 5;
    assert.equal((await j('/api/uploads/init', 'POST', { fileName: 'a.txt', size: 1024 ** 5 })).status, 507);
    config.maxFileSizeBytes = 1024 ** 3;
  });

  test('chunks, status e complete', async () => {
    const init = await (await j('/api/uploads/init', 'POST', { fileName: '../x/teste.bin', size: content.length })).json();
    assert.equal(init.fileName, 'teste.bin');
    assert.equal(init.totalChunks, 1);
    const id = init.uploadId;

    let st = await (await j(`/api/uploads/${id}/status`)).json();
    assert.deepEqual(st.received, []);
    const miss = await j(`/api/uploads/${id}/complete`, 'POST');
    assert.equal(miss.status, 409);
    assert.deepEqual((await miss.json()).missing, [0]);

    const put = (i, body) => fetch(`${base}/api/uploads/${id}/chunk/${i}`, { method: 'PUT', body });
    assert.equal((await put(5, content)).status, 400); // índice
    assert.equal((await put('x', content)).status, 400);
    assert.equal((await put(0, content.subarray(0, 4))).status, 400); // tamanho
    const ok = await put(0, content);
    assert.deepEqual(await ok.json(), { index: 0, receivedChunks: 1, totalChunks: 1 });
    st = await (await j(`/api/uploads/${id}/status`)).json();
    assert.deepEqual(st.received, [0]);

    const done = await j(`/api/uploads/${id}/complete`, 'POST');
    assert.equal(done.status, 200);
    file = await done.json();
    assert.equal(file.fileName, 'teste.bin');
    assert.equal(file.md5, createHash('md5').update(content).digest('hex'));
    // idempotente
    assert.equal((await (await j(`/api/uploads/${id}/complete`, 'POST')).json()).id, id);
    st = await (await j(`/api/uploads/${id}/status`)).json();
    assert.equal(st.status, 'ready');
    assert.equal(st.downloadUrl, `/files/${id}/download`);
    // após pronto
    assert.equal((await put(0, content)).status, 409);
    assert.equal((await j(`/api/uploads/${id}`, 'DELETE')).status, 409);
  });

  test('download, range, md5, páginas', async () => {
    const dl = await j(`/files/${file.id}/download`);
    assert.equal(Buffer.from(await dl.arrayBuffer()).toString(), content.toString());
    assert.match(dl.headers.get('content-disposition'), /teste\.bin/);
    const rg = await fetch(`${base}/f/${file.id}/download`, { headers: { Range: 'bytes=0-3' } });
    assert.equal(rg.status, 206);
    assert.equal(await rg.text(), '0123');
    assert.equal(await (await j(`/files/${file.id}/download.md5`)).text(), `${file.md5}  teste.bin\n`);
    assert.equal((await j(`/api/files/${file.id}`)).status, 200);
    assert.equal((await j(`/files/${file.id}`)).status, 200);
    assert.equal((await j('/f/naoexiste1')).status, 404);
    assert.equal((await j('/api/files/naoexiste1')).status, 404);
    assert.equal((await j('/api/files/!!')).status, 404);
    assert.equal((await j('/files/naoexiste1/download')).status, 404);
    assert.equal((await j('/files/naoexiste1/download.md5')).status, 404);
  });

  test('arquivo expirado e arquivo ausente no disco', async () => {
    db.prepare('UPDATE files SET expires_at = 1 WHERE id = ?').run(file.id);
    assert.equal((await j(`/api/files/${file.id}`)).status, 410);
    assert.equal((await j(`/files/${file.id}`)).status, 410);
    db.prepare('UPDATE files SET expires_at = ? WHERE id = ?').run(Date.now() + 1e6, file.id);
    const row = db.prepare('SELECT stored_name FROM files WHERE id = ?').get(file.id);
    fs.renameSync(path.join(paths.files, row.stored_name), path.join(paths.files, 'moved'));
    assert.notEqual((await j(`/files/${file.id}/download`)).status, 200);
    fs.renameSync(path.join(paths.files, 'moved'), path.join(paths.files, row.stored_name));
  });

  test('upload multi-parte e cancelamento', async () => {
    const big = Buffer.alloc(1024 * 1024 + 10, 7);
    const init = await upload('multi.bin', big);
    assert.equal(init.totalChunks, 2);
    const r = await j(`/api/uploads/${init.uploadId}/complete`, 'POST');
    assert.equal((await r.json()).sizeBytes, big.length);

    const i2 = await (await j('/api/uploads/init', 'POST', { fileName: 'c.bin', size: 10 })).json();
    assert.equal((await j(`/api/uploads/${i2.uploadId}`, 'DELETE')).status, 204);
    assert.equal((await j(`/api/uploads/${i2.uploadId}/status`)).status, 404);
    assert.equal((await j('/api/uploads/!!/status')).status, 404);
    assert.equal((await j('/api/uploads/naoexiste1/status')).status, 404);
  });

  test('estados failed / finalizing / chunk maior que o esperado', async () => {
    const i = await (await j('/api/uploads/init', 'POST', { fileName: 's.bin', size: 4 })).json();
    const id = i.uploadId;
    const big = await fetch(`${base}/api/uploads/${id}/chunk/0`, { method: 'PUT', body: Buffer.alloc(4) , headers: {}});
    assert.equal(big.status, 200);
    db.prepare("UPDATE files SET status='failed' WHERE id=?").run(id);
    assert.equal((await fetch(`${base}/api/uploads/${id}/chunk/0`, { method: 'PUT', body: Buffer.alloc(4) })).status, 410);
    assert.equal((await j(`/api/uploads/${id}/complete`, 'POST')).status, 409);
    db.prepare("UPDATE files SET status='finalizing' WHERE id=?").run(id);
    assert.equal((await j(`/api/uploads/${id}/complete`, 'POST')).status, 409);
    assert.equal((await j(`/api/uploads/${id}`, 'DELETE')).status, 409);
    db.prepare("UPDATE files SET status='uploading' WHERE id=?").run(id);
    // part removida -> complete falha e volta a 'uploading'
    fs.rmSync(path.join(paths.tmp, `${id}.part`));
    assert.equal((await j(`/api/uploads/${id}/complete`, 'POST')).status, 500);
    assert.equal(db.prepare('SELECT status FROM files WHERE id=?').get(id).status, 'uploading');
    // part removida -> chunk devolve 410
    assert.equal((await fetch(`${base}/api/uploads/${id}/chunk/0`, { method: 'PUT', body: Buffer.alloc(4) })).status, 410);
    // chunk com corpo maior que Content-Length declarado correto não é possível via fetch; testa tamanho
    const i3 = await (await j('/api/uploads/init', 'POST', { fileName: 't.bin', size: 4 })).json();
    const sz = db.prepare('UPDATE files SET size_bytes = 2 WHERE id=?'); // força expected=2
    sz.run(i3.uploadId);
    const r = await fetch(`${base}/api/uploads/${i3.uploadId}/chunk/0`, { method: 'PUT', body: Buffer.alloc(2) });
    assert.equal(r.status, 200);
  });
});

describe('admin e cleanup', () => {
  test('config get/put', async () => {
    const g = await (await j('/api/admin/config')).json();
    assert.ok(g.editableKeys.retentionDays);
    const p = await j('/api/admin/config', 'PUT', { retentionDays: 4 });
    assert.equal((await p.json()).updated.retentionDays, 4);
    assert.equal((await j('/api/admin/config', 'PUT', { retentionDays: -4 })).status, 400);
    assert.equal((await j('/api/admin/config', 'PUT', {})).status, 400);
  });

  test('extend', async () => {
    const p = await (await j('/api/pastes', 'POST', { content: 'e' })).json();
    const r = await (await j(`/api/admin/extend/${p.id}`, 'POST', { days: 2 })).json();
    assert.equal(r.type, 'paste');
    assert.ok(r.expiresAt > p.expiresAt);
    const init = await upload('ext.bin', Buffer.from('abcd'));
    await j(`/api/uploads/${init.uploadId}/complete`, 'POST');
    const f = await (await j(`/api/admin/extend/${init.uploadId}`, 'POST', { days: 1 })).json();
    assert.equal(f.type, 'file');
    assert.equal((await j(`/api/admin/extend/${p.id}`, 'POST', { days: 0 })).status, 400);
    assert.equal((await j(`/api/admin/extend/${p.id}`, 'POST', { days: 999 })).status, 400);
    assert.equal((await j(`/api/admin/extend/${p.id}`, 'POST', {})).status, 400);
    assert.equal((await j('/api/admin/extend/naoexiste1', 'POST', { days: 1 })).status, 404);
  });

  test('cleanup remove expirados, incompletos e órfãos', async () => {
    await runCleanup(); // limpa resíduos dos testes anteriores
    const p = await (await j('/api/pastes', 'POST', { content: 'old' })).json();
    db.prepare('UPDATE pastes SET expires_at = 1 WHERE id = ?').run(p.id);
    const f = await upload('old.bin', Buffer.from('abcd'));
    await j(`/api/uploads/${f.uploadId}/complete`, 'POST');
    db.prepare('UPDATE files SET expires_at = 1 WHERE id = ?').run(f.uploadId);
    const stale = await (await j('/api/uploads/init', 'POST', { fileName: 'stale.bin', size: 4 })).json();
    db.prepare('UPDATE files SET updated_at = 1 WHERE id = ?').run(stale.uploadId);

    const old = new Date(Date.now() - 3600_000);
    const orphans = [path.join(paths.pastes, 'orphan.txt'), path.join(paths.files, 'orphan.bin'), path.join(paths.tmp, 'orphan.part')];
    for (const o of orphans) { fs.writeFileSync(o, 'x'); fs.utimesSync(o, old, old); }
    const fresh = path.join(paths.files, 'fresh.bin');
    fs.writeFileSync(fresh, 'x');

    const res = await (await j('/api/admin/cleanup', 'POST')).json();
    assert.equal(res.pastes, 1);
    assert.equal(res.files, 1);
    assert.equal(res.staleUploads, 1);
    assert.equal(res.orphans, 3);
    assert.ok(fs.existsSync(fresh));
    for (const o of orphans) assert.ok(!fs.existsSync(o));
    const again = await runCleanup();
    assert.equal(again.pastes + again.files + again.orphans, 0);
  });

  test('cleanup concorrente é ignorado e agenda reage a mudança de config', async () => {
    const [a, b] = await Promise.all([runCleanup(), runCleanup()]);
    assert.ok(a.skipped || b.skipped);
    updateConfig({ cleanupIntervalMinutes: 2 });
    startCleanup();
    stopCleanup();
  });
});
