import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config, paths } from '../config.js';
import { db } from '../db.js';
import { newId, md5Buffer, md5FileContent } from '../utils/hash.js';
import { sanitizeFileName } from '../services/validate.js';
import { HttpError, asyncHandler, DAY_MS } from '../utils/http.js';

const router = express.Router();
const PUBLIC_DIR = path.resolve('public');

const stmts = {
  insert: db.prepare(
    `INSERT INTO pastes (id, title, size_bytes, md5, created_at, expires_at)
     VALUES (@id, @title, @size_bytes, @md5, @created_at, @expires_at)`
  ),
  get: db.prepare(`SELECT * FROM pastes WHERE id = ?`),
};

// O limite do JSON acompanha a config (pode mudar em runtime). JSON escapa caracteres,
// então damos folga; o limite real do conteúdo é validado em bytes UTF-8 abaixo.
const jsonParsers = new Map();
function jsonBody(req, res, next) {
  const limit = config.maxPasteSizeBytes * 6 + 64 * 1024;
  if (!jsonParsers.has(limit)) jsonParsers.set(limit, express.json({ limit }));
  return jsonParsers.get(limit)(req, res, next);
}

const pastePath = (id) => path.join(paths.pastes, `${id}.txt`);
const isValidId = (id) => /^[A-Za-z0-9_-]{4,32}$/.test(id);

function downloadName(row) {
  const base = row.title ? sanitizeFileName(row.title, '').replace(/\.txt$/i, '') : '';
  return `${base || `paste-${row.id}`}.txt`;
}

/** Busca o paste e lança 404/410 conforme o caso. */
function loadPaste(id) {
  if (!isValidId(id)) throw new HttpError(404, 'Paste não encontrado');
  const row = stmts.get.get(id);
  if (!row) throw new HttpError(404, 'Paste não encontrado');
  if (row.expires_at <= Date.now()) throw new HttpError(410, 'Este paste expirou');
  return row;
}

function toDto(row) {
  return {
    id: row.id,
    title: row.title,
    sizeBytes: row.size_bytes,
    md5: row.md5,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    fileName: downloadName(row),
    url: `/pastes/${row.id}`,
  };
}

// ---------- API ----------

router.post(
  '/api/pastes',
  jsonBody,
  asyncHandler(async (req, res) => {
    const { title, content } = req.body ?? {};
    if (typeof content !== 'string' || content.trim() === '') {
      throw new HttpError(400, 'O conteúdo não pode ficar vazio');
    }
    const buf = Buffer.from(content, 'utf8');
    if (buf.length > config.maxPasteSizeBytes) {
      throw new HttpError(413, `O texto excede o limite de ${config.maxPasteSizeBytes} bytes`);
    }
    const cleanTitle = typeof title === 'string' ? title.trim().slice(0, 200) || null : null;

    const now = Date.now();
    const row = {
      id: newId(),
      title: cleanTitle,
      size_bytes: buf.length,
      md5: md5Buffer(buf),
      created_at: now,
      expires_at: Math.round(now + config.retentionDays * DAY_MS),
    };
    await fs.promises.writeFile(pastePath(row.id), buf);
    stmts.insert.run(row);
    res.status(201).json(toDto(row));
  })
);

router.get(
  '/api/pastes/:id',
  asyncHandler(async (req, res) => {
    const row = loadPaste(req.params.id);
    const content = await fs.promises.readFile(pastePath(row.id), 'utf8');
    res.json({ ...toDto(row), content });
  })
);

// ---------- Raw / downloads ----------

router.get(['/pastes/:id/raw', '/p/:id/raw'], (req, res, next) => {
  try {
    const row = loadPaste(req.params.id);
    res.type('text/plain; charset=utf-8');
    res.sendFile(pastePath(row.id), { headers: { 'X-Content-Type-Options': 'nosniff' } }, (err) => err && next(err));
  } catch (err) {
    next(err);
  }
});

router.get(['/pastes/:id/download', '/p/:id/download'], (req, res, next) => {
  try {
    const row = loadPaste(req.params.id);
    res.download(pastePath(row.id), downloadName(row), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }, (err) => err && !res.headersSent && next(err));
  } catch (err) {
    next(err);
  }
});

router.get(['/pastes/:id/download.md5', '/p/:id/download.md5'], (req, res, next) => {
  try {
    const row = loadPaste(req.params.id);
    const name = downloadName(row);
    res.attachment(`${name}.md5`);
    res.type('text/plain; charset=utf-8');
    res.send(md5FileContent(row.md5, name));
  } catch (err) {
    next(err);
  }
});

// ---------- Página ----------

router.get('/pastes', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

router.get(['/pastes/:id', '/p/:id'], (req, res) => {
  let status = 200;
  try {
    loadPaste(req.params.id);
  } catch (err) {
    status = err.status || 404;
  }
  // A página mostra a mensagem amigável a partir da API
  res.status(status).sendFile(path.join(PUBLIC_DIR, 'paste.html'));
});

export default router;
