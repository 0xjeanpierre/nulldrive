import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------- DOM mínimo simulado ----------
class El {
  constructor(tag = 'div') {
    this.tagName = tag; this.dataset = {}; this.attrs = {}; this.children = []; this.listeners = {};
    this.classList = { s: new Set(), add: (c) => this.classList.s.add(c), contains: (c) => this.classList.s.has(c) };
    this.textContent = ''; this.innerHTML = ''; this.value = ''; this.className = ''; this.title = ''; this.placeholder = '';
    this.sel = {};
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  querySelector(s) { return this.sel[s] ?? null; }
  querySelectorAll(s) { return this.all?.[s] ?? []; }
  appendChild(c) { this.children.push(c); return c; }
  append(...c) { this.children.push(...c); }
  addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  remove() { this.removed = true; }
  fire(ev, arg) { (this.listeners[ev] || []).forEach((f) => f(arg)); }
}
const store = new Map();
const byId = {};
const docEl = new El('html');
const winListeners = {};
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = {
  documentElement: docEl,
  body: new El('body'),
  getElementById: (id) => byId[id] ?? null,
  createElement: (t) => new El(t),
  querySelector: (s) => byId[s.replace(/^#/, '')] ?? (s === 'meta[name="theme-color"]' ? byId.meta ?? null : null),
  querySelectorAll: (s) => globalThis.__cfgEls?.[s] ?? [],
};
globalThis.window = { dispatchEvent: (e) => (winListeners[e.type] ||= []).push(e) };
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.location = { origin: 'http://x.test' };
const cfgFetch = { retentionDays: 1, maxFileSizeBytes: 1024 ** 3, chunkSizeBytes: 1024, allowedExtensions: ['.zip'], maxPasteSizeBytes: 1024 ** 2, stats: { totalFiles: 1, totalPastes: 2, totalItems: 3, totalSizeBytes: 2048 } };
let fetchImpl = async (url) => resp(200, cfgFetch);
function resp(status, body, raw) {
  const text = raw ?? (body === undefined ? '' : JSON.stringify(body));
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}
globalThis.fetch = (...a) => fetchImpl(...a);
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => {} } }, configurable: true });

const C = await import('../app/public/js/common.js');
const U = await import('../app/public/js/uploader.js');

beforeEach(() => { store.clear(); Object.keys(byId).forEach((k) => delete byId[k]); globalThis.__cfgEls = {}; });

