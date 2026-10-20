import fs from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import express from 'express';
import { config, paths } from '../config.js';
import { db } from '../db.js';
import { newId, md5File, md5FileContent } from '../utils/hash.js';
import { sanitizeFileName, isAllowedExtension } from '../services/validate.js';
import { HttpError, asyncHandler, DAY_MS } from '../utils/http.js';

const router = express.Router();
const PUBLIC_DIR = path.resolve('public');
const DISK_MARGIN_BYTES = 64 * 1024 * 1024;

const stmts = {
  insert: db.prepare(
    `INSERT INTO files (id, original_name, stored_name, size_bytes, chunk_size, total_chunks, status, created_at, updated_at)
     VALUES (@id, @original_name, @stored_name, @size_bytes, @chunk_size, @total_chunks, 'uploading', @now, @now)`
  ),
  get: db.prepare(`SELECT * FROM files WHERE id = ?`),
  listChunks: db.prepare(`SELECT idx FROM upload_chunks WHERE file_id = ? ORDER BY idx`),
  chunkTotals: db.prepare(
    `SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes FROM upload_chunks WHERE file_id = ?`
  ),
  upsertChunk: db.prepare(
    `INSERT INTO upload_chunks (file_id, idx, size_bytes) VALUES (?, ?, ?)
     ON CONFLICT(file_id, idx) DO UPDATE SET size_bytes = excluded.size_bytes`
  ),
  refreshCounts: db.prepare(
    `UPDATE files SET
       received_chunks = (SELECT COUNT(*) FROM upload_chunks WHERE file_id = @id),
       received_bytes  = (SELECT COALESCE(SUM(size_bytes), 0) FROM upload_chunks WHERE file_id = @id),
       updated_at = @now
     WHERE id = @id`
  ),
  reserved: db.prepare(
    `SELECT COALESCE(SUM(size_bytes - received_bytes), 0) AS bytes FROM files WHERE status IN ('uploading', 'finalizing')`
  ),
  toFinalizing: db.prepare(`UPDATE files SET status = 'finalizing', updated_at = ? WHERE id = ? AND status = 'uploading'`),
  setStatus: db.prepare(`UPDATE files SET status = ?, updated_at = ? WHERE id = ?`),
  markReady: db.prepare(
    `UPDATE files SET status = 'ready', md5 = @md5, stored_name = @stored_name, expires_at = @expires_at, updated_at = @now
     WHERE id = @id`
  ),
  remove: db.prepare(`DELETE FROM files WHERE id = ?`),
};

const partPath = (id) => path.join(paths.tmp, `${id}.part`);
const filePath = (row) => path.join(paths.files, row.stored_name);
const isValidId = (id) => /^[A-Za-z0-9_-]{4,32}$/.test(id);

function getUpload(id) {
  if (!isValidId(id)) throw new HttpError(404, 'Upload não encontrado');
  const row = stmts.get.get(id);
  if (!row) throw new HttpError(404, 'Upload não encontrado');
  return row;
}

/** Arquivo pronto e não expirado, senão 404/410. */
function loadReadyFile(id) {
  if (!isValidId(id)) throw new HttpError(404, 'Arquivo não encontrado');
  const row = stmts.get.get(id);
  if (!row || row.status !== 'ready') throw new HttpError(404, 'Arquivo não encontrado');
  if (row.expires_at <= Date.now()) throw new HttpError(410, 'Este arquivo expirou');
  return row;
}

function fileDto(row) {
  return {
    id: row.id,
    fileName: row.original_name,
    sizeBytes: row.size_bytes,
    md5: row.md5,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    url: `/files/${row.id}`,
    downloadUrl: `/files/${row.id}/download`,
  };
}

async function discardUpload(id) {
  stmts.remove.run(id); // upload_chunks sai via ON DELETE CASCADE
  await fs.promises.rm(partPath(id), { force: true });
}

// ---------- 1. Init ----------

