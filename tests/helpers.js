import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Cria diretório temporário e aponta STORAGE_DIR/CONFIG_PATH/PORT para ele (antes de importar o app). */
export function setupEnv(port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nulldrive-test-'));
  process.env.STORAGE_DIR = path.join(dir, 'storage');
  process.env.CONFIG_PATH = path.join(dir, 'config', 'config.json');
  process.env.HOST = '127.0.0.1';
  if (port) process.env.PORT = String(port);
  return dir;
}