describe('common.js', () => {
  test('idioma e t()', () => {
    assert.equal(C.getLang(), 'pt-BR');
    C.setLang('en-US');
    assert.equal(C.getLang(), 'en-US');
    assert.equal(docEl.lang, 'en-US');
    assert.equal(C.t('common.md5Copied'), 'MD5 copied!');
    assert.equal(C.t('chave.inexistente'), 'chave.inexistente');
    C.setLang('xx');
    assert.equal(C.getLang(), 'pt-BR');
    assert.equal(C.t('common.md5Copied'), 'MD5 copiado!');
    C.TRANSLATIONS['pt-BR']['_v'] = 'a {x} {x}';
    assert.equal(C.t('_v', { x: 1 }), 'a 1 1');
    localStorage.setItem('nulldrive.lang', 'fr');
    assert.equal(C.getLang(), 'pt-BR');
  });

  test('tema', () => {
    assert.equal(C.getTheme(), 'dark');
    const meta = (byId.meta = new El('meta'));
    const btn = (byId['btn-theme'] = new El('button'));
    C.setTheme('light');
    assert.equal(C.getTheme(), 'light');
    assert.equal(docEl.dataset.theme, 'light');
    assert.equal(meta.attrs.content, '#f6f7f9');
    assert.equal(btn.attrs['aria-checked'], 'true');
    assert.match(btn.innerHTML, /theme-switch-track/);
    C.setTheme('whatever');
    assert.equal(meta.attrs.content, '#16181d');
    // botão já preparado: não recria
    btn.sel['.theme-switch-track'] = new El();
    btn.innerHTML = 'keep';
    C.setTheme('light');
    assert.equal(btn.innerHTML, 'keep');
  });

  test('applyTranslations / initPreferences', async () => {
    const mk = (attr, key) => { const e = new El(); e.dataset[attr] = key; return e; };
    const a = mk('i18n', 'common.md5Copied'), b = mk('i18nHtml', 'common.withMd5'), c = mk('i18nPlaceholder', 'common.withMd5'),
      d = mk('i18nAria', 'common.withMd5'), e = mk('i18nCopyMsg', 'common.withMd5');
    const root = new El();
    root.all = { '[data-i18n]': [a], '[data-i18n-html]': [b], '[data-i18n-placeholder]': [c], '[data-i18n-aria]': [d], '[data-i18n-copy-msg]': [e] };
    const sel = (byId['lang-select'] = new El('select'));
    byId['btn-theme'] = new El('button');
    C.applyTranslations(root);
    assert.equal(a.textContent, 'MD5 copiado!');
    assert.equal(b.innerHTML, 'Com .md5');
    assert.equal(c.placeholder, 'Com .md5');
    assert.equal(d.attrs['aria-label'], 'Com .md5');
    assert.equal(e.dataset.copyMsg, 'Com .md5');
    assert.equal(sel.value, 'pt-BR');
    C.initPreferences();
    C.initPreferences(); // já ligados
    byId['btn-theme'].fire('click');
    assert.equal(C.getTheme(), 'light');
    byId['btn-theme'].fire('click');
    assert.equal(C.getTheme(), 'dark');
    sel.fire('change', { target: { value: 'en-US' } });
    assert.equal(C.getLang(), 'en-US');
    await new Promise((r) => setImmediate(r));
  });

  test('api', async () => {
    fetchImpl = async () => resp(200, { a: 1 });
    assert.deepEqual(await C.api('/x', { headers: { H: '1' } }), { a: 1 });
    fetchImpl = async () => resp(204, undefined, '');
    assert.equal(await C.api('/x'), null);
    fetchImpl = async () => resp(200, undefined, 'não-json');
    assert.equal(await C.api('/x'), null);
    fetchImpl = async () => resp(400, { error: 'ruim' });
    await assert.rejects(C.api('/x'), (e) => e.status === 400 && e.message === 'ruim' && e.data.error === 'ruim');
    fetchImpl = async () => resp(500, undefined, 'html');
    await assert.rejects(C.api('/x'), /Error 500/);
  });

  test('formatadores', () => {
    assert.equal(C.formatBytes(0), '0 B');
    assert.equal(C.formatBytes(NaN), '0 B');
    assert.equal(C.formatBytes(512), '512 B');
    assert.equal(C.formatBytes(1536), '1,5 KB');
    assert.equal(C.formatBytes(1024 ** 5), '1024,0 TB');
    C.setLang('en-US');
    assert.equal(C.formatBytes(1536), '1.5 KB');
    C.setLang('pt-BR');
    assert.equal(C.formatDuration(-1), '—');
    assert.equal(C.formatDuration(Infinity), '—');
    assert.equal(C.formatDuration(5), '5s');
    assert.equal(C.formatDuration(65), '1m 05s');
    assert.equal(C.formatDuration(3700), '1h 01m');
    assert.equal(C.formatRemaining(0), C.t('common.expired'));
    assert.equal(C.formatRemaining(3661000), '01h 01m 01s');
    assert.equal(C.formatRemaining(90061000), '1d 01h 01m 01s');
    assert.ok(C.formatDate(0).length > 0);
    assert.equal(C.formatRetention(1), '1 dia');
    assert.equal(C.formatRetention(2.5), '2,5 dias');
    assert.equal(C.formatRetention(0.01), '1 hora');
    assert.equal(C.formatRetention(0.5), '12 horas');
    C.setLang('en-US');
    assert.equal(C.formatRetention(1), '1 day');
    assert.equal(C.formatRetention(2.5), '2.5 days');
    assert.equal(C.formatRetention(0.01), '1 hour');
    assert.equal(C.formatRetention(0.5), '12 hours');
  });

  test('startCountdown', async () => {
    const el = new El();
    let expired = 0;
    C.startCountdown(el, Date.now() - 1, () => expired++);
    assert.equal(expired, 1);
    const el2 = new El();
    const stop = C.startCountdown(el2, Date.now() + 60_000);
    assert.match(el2.textContent, /m/);
    stop();
    C.startCountdown(new El(), Date.now() - 1); // sem onExpire
  });

  test('toast', () => {
    C.toast('oi');
    const root = document.body.children[0];
    assert.equal(root.id, 'toast-root');
    byId['toast-root'] = root;
    C.toast('erro', 'error');
    assert.equal(root.children.length, 2);
    assert.equal(root.children[1].className, 'toast error');
  });

  test('copyText e bindCopyButtons', async () => {
    let copied;
    navigator.clipboard.writeText = async (v) => { copied = v; };
    byId['toast-root'] = new El();
    await C.copyText('abc');
    assert.equal(copied, 'abc');
    navigator.clipboard.writeText = async () => { throw new Error('x'); };
    await C.copyText('abc');
    assert.equal(byId['toast-root'].children.at(-1).className, 'toast error');
    navigator.clipboard.writeText = async (v) => { copied = v; };

    const mkBtn = (target, extra = {}) => { const b = new El('button'); b.dataset = { copyTarget: target, ...extra }; return b; };
    const b1 = mkBtn('#in'), b2 = mkBtn('#txt', { i18nCopyMsg: 'common.md5Copied' }), b3 = mkBtn('#txt', { copyMsg: 'm' }), b4 = mkBtn('#nada');
    byId.in = Object.assign(new El(), { value: 'VAL' });
    byId.txt = (() => { const e = new El(); delete e.value; e.textContent = 'TXT'; return e; })();
    const root = new El();
    root.all = { '[data-copy-target]': [b1, b2, b3, b4] };
    C.bindCopyButtons(root);
    for (const b of [b1, b2, b3, b4]) b.fire('click');
    await new Promise((r) => setImmediate(r));
    assert.equal(copied, 'TXT');
  });

  test('utilidades de arquivo e URL', () => {
    assert.equal(C.absoluteUrl('/a'), 'http://x.test/a');
    assert.equal(C.getExtension('A.ZIP'), '.zip');
    assert.equal(C.getExtension('.hidden'), '');
    assert.equal(C.fileBadge('a.tar.gz'), 'gz');
    assert.equal(C.fileBadge('semext'), 'file');
    assert.equal(C.fileBadge('a.abcdefgh'), 'abcd');
  });

  test('getPublicConfig e fillConfigText', async () => {
    fetchImpl = async () => resp(200, cfgFetch);
    const els = {};
    const names = ['retention', 'maxFile', 'maxPaste', 'exts', 'usedStorage', 'totalFiles', 'filesCount', 'pastesCount', 'desconhecido'];
    globalThis.__cfgEls = { '[data-cfg]': names.map((n) => (els[n] = Object.assign(new El(), { dataset: { cfg: n } }))) };
    await C.fillConfigText(true);
    assert.equal(els.retention.textContent, '1 dia');
    assert.equal(els.exts.textContent, '.zip');
    assert.equal(els.totalFiles.textContent, '3');
    assert.equal(els.desconhecido.textContent, '');
    // falha -> fallback
    fetchImpl = async () => { throw new Error('rede'); };
    const fb = await C.getPublicConfig(true);
    assert.equal(fb.retentionDays, 3);
    fetchImpl = async () => resp(200, { ...cfgFetch, allowedExtensions: [], stats: undefined });
    await C.fillConfigText(true);
    assert.equal(els.exts.textContent, C.t('home.anyType'));
    assert.equal(await C.getPublicConfig(), await C.getPublicConfig());
  });
});