router.post(
  '/api/uploads/init',
  express.json({ limit: '16kb' }),
  asyncHandler(async (req, res) => {
    const { fileName, size } = req.body ?? {};
    if (typeof fileName !== 'string' || !fileName.trim()) throw new HttpError(400, 'Nome do arquivo é obrigatório');

    const safeName = sanitizeFileName(fileName);
    if (!isAllowedExtension(safeName, config.allowedExtensions)) {
      throw new HttpError(415, `Tipo não permitido. Aceitos: ${config.allowedExtensions.join(', ')}`);
    }
    const n = Number(size);
    if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(400, 'Tamanho inválido');
    if (n > config.maxFileSizeBytes) {
      throw new HttpError(413, `Arquivo excede o limite de ${config.maxFileSizeBytes} bytes`);
    }

    const st = await fs.promises.statfs(paths.tmp);
    const free = st.bavail * st.bsize;
    const reserved = stmts.reserved.get().bytes;
    if (free - reserved < n + DISK_MARGIN_BYTES) {
      throw new HttpError(507, 'Espaço insuficiente no servidor para este arquivo');
    }

    const id = newId();
    const chunkSize = config.chunkSizeBytes;
    const totalChunks = Math.ceil(n / chunkSize);
    // Os chunks são gravados direto na posição final deste arquivo (sem precisar concatenar depois,
    // o que dobraria o uso de disco em arquivos de 1 GB).
    await fs.promises.writeFile(partPath(id), '');
    stmts.insert.run({
      id,
      original_name: safeName,
      stored_name: `${id}_${safeName}`,
      size_bytes: n,
      chunk_size: chunkSize,
      total_chunks: totalChunks,
      now: Date.now(),
    });

    res.status(201).json({ uploadId: id, fileName: safeName, size: n, chunkSize, totalChunks });
  })
);

// ---------- 2. Chunk ----------

router.put(
  '/api/uploads/:id/chunk/:index',
  asyncHandler(async (req, res) => {
    const row = getUpload(req.params.id);
    if (row.status === 'failed') throw new HttpError(410, 'Este upload falhou e foi descartado');
    if (row.status !== 'uploading') throw new HttpError(409, 'Upload não está aceitando partes');

    const idx = Number(req.params.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= row.total_chunks) throw new HttpError(400, 'Índice de parte inválido');

    const offset = idx * row.chunk_size;
    const expected = Math.min(row.chunk_size, row.size_bytes - offset);
    const declared = req.headers['content-length'];
    if (declared !== undefined && Number(declared) !== expected) {
      throw new HttpError(400, `Parte ${idx} deveria ter ${expected} bytes (recebido ${declared})`);
    }

    let written = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        written += chunk.length;
        if (written > expected) cb(new HttpError(413, 'Parte maior que o esperado'));
        else cb(null, chunk);
      },
    });

    try {
      await pipeline(req, counter, fs.createWriteStream(partPath(row.id), { flags: 'r+', start: offset }));
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err.code === 'ENOENT') throw new HttpError(410, 'Upload cancelado ou removido');
      if (req.destroyed || res.socket?.destroyed) return; // cliente desconectou (pausa/rede)
      throw err;
    }
    if (written !== expected) throw new HttpError(400, `Parte ${idx} incompleta (${written}/${expected} bytes)`);

    const current = stmts.get.get(row.id);
    if (!current || current.status !== 'uploading') throw new HttpError(409, 'Upload foi cancelado ou finalizado');

    stmts.upsertChunk.run(row.id, idx, written);
    stmts.refreshCounts.run({ id: row.id, now: Date.now() });
    const totals = stmts.chunkTotals.get(row.id);
    res.json({ index: idx, receivedChunks: totals.count, totalChunks: row.total_chunks });
  })
);

// ---------- 3. Status ----------

router.get('/api/uploads/:id/status', (req, res, next) => {
  try {
    const row = getUpload(req.params.id);
    const body = {
      uploadId: row.id,
      fileName: row.original_name,
      size: row.size_bytes,
      chunkSize: row.chunk_size,
      totalChunks: row.total_chunks,
      receivedBytes: row.received_bytes,
      received: stmts.listChunks.all(row.id).map((r) => r.idx),
      status: row.status,
    };
    if (row.status === 'ready') Object.assign(body, fileDto(row));
    res.json(body);
  } catch (err) {
    next(err);
  }
});

