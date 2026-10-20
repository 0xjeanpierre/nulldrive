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

/** Lista vazia = qualquer tipo de arquivo é aceito. */
export function isAllowedExtension(name, allowed) {
  if (!Array.isArray(allowed) || allowed.length === 0) return true;
  return allowed.includes(getExtension(name));
}
