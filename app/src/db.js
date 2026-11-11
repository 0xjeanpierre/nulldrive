import path from 'node:path';
import Database from 'better-sqlite3';
import { paths, ensureStorageDirs } from './config.js';

ensureStorageDirs();

export const DB_FILE = path.join(paths.db, 'nulldrive.sqlite');

export const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS pastes (
  id          TEXT PRIMARY KEY,
  title       TEXT,
  size_bytes  INTEGER NOT NULL,
  md5         TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id              TEXT PRIMARY KEY,
  original_name   TEXT NOT NULL,
  stored_name     TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  chunk_size      INTEGER NOT NULL,
  received_bytes  INTEGER NOT NULL DEFAULT 0,
  total_chunks    INTEGER NOT NULL,
  received_chunks INTEGER NOT NULL DEFAULT 0,
  md5             TEXT,
  status          TEXT NOT NULL,          -- uploading | finalizing | ready | failed
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  expires_at      INTEGER
);

CREATE TABLE IF NOT EXISTS upload_chunks (
  file_id    TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  idx        INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  PRIMARY KEY (file_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_pastes_expires ON pastes(expires_at);
CREATE INDEX IF NOT EXISTS idx_files_expires ON files(expires_at);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
`);

// Uploads que estavam sendo finalizados quando o processo caiu voltam para "uploading"
db.prepare(`UPDATE files SET status = 'uploading' WHERE status = 'finalizing'`).run();

export function closeDb() {
  try {
    db.close();
  } catch {
    /* já fechado */
  }
}
