// Regressão: "Criar paste" não funcionava.
// Causa: app.js chamava updateCounter() no top-level antes de declarar `let counterRaf`
// (TDZ: "Cannot access 'counterRaf' before initialization"). O erro interrompia o módulo
// e o listener de submit do formulário nunca era registrado.
//
// Este teste importa o app.js REAL (não uma cópia) com um DOM mínimo simulado.
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------- DOM mínimo simulado ----------
class El {
  constructor() {
    this.dataset = {};
    this.attrs = {};
    this.listeners = {};
    this.children = [];
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.href = '';
    this.className = '';
    const classes = new Set();
    this.classList = {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      has: (c) => classes.has(c),
      toggle: (c, force) => {
        const on = force ?? !classes.has(c);
        on ? classes.add(c) : classes.delete(c);
        return on;
      },
    };
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  appendChild(c) { this.children.push(c); return c; }
  append(...c) { this.children.push(...c); }
  addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  querySelector() { return new El(); }
  querySelectorAll() { return []; }
  focus() {}
  reset() {}
  remove() {}
  fire(ev, arg) { (this.listeners[ev] || []).forEach((f) => f(arg)); }
}

const els = new Map();
const el = (sel) => {
  if (!els.has(sel)) els.set(sel, new El());
  return els.get(sel);
};

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.document = {
  title: '',
  documentElement: new El(),
  body: new El(),
  querySelector: (s) => el(s),
  querySelectorAll: () => [],
  getElementById: (id) => el(`#${id}`),
  createElement: () => new El(),
};
globalThis.window = {
  addEventListener() {},
  dispatchEvent() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
};
globalThis.location = { origin: 'http://x.test', pathname: '/', hash: '' };
globalThis.history = { replaceState() {} };
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => {} } }, configurable: true });

// ---------- fetch simulado ----------
const CONFIG = {
  retentionDays: 3,
  maxFileSizeBytes: 1024 ** 3,
  chunkSizeBytes: 50 * 1024 ** 2,
  allowedExtensions: [],
  maxPasteSizeBytes: 10 * 1024 ** 2,
  stats: { totalFiles: 0, totalPastes: 0, totalItems: 0, totalSizeBytes: 0 },
};
let calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
  if (String(url).startsWith('/api/config/public')) return respond(200, CONFIG);
  if (url === '/api/pastes' && opts.method === 'POST') {
    const { content } = JSON.parse(opts.body);
    return respond(201, { id: 'abc123', url: '/pastes/abc123', md5: 'd41d8cd9', title: null, sizeBytes: Buffer.byteLength(content), fileName: 'paste-abc123.txt' });
  }
  return respond(404, { error: 'não mapeado no teste' });
};
function respond(status, body) {
  const text = JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

const flush = () => new Promise((r) => setTimeout(r, 30));
const postCalls = () => calls.filter((c) => c.url === '/api/pastes' && c.method === 'POST');

// ---------- carregamento do app.js real ----------
let loadError = null;
before(async () => {
  el('#paste-result').classList.add('hidden'); // estado inicial do index.html
  try {
    await import('../app/public/js/app.js');
    await flush();
  } catch (err) {
    loadError = err;
  }
});

// Não limpamos `els`: os listeners foram registrados no carregamento do módulo.
// Só restauramos o estado visual inicial do formulário e as chamadas de fetch.
beforeEach(() => {
  calls = [];
  el('#paste-result').classList.add('hidden');
  el('#paste-form').classList.remove('hidden');
  el('#paste-content').value = '';
});

describe('app.js – criação de paste (regressão do bug "Criar paste não funciona")', () => {
  test('o módulo app.js carrega sem erro (sem TDZ em counterRaf)', () => {
    assert.equal(loadError, null, `app.js lançou erro ao carregar: ${loadError?.message}`);
  });

  test('clicar em "Criar paste" com texto envia POST /api/pastes e mostra o resultado', async () => {
    assert.equal(loadError, null, `app.js não carregou: ${loadError?.message}`);
    // Os elementos já existem (criados pelo módulo); usamos as mesmas instâncias.
    el('#paste-content').value = 'texto de teste';
    el('#paste-form').fire('submit', { preventDefault() {} });
    await flush();

    const posts = postCalls();
    assert.equal(posts.length, 1, 'deveria ter enviado exatamente um POST /api/pastes');
    assert.equal(JSON.parse(posts[0].body).content, 'texto de teste');
    assert.equal(el('#paste-result').classList.contains('hidden'), false, 'o bloco de resultado deveria aparecer');
    assert.equal(el('#paste-form').classList.contains('hidden'), true, 'o formulário deveria ser escondido');
    assert.equal(el('#paste-link').value, 'http://x.test/pastes/abc123');
    assert.equal(el('#paste-md5').value, 'd41d8cd9');
  });

  test('envio com conteúdo só de espaços não faz requisição', async () => {
    assert.equal(loadError, null, `app.js não carregou: ${loadError?.message}`);
    el('#paste-content').value = '   \n  ';
    el('#paste-form').fire('submit', { preventDefault() {} });
    await flush();

    assert.equal(postCalls().length, 0);
    assert.equal(el('#paste-result').classList.contains('hidden'), true);
  });

  test('o botão "Criar paste" fica habilitado para texto dentro do limite', async () => {
    assert.equal(loadError, null, `app.js não carregou: ${loadError?.message}`);
    el('#paste-content').value = 'abc';
    el('#paste-content').fire('input');
    await flush();

    assert.equal(el('#btn-create-paste').disabled, false);
  });
});
