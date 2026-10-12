import fs from 'node:fs';
import path from 'node:path';
import { config, configEvents, paths } from '../config.js';
import { db } from '../db.js';

const ORPHAN_MIN_AGE_MS = 10 * 60 * 1000; // não mexe em arquivos recém-criados

const stmts = {
  expiredPastes: db.prepare(`SELECT id FROM pastes WHERE expires_at <= ?`),
  deletePaste: db.prepare(`DELETE FROM pastes WHERE id = ?`),
  pasteExists: db.prepare(`SELECT 1 FROM pastes WHERE id = ?`),
  expiredFiles: db.prepare(`SELECT id, stored_name FROM files WHERE status = 'ready' AND expires_at <= ?`),
  staleUploads: db.prepare(`SELECT id FROM files WHERE status IN ('uploading', 'failed') AND updated_at <= ?`),
  deleteFile: db.prepare(`DELETE FROM files WHERE id = ?`),
  readyStoredNames: db.prepare(`SELECT stored_name FROM files WHERE status = 'ready'`),
  activeUploads: db.prepare(`SELECT id FROM files WHERE status IN ('uploading', 'finalizing')`),
};

let timer = null;
let running = false;

async function removePath(p) {
  try {
    const st = await fs.promises.stat(p);
    await fs.promises.rm(p, { force: true, recursive: true });
    return st.blocks ? st.blocks * 512 : st.size; // arquivos .part podem ser esparsos
  } catch {
    return 0;
  }
}

async function removeOrphans(dir, isKnown, now) {
  let count = 0;
  let bytes = 0;
  let entries = [];
  try {
    entries = await fs.promises.readdir(dir);
  } catch {
    return { count, bytes };
  }
  for (const name of entries) {
    if (isKnown(name)) continue;
    const full = path.join(dir, name);
    try {
      const st = await fs.promises.stat(full);
      if (now - st.mtimeMs < ORPHAN_MIN_AGE_MS) continue;
    } catch {
      continue;
    }
    bytes += await removePath(full);
    count++;
  }
  return { count, bytes };
}

function formatBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

/** Executa uma rodada de limpeza. Retorna estatísticas. */
export async function runCleanup() {
  if (running) return { skipped: true };
  running = true;
  const now = Date.now();
  const stats = { pastes: 0, files: 0, staleUploads: 0, orphans: 0, freedBytes: 0 };
  try {
    for (const { id } of stmts.expiredPastes.all(now)) {
      stats.freedBytes += await removePath(path.join(paths.pastes, `${id}.txt`));
      stmts.deletePaste.run(id);
      stats.pastes++;
    }

    for (const row of stmts.expiredFiles.all(now)) {
      stats.freedBytes += await removePath(path.join(paths.files, row.stored_name));
      stmts.deleteFile.run(row.id);
      stats.files++;
    }

    const staleBefore = now - config.incompleteUploadTtlHours * 60 * 60 * 1000;
    for (const { id } of stmts.staleUploads.all(staleBefore)) {
      stats.freedBytes += await removePath(path.join(paths.tmp, `${id}.part`));
      stmts.deleteFile.run(id);
      stats.staleUploads++;
    }

    const readyNames = new Set(stmts.readyStoredNames.all().map((r) => r.stored_name));
    const activeParts = new Set(stmts.activeUploads.all().map((r) => `${r.id}.part`));
    const orphanResults = await Promise.all([
      removeOrphans(paths.pastes, (n) => n.endsWith('.txt') && !!stmts.pasteExists.get(n.slice(0, -4)), now),
      removeOrphans(paths.files, (n) => readyNames.has(n), now),
      removeOrphans(paths.tmp, (n) => activeParts.has(n), now),
    ]);
    for (const r of orphanResults) {
      stats.orphans += r.count;
      stats.freedBytes += r.bytes;
    }

    const total = stats.pastes + stats.files + stats.staleUploads + stats.orphans;
    if (total > 0) {
      console.log(
        `[cleanup] Removidos: ${stats.pastes} paste(s), ${stats.files} arquivo(s), ` +
          `${stats.staleUploads} upload(s) incompleto(s), ${stats.orphans} órfão(s). ` +
          `Liberado: ${formatBytes(stats.freedBytes)}.`
      );
    } else {
      console.log('[cleanup] Nada para remover.');
    }
    return stats;
  } catch (err) {
    console.error('[cleanup] Erro:', err);
    return { ...stats, error: err.message };
  } finally {
    running = false;
  }
}

function schedule() {
  if (timer) clearInterval(timer);
  const ms = config.cleanupIntervalMinutes * 60 * 1000;
  timer = setInterval(runCleanup, ms);
  timer.unref();
  console.log(`[cleanup] Agendado a cada ${config.cleanupIntervalMinutes} min.`);
}

function onConfigChange(updated) {
  if ('cleanupIntervalMinutes' in updated) schedule();
}

export function startCleanup() {
  schedule();
  configEvents.on('change', onConfigChange);
  runCleanup();
}

export function stopCleanup() {
  if (timer) clearInterval(timer);
  timer = null;
  configEvents.off('change', onConfigChange);
}