// ---------- uploader.js ----------
class FakeXHR {
  static handler = () => ({ status: 200, body: '{}' });
  static instances = [];
  constructor() { this.upload = {}; FakeXHR.instances.push(this); }
  open(m, url) { this.url = url; }
  setRequestHeader() {}
  send(blob) {
    this.blob = blob;
    setImmediate(() => {
      if (this.aborted) return;
      this.upload.onprogress?.({ loaded: blob.size ?? 1 });
      const r = FakeXHR.handler(this);
      if (r.error) return this.onerror();
      this.status = r.status; this.responseText = r.body ?? '';
      this.onload();
    });
  }
  abort() { this.aborted = true; setImmediate(() => this.onabort()); }
}
globalThis.XMLHttpRequest = FakeXHR;
const mkFile = (size, name = 'f.bin') => ({ name, size, lastModified: 1, slice: (a, b) => ({ size: b - a }) });

describe('uploader.js', () => {
  beforeEach(() => { FakeXHR.instances = []; FakeXHR.handler = () => ({ status: 200, body: '{}' }); });

  test('pending storage', () => {
    assert.equal(U.getPending(), null);
    U.savePending({ a: 1 });
    assert.deepEqual(U.getPending(), { a: 1 });
    localStorage.setItem('nulldrive.pendingUpload', '{ruim');
    assert.equal(U.getPending(), null);
    U.clearPending();
    assert.equal(U.getPending(), null);
  });

  const routes = (overrides = {}) => async (url, opts = {}) => {
    for (const [pat, fn] of Object.entries(overrides)) if (url.includes(pat) && (!fn.method || fn.method === (opts.method || 'GET'))) return fn(url, opts);
    if (url.endsWith('/api/uploads/init')) return resp(201, { uploadId: 'up1', chunkSize: 4, totalChunks: 3 });
    if (url.endsWith('/complete')) return resp(200, { id: 'up1', url: '/files/up1' });
    return resp(200, {});
  };

  test('fluxo completo', async () => {
    fetchImpl = routes();
    const states = [], progress = [];
    const up = new U.ChunkUploader(mkFile(10), { concurrency: 2, onState: (s, d) => states.push([s, d]), onProgress: (p) => progress.push(p) });
    await up.start();
    assert.deepEqual(states.map((s) => s[0]), ['initializing', 'uploading', 'finalizing', 'done']);
    assert.equal(up.done.size, 3);
    assert.equal(up.chunkLength(2), 2);
    assert.equal(up.sentBytes, 10);
    assert.equal(U.getPending(), null);
    assert.ok(progress.at(-1).percent > 0);
    assert.deepEqual(FakeXHR.instances.map((x) => x.url).sort(), [0, 1, 2].map((i) => `/api/uploads/up1/chunk/${i}`));
  });

  test('retomada válida e inválida', async () => {
    const notices = [];
    fetchImpl = routes({ '/status': () => resp(200, { uploadId: 'up1', status: 'uploading', size: 10, chunkSize: 4, totalChunks: 3, received: [0, 1] }) });
    const up = new U.ChunkUploader(mkFile(10), { onNotice: (n) => notices.push(n) });
    await up.start('up1');
    assert.equal(up.state, 'done');
    assert.equal(FakeXHR.instances.length, 1);
    assert.equal(notices.length, 1);

    FakeXHR.instances = [];
    fetchImpl = routes({ '/status': () => resp(200, { status: 'ready', size: 10 }) });
    const up2 = new U.ChunkUploader(mkFile(10));
    await up2.start('old');
    assert.equal(up2.uploadId, 'up1');
    fetchImpl = routes({ '/status': () => resp(404, { error: 'x' }) });
    const up3 = new U.ChunkUploader(mkFile(10));
    await up3.start('old');
    assert.equal(up3.state, 'done');
  });

  test('erro fatal no init e na parte', async () => {
    fetchImpl = routes({ '/init': () => resp(415, { error: 'tipo' }) });
    U.savePending({ x: 1 });
    const up = new U.ChunkUploader(mkFile(10));
    let err;
    up.onState = (s, d) => { if (s === 'error') err = d; };
    await up.start();
    assert.equal(err.status, 415);
    assert.equal(U.getPending(), null);

    fetchImpl = routes();
    FakeXHR.handler = () => ({ status: 413, body: '{"error":"grande"}' });
    const up2 = new U.ChunkUploader(mkFile(10), { onState: (s, d) => { if (s === 'error') err = d; } });
    await up2.start();
    assert.equal(err.message, 'grande');
    assert.ok(err.fatal);

    FakeXHR.handler = () => ({ status: 400, body: 'html' });
    const up3 = new U.ChunkUploader(mkFile(10), { onState: (s, d) => { if (s === 'error') err = d; } });
    await up3.start();
    assert.match(err.message, /Erro 400/);
  });

  test('retentativa após falha de rede e esgotamento', async () => {
    fetchImpl = routes();
    let n = 0;
    FakeXHR.handler = () => (n++ === 0 ? { error: true } : { status: 200 });
    const notices = [];
    const up = new U.ChunkUploader(mkFile(4), { onNotice: (m) => notices.push(m) });
    up.chunkSize = 4; // evita espera real? ainda aguarda 1s no retry
    await up.start();
    assert.equal(up.state, 'done');
    assert.equal(notices.length, 1);

    FakeXHR.handler = () => ({ error: true });
    let err;
    const up2 = new U.ChunkUploader(mkFile(4), { maxRetries: 0, onState: (s, d) => { if (s === 'error') err = d; } });
    await up2.start();
    assert.ok(err);
  });

  test('pausa, retomada e cancelamento', async () => {
    fetchImpl = routes();
    const states = [];
    FakeXHR.handler = () => ({ status: 200 });
    const up = new U.ChunkUploader(mkFile(10), { concurrency: 1, onState: (s) => { states.push(s); if (s === 'uploading' && states.filter((x) => x === 'uploading').length === 1) setImmediate(() => up.pause()); } });
    up.resume(); // estado inválido: ignorado
    up.pause(); // idem
    await up.start();
    assert.equal(up.state, 'paused');
    up.resume();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(up.state, 'done');

    // cancelamento
    let deleted = false;
    fetchImpl = routes({ '/api/uploads/up1': Object.assign(() => { deleted = true; return resp(204, undefined, ''); }, { method: 'DELETE' }) });
    FakeXHR.handler = () => ({ status: 200 });
    const up2 = new U.ChunkUploader(mkFile(10));
    up2.uploadId = 'up1';
    await up2.cancel();
    assert.equal(up2.state, 'cancelled');
    assert.ok(deleted);
    up2.fail(new Error('ignorado'));
    assert.equal(up2.state, 'cancelled');
    fetchImpl = async () => resp(500, {});
    const up3 = new U.ChunkUploader(mkFile(10));
    up3.uploadId = 'x';
    await up3.cancel();
    const up4 = new U.ChunkUploader(mkFile(10));
    await up4.cancel(); // sem uploadId
  });

  test('complete: 409 finalizando -> polling; erro -> fail', async () => {
    const wait = globalThis.setTimeout;
    globalThis.setTimeout = (fn) => wait(fn, 0); // acelera os waits de 3s
    try {
      let polls = 0;
      fetchImpl = routes({
        '/complete': () => resp(409, { error: 'Upload já está sendo finalizado' }),
        '/status': () => (++polls === 1 ? resp(500, {}) : resp(200, { status: polls === 2 ? 'finalizing' : 'ready', id: 'up1' })),
      });
      const up = new U.ChunkUploader(mkFile(4));
      up.uploadId = 'up1';
      await up.complete();
      assert.equal(up.state, 'done');

      fetchImpl = routes({ '/complete': () => { throw new Error('rede'); }, '/status': () => resp(200, { status: 'failed' }) });
      const up2 = new U.ChunkUploader(mkFile(4));
      up2.uploadId = 'up1';
      await assert.rejects(up2.complete(), /finalização falhou/);

      fetchImpl = routes({ '/complete': () => { throw new Error('rede'); }, '/status': () => resp(404, { error: 'n' }) });
      const up3 = new U.ChunkUploader(mkFile(4));
      up3.uploadId = 'up1';
      await assert.rejects(up3.complete());

      fetchImpl = routes({ '/complete': () => resp(500, { error: 'boom' }) });
      const up4 = new U.ChunkUploader(mkFile(4));
      up4.uploadId = 'up1';
      await assert.rejects(up4.complete(), /boom/);

      fetchImpl = routes({ '/complete': () => { throw new Error('rede'); }, '/status': () => { throw new Error('rede'); } });
      const up5 = new U.ChunkUploader(mkFile(4));
      up5.uploadId = 'up1';
      await assert.rejects(up5.complete(), /Tempo esgotado/);
    } finally {
      globalThis.setTimeout = wait;
    }
  });

  test('run: falha em complete vira erro; arquivo vazio', async () => {
    fetchImpl = routes({ '/complete': () => resp(500, { error: 'boom' }) });
    let err;
    const up = new U.ChunkUploader(mkFile(4), { onState: (s, d) => { if (s === 'error') err = d; } });
    await up.start();
    assert.equal(err.message, 'boom');
    const e = new U.ChunkUploader(mkFile(0));
    e.emitProgress();
  });
});
