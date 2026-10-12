import crypto from 'node:crypto';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { customAlphabet } from 'nanoid';

export const newId = customAlphabet('23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', 10);

export function md5Buffer(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

/** Calcula o MD5 de um arquivo em stream (não carrega em memória). */
export async function md5File(filePath) {
  const hash = crypto.createHash('md5');
  await pipeline(fs.createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 }), hash);
  return hash.digest('hex');
}

/** Conteúdo de um arquivo .md5 compatível com `md5sum -c`. */
export function md5FileContent(md5, fileName) {
  return `${md5}  ${fileName}\n`;
}