// ---------- 4. Complete ----------

router.post(
  '/api/uploads/:id/complete',
  asyncHandler(async (req, res) => {
    const row = getUpload(req.params.id);
    if (row.status === 'ready') return res.json(fileDto(row));
    if (row.status === 'finalizing') throw new HttpError(409, 'Upload já está sendo finalizado');
    if (row.status !== 'uploading') throw new HttpError(409, 'Upload não pode ser finalizado');

    const totals = stmts.chunkTotals.get(row.id);
    if (totals.count !== row.total_chunks || totals.bytes !== row.size_bytes) {
      const have = new Set(stmts.listChunks.all(row.id).map((r) => r.idx));
      const missing = [];
      for (let i = 0; i < row.total_chunks && missing.length < 50; i++) if (!have.has(i)) missing.push(i);
      throw new HttpError(409, 'Ainda faltam partes do arquivo', { missing });
    }

    if (stmts.toFinalizing.run(Date.now(), row.id).changes === 0) {
      throw new HttpError(409, 'Upload já está sendo finalizado');
    }

    try {
      const tmp = partPath(row.id);
      const st = await fs.promises.stat(tmp);
      if (st.size !== row.size_bytes) throw new HttpError(500, 'Tamanho final não confere');

      const md5 = await md5File(tmp);
      await fs.promises.rename(tmp, path.join(paths.files, row.stored_name));

      const now = Date.now();
      stmts.markReady.run({
        id: row.id,
        md5,
        stored_name: row.stored_name,
        expires_at: Math.round(now + config.retentionDays * DAY_MS),
        now,
      });
      console.log(`[upload] ${row.id} pronto: ${row.original_name} (${row.size_bytes} bytes, md5 ${md5})`);
      res.json(fileDto(stmts.get.get(row.id)));
    } catch (err) {
      stmts.setStatus.run('uploading', Date.now(), row.id);
      throw err;
    }
  })
);

// ---------- 5. Abort ----------

router.delete(
  '/api/uploads/:id',
  asyncHandler(async (req, res) => {
    const row = getUpload(req.params.id);
    if (row.status === 'ready') throw new HttpError(409, 'Arquivo já concluído não pode ser cancelado');
    if (row.status === 'finalizing') throw new HttpError(409, 'Upload está sendo finalizado');
    await discardUpload(row.id);
    res.status(204).end();
  })
);

// ---------- Download ----------

router.get('/api/files/:id', (req, res, next) => {
  try {
    res.json(fileDto(loadReadyFile(req.params.id)));
  } catch (err) {
    next(err);
  }
});

router.get(['/files/:id/download', '/f/:id/download'], (req, res, next) => {
  try {
    const row = loadReadyFile(req.params.id);
    // res.download usa `send`: Content-Length, Range/206, ETag e Last-Modified
    // Qualquer tipo de arquivo: força download (attachment) e impede o navegador de "adivinhar" o tipo
    res.download(filePath(row), row.original_name, {
      acceptRanges: true,
      cacheControl: false,
      headers: { 'X-Content-Type-Options': 'nosniff' },
    }, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    next(err);
  }
});

router.get(['/files/:id/download.md5', '/f/:id/download.md5'], (req, res, next) => {
  try {
    const row = loadReadyFile(req.params.id);
    res.attachment(`${row.original_name}.md5`);
    res.type('text/plain; charset=utf-8');
    res.send(md5FileContent(row.md5, row.original_name));
  } catch (err) {
    next(err);
  }
});

router.get('/files', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

router.get(['/files/:id', '/f/:id'], (req, res) => {
  let status = 200;
  try {
    loadReadyFile(req.params.id);
  } catch (err) {
    status = err.status || 404;
  }
  res.status(status).sendFile(path.join(PUBLIC_DIR, 'file.html'));
});

export default router;
