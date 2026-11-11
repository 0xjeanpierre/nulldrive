import express from 'express';
import { config, CONFIG_PATH, EDITABLE, getEnvOverriddenKeys, updateConfig } from '../config.js';
import { db } from '../db.js';
import { runCleanup } from '../services/cleanup.js';
import { HttpError, asyncHandler, DAY_MS } from '../utils/http.js';

// ATENÇÃO: sem autenticação nesta fase (ver roteiro, seção 11).
const router = express.Router();
router.use(express.json({ limit: '16kb' }));

router.get('/config', (req, res) => {
  res.json({
    config,
    configPath: CONFIG_PATH,
    editableKeys: EDITABLE,
    envOverriddenKeys: getEnvOverriddenKeys(),
  });
});

router.put('/config', (req, res, next) => {
  try {
    const { updated, warnings } = updateConfig(req.body);
    res.json({ updated, warnings, config });
  } catch (err) {
    next(err instanceof HttpError ? err : new HttpError(400, err.message));
  }
});

const stmts = {
  getFile: db.prepare(`SELECT id, expires_at FROM files WHERE id = ? AND status = 'ready'`),
  getPaste: db.prepare(`SELECT id, expires_at FROM pastes WHERE id = ?`),
  setFileExp: db.prepare(`UPDATE files SET expires_at = ? WHERE id = ?`),
  setPasteExp: db.prepare(`UPDATE pastes SET expires_at = ? WHERE id = ?`),
};

/** Estende a expiração de um arquivo ou paste: body { days }. */
router.post('/extend/:id', (req, res, next) => {
  try {
    const days = Number(req.body?.days);
    if (!Number.isFinite(days) || days <= 0 || days > 365) throw new HttpError(400, '"days" deve estar entre 0 e 365');

    const id = req.params.id;
    const file = stmts.getFile.get(id);
    const paste = file ? null : stmts.getPaste.get(id);
    const row = file || paste;
    if (!row) throw new HttpError(404, 'Item não encontrado');

    const expiresAt = Math.round(Math.max(Date.now(), row.expires_at) + days * DAY_MS);
    (file ? stmts.setFileExp : stmts.setPasteExp).run(expiresAt, id);
    res.json({ id, type: file ? 'file' : 'paste', expiresAt });
  } catch (err) {
    next(err);
  }
});

/** Dispara a limpeza manualmente. */
router.post(
  '/cleanup',
  asyncHandler(async (req, res) => {
    res.json(await runCleanup());
  })
);

export default router;
