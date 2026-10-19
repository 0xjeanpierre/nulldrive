import path from 'node:path';
import express from 'express';
import { config, publicConfig, CONFIG_PATH } from './config.js';
import { db, closeDb, DB_FILE } from './db.js';
import pastesRouter from './routes/pastes.js';
import uploadsRouter from './routes/uploads.js';
import adminRouter from './routes/admin.js';
import docsRouter from './routes/docs.js';
import { startCleanup, stopCleanup } from './services/cleanup.js';

const PUBLIC_DIR = path.resolve('public');
const app = express();
app.disable('x-powered-by');

// ---------- Auxiliares e Estatísticas ----------
const healthStmt = db.prepare('SELECT 1 AS ok');
const statsStmts = {
  pastes: db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes FROM pastes WHERE expires_at > ?`),
  files: db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes FROM files WHERE status = 'ready' AND expires_at > ?`),
};

export function getStats() {
  const now = Date.now();
  const p = statsStmts.pastes.get(now);
  const f = statsStmts.files.get(now);
  const totalCount = p.count + f.count;
  const totalBytes = p.bytes + f.bytes;
  return {
    totalFiles: f.count,
    totalPastes: p.count,
    totalItems: totalCount,
    totalSizeBytes: totalBytes,
  };
}

app.get('/api/health', (req, res) => {
  healthStmt.get();
  res.json({ status: 'ok' });
});

app.get('/api/stats', (req, res) => res.json(getStats()));

app.get('/api/config/public', (req, res) => {
  res.json({
    ...publicConfig(),
    stats: getStats(),
  });
});

// ---------- Estáticos e rotas ----------
app.use(docsRouter);
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], index: 'index.html' }));
app.use(pastesRouter);
app.use(uploadsRouter);
app.use('/api/admin', adminRouter);

// ---------- 404 ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
app.use((req, res) => res.status(404).send(errorPage(404, 'Página não encontrada')));

// ---------- Erros ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function errorPage(status, message) {
  return `<!doctype html><html lang="pt-BR" data-theme="dark"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${status} – nulldrive</title><meta name="description" content="${escapeHtml(message)}">
<script>try{document.documentElement.dataset.theme=localStorage.getItem('nulldrive.theme')==='light'?'light':'dark';document.documentElement.lang=localStorage.getItem('nulldrive.lang')==='en-US'?'en-US':'pt-BR'}catch{}</script>
<link rel="stylesheet" href="/css/style.css"></head>
<body><div class="bg-glow" aria-hidden="true"></div><main class="container narrow center-page">
<section class="card state-card"><div class="state-code">${status}</div>
<h1 id="err-h1">${escapeHtml(message)}</h1><p class="muted" id="err-p">O link pode ter expirado ou nunca ter existido.</p>
<a class="btn btn-primary" href="/" id="btn-home">Voltar ao início</a></section></main>
<script>if(document.documentElement.lang==='en-US'){if(${status}===404)document.getElementById('err-h1').textContent='Page not found';document.getElementById('err-p').textContent='The link may have expired or never existed.';document.getElementById('btn-home').textContent='Back to home'}</script>
</body></html>`;
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Erro interno';
  if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Conteúdo excede o limite permitido';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'JSON inválido';
  } else if (status >= 500) {
    console.error(`[erro] ${req.method} ${req.originalUrl}:`, err);
    message = status === 500 ? 'Erro interno do servidor' : message;
  }

  if (res.headersSent) return res.destroy();
  // Corpo não lido (ex.: chunk rejeitado antes do pipe): fecha a conexão para não corromper o keep-alive
  if (!req.complete) res.set('Connection', 'close');

  if (req.path.startsWith('/api/')) {
    return res.status(status).json({ error: message, ...(err.extra || {}) });
  }
  res.status(status).send(errorPage(status, message));
});

// ---------- Servidor ----------
const server = app.listen(config.port, config.host, () => {
  console.log(`[nulldrive] Ouvindo em http://${config.host}:${config.port}`);
  console.log(`[nulldrive] Config: ${CONFIG_PATH}`);
  console.log(`[nulldrive] Storage: ${config.storageDir} | DB: ${DB_FILE}`);
  console.log(
    `[nulldrive] Retenção: ${config.retentionDays} dia(s) | Limite: ${(config.maxFileSizeBytes / 1024 ** 3).toFixed(2)} GB | ` +
      `Chunk: ${(config.chunkSizeBytes / 1024 ** 2).toFixed(0)} MB`
  );
  startCleanup();
});

// Uploads/downloads de vários GB podem levar horas
server.requestTimeout = 0;
server.timeout = 0;
server.headersTimeout = 65_000;
server.keepAliveTimeout = 61_000;

// ---------- Encerramento gracioso ----------
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[nulldrive] ${signal} recebido, encerrando...`);
  stopCleanup();
  server.closeIdleConnections?.();

  const force = setTimeout(() => {
    console.warn('[nulldrive] Encerrando conexões ativas à força.');
    server.closeAllConnections?.();
  }, 20_000);
  force.unref();

  server.close(() => {
    closeDb();
    console.log('[nulldrive] Encerrado.');
    process.exit(0);
  });
  setTimeout(() => {
    closeDb();
    process.exit(0);
  }, 25_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
