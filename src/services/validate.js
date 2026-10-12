import path from 'node:path';

/** Remove separadores, "..", caracteres de controle e reservados do Windows. */
export function sanitizeFileName(name, fallback = 'arquivo') {
  let s = String(name ?? '');
  s = s.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '');
  s = s.replace(/\.{2,}/g, '.');
  s = s.trim().replace(/^\.+/, '').replace(/[. ]+$/, '');
  if (s.length > 180) {
    const ext = path.extname(s).slice(0, 20);
    s = s.slice(0, 180 - ext.length) + ext;
  }
  return s || fallback;
}

export function getExtension(name) {
  return path.extname(String(name ?? '')).toLowerCase();
}

export function isAllowedExtension(name, allowed) {
  return allowed.includes(getExtension(name));
}

const SIGNATURES = {
  zip: [
    [0x50, 0x4b, 0x03, 0x04],
    [0x50, 0x4b, 0x05, 0x06],
    [0x50, 0x4b, 0x07, 0x08],
  ],
  '7z': [[0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]],
};

/** Detecta o tipo real pelo cabeçalho (magic bytes). */
export function detectArchiveType(buf) {
  for (const [type, sigs] of Object.entries(SIGNATURES)) {
    if (sigs.some((sig) => buf.length >= sig.length && sig.every((b, i) => buf[i] === b))) return type;
  }
  return null;
}

/** Confere se o conteúdo bate com a extensão declarada. */
export function matchesExtension(buf, fileName) {
  const ext = getExtension(fileName);
  const type = detectArchiveType(buf);
  return (ext === '.zip' && type === 'zip') || (ext === '.7z' && type === '7z');
}
