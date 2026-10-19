import { api } from './common.js';

const STORAGE_KEY = 'nulldrive.pendingUpload';
const FATAL_STATUS = new Set([400, 404, 409, 410, 413, 415, 507]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function getPending() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function savePending(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearPending() {
  localStorage.removeItem(STORAGE_KEY);
}

function abortError() {
  const e = new Error('abortado');
  e.name = 'AbortError';
  return e;
}

/**
 * Envia um arquivo em partes (chunks) com paralelismo, retentativas, pausa e retomada.
 *
 * Estados emitidos em onState: initializing | uploading | pausing | paused | finalizing | done | error | cancelled
 */
export class ChunkUploader {
  constructor(file, { concurrency = 3, maxRetries = 5, onProgress = () => {}, onState = () => {}, onNotice = () => {} } = {}) {
    this.file = file;
    this.concurrency = concurrency;
    this.maxRetries = maxRetries;
    this.onProgress = onProgress;
    this.onState = onState;
    this.onNotice = onNotice;

    this.uploadId = null;
    this.chunkSize = 0;
    this.totalChunks = 0;
    this.queue = [];
    this.done = new Set();
    this.inflight = new Map(); // idx -> { xhr, loaded }
    this.confirmedBytes = 0;
    this.samples = [];
    this.state = 'idle';
    this.paused = false;
    this.cancelled = false;
    this.fatal = null;
  }

  setState(state, data) {
    this.state = state;
    this.onState(state, data);
  }

  chunkLength(i) {
    return Math.min(this.chunkSize, this.file.size - i * this.chunkSize);
  }

  get sentBytes() {
    let b = this.confirmedBytes;
    for (const e of this.inflight.values()) b += e.loaded;
    return Math.min(b, this.file.size);
  }

  emitProgress() {
    const now = performance.now();
    const sent = this.sentBytes;
    this.samples.push({ t: now, b: sent });
    while (this.samples.length > 2 && now - this.samples[0].t > 8000) this.samples.shift();
    const first = this.samples[0];
    const dt = (now - first.t) / 1000;
    const speed = dt > 0.75 ? Math.max(0, (sent - first.b) / dt) : 0;
    const eta = speed > 0 ? (this.file.size - sent) / speed : Infinity;
    this.onProgress({
      sent,
      total: this.file.size,
      percent: this.file.size ? (sent / this.file.size) * 100 : 0,
      speed,
      eta,
      doneChunks: this.done.size,
      totalChunks: this.totalChunks,
    });
  }

  /** Inicia (ou retoma, se resumeId for válido para este arquivo). */
  async start(resumeId = null) {
    this.setState('initializing');
    try {
      let status = null;
      if (resumeId) {
        try {
          status = await api(`/api/uploads/${resumeId}/status`);
          if (status.status !== 'uploading' || status.size !== this.file.size) status = null;
        } catch {
          status = null;
        }
      }

      if (status) {
        this.uploadId = status.uploadId;
        this.chunkSize = status.chunkSize;
        this.totalChunks = status.totalChunks;
        status.received.forEach((i) => this.done.add(i));
        this.onNotice(`Retomando: ${status.received.length} de ${status.totalChunks} partes já estavam no servidor.`);
      } else {
        const init = await api('/api/uploads/init', {
          method: 'POST',
          body: JSON.stringify({ fileName: this.file.name, size: this.file.size }),
        });
        this.uploadId = init.uploadId;
        this.chunkSize = init.chunkSize;
        this.totalChunks = init.totalChunks;
      }

      savePending({
        uploadId: this.uploadId,
        name: this.file.name,
        size: this.file.size,
        lastModified: this.file.lastModified,
        savedAt: Date.now(),
      });

      for (const i of this.done) this.confirmedBytes += this.chunkLength(i);
      for (let i = 0; i < this.totalChunks; i++) if (!this.done.has(i)) this.queue.push(i);

      await this.run();
    } catch (err) {
      this.fail(err);
    }
  }

  async run() {
    this.paused = false;
    this.fatal = null;
    this.samples = [];
    this.setState('uploading');
    this.emitProgress();

    // A parte 0 vai sozinha primeiro: o servidor valida o tipo real antes de recebermos o resto
    if (this.queue[0] === 0) await this.worker(1);
    await Promise.all(Array.from({ length: this.concurrency }, () => this.worker()));

    if (this.cancelled) return;
    if (this.fatal) return this.fail(this.fatal);
    if (this.paused) return this.setState('paused');
    if (this.done.size === this.totalChunks) {
      try {
        await this.complete();
      } catch (err) {
        this.fail(err);
      }
    }
  }

  async worker(limit = Infinity) {
    let n = 0;
    while (!this.paused && !this.cancelled && !this.fatal && this.queue.length && n < limit) {
      const idx = this.queue.shift();
      n++;
      try {
        await this.sendWithRetry(idx);
        this.done.add(idx);
        this.confirmedBytes += this.chunkLength(idx);
      } catch (err) {
        if (err.name === 'AbortError') {
          this.queue.unshift(idx);
        } else {
          this.fatal = err;
          this.abortAll();
        }
      } finally {
        this.inflight.delete(idx);
        this.emitProgress();
      }
    }
  }

  async sendWithRetry(idx) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.sendChunk(idx);
      } catch (err) {
        if (err.name === 'AbortError' || err.fatal || attempt >= this.maxRetries) throw err;
        const delay = Math.min(30000, 1000 * 2 ** attempt);
        this.onNotice(`Falha na parte ${idx + 1} (${err.message}). Nova tentativa ${attempt + 1}/${this.maxRetries} em ${delay / 1000}s…`);
        for (let w = 0; w < delay; w += 250) {
          if (this.paused || this.cancelled || this.fatal) throw abortError();
          await wait(250);
        }
      }
    }
  }

  sendChunk(idx) {
    return new Promise((resolve, reject) => {
      const start = idx * this.chunkSize;
      const blob = this.file.slice(start, start + this.chunkLength(idx));
      const xhr = new XMLHttpRequest();
      const entry = { xhr, loaded: 0 };
      this.inflight.set(idx, entry);

      xhr.open('PUT', `/api/uploads/${this.uploadId}/chunk/${idx}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (e) => {
        entry.loaded = e.loaded;
        this.emitProgress();
      };
      xhr.onload = () => {
        entry.loaded = 0;
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let msg = null;
        try {
          msg = JSON.parse(xhr.responseText).error;
        } catch {
          /* resposta não-JSON */
        }
        const err = new Error(msg || `Erro ${xhr.status} na parte ${idx + 1}`);
        err.status = xhr.status;
        err.fatal = FATAL_STATUS.has(xhr.status);
        reject(err);
      };
      xhr.onerror = () => {
        entry.loaded = 0;
        reject(new Error('falha de rede'));
      };
      xhr.onabort = () => {
        entry.loaded = 0;
        reject(abortError());
      };
      xhr.send(blob);
    });
  }

  abortAll() {
    for (const { xhr } of this.inflight.values()) xhr.abort();
  }

  async complete() {
    this.setState('finalizing');
    let result;
    try {
      result = await api(`/api/uploads/${this.uploadId}/complete`, { method: 'POST' });
    } catch (err) {
      // Rede caiu ou já está finalizando: o servidor pode continuar calculando o MD5
      if (err.status && !(err.status === 409 && /finalizado/.test(err.message))) throw err;
      result = await this.pollUntilReady();
    }
    clearPending();
    this.setState('done', result);
  }

  async pollUntilReady() {
    for (let i = 0; i < 1200; i++) {
      await wait(3000);
      let s;
      try {
        s = await api(`/api/uploads/${this.uploadId}/status`);
      } catch (err) {
        if (err.status === 404) throw err;
        continue;
      }
      if (s.status === 'ready') return s;
      if (s.status !== 'finalizing') throw new Error('A finalização falhou. Selecione o arquivo novamente para tentar de novo.');
    }
    throw new Error('Tempo esgotado aguardando a finalização');
  }

  pause() {
    if (this.state !== 'uploading') return;
    this.paused = true;
    this.setState('pausing');
    this.abortAll();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.run();
  }

  async cancel() {
    this.cancelled = true;
    this.abortAll();
    clearPending();
    this.setState('cancelled');
    if (this.uploadId) {
      try {
        await api(`/api/uploads/${this.uploadId}`, { method: 'DELETE' });
      } catch {
        /* já removido */
      }
    }
  }

  fail(err) {
    if (this.cancelled) return;
    // Erros definitivos (tipo inválido, muito grande...) não podem ser retomados
    if (err.status && err.status >= 400 && err.status < 500) clearPending();
    this.setState('error', err);
  }
}
