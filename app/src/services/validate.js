import path from 'node:path';

/** Remove separadores, "..", caracteres de controle e reservados do Windows. */
export function sanitizeFileName(name, fallback = 'arquivo') {
  let s = String(name ?? '');
  s = s.split(/[\\/]/).pop() ?? '';
  s = s.replace(/[\p{Cc}<>:"|?*]/gu, '');
  s = s.replace(/\.{2,}/g, '.');
  s = s.replace(/^\.+/, '');
  while (s.endsWith('.') || s.endsWith(' ')) {
    s = s.slice(0, -1);
  }
  s = s.trim();
  if (s.length > 180) {
    const ext = path.extname(s).slice(0, 20);
    s = s.slice(0, 180 - ext.length) + ext;
  }
  return s || fallback;
}

export function getExtension(name) {
  return path.extname(String(name ?? '')).toLowerCase();
}

/** Lista vazia = qualquer tipo de arquivo é aceito. */
export function isAllowedExtension(name, allowed) {
  if (!Array.isArray(allowed) || allowed.length === 0) return true;
  return allowed.includes(getExtension(name));
}
