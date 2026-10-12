/** Utilitários compartilhados pelo frontend. */

export async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Erro ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function formatBytes(n, decimals = 1) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v.toFixed(i === 0 ? 0 : decimals).replace('.', ',')} ${units[i]}`;
}

export function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '—';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function formatRemaining(ms) {
  if (ms <= 0) return 'expirado';
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return d ? `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s` : `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

export function formatDate(ms) {
  return new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatRetention(days) {
  if (days >= 1) {
    const d = Math.round(days * 10) / 10;
    return `${String(d).replace('.', ',')} ${d === 1 ? 'dia' : 'dias'}`;
  }
  const hours = Math.max(1, Math.round(days * 24));
  return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
}

/** Atualiza o elemento a cada segundo; chama onExpire ao zerar. */
export function startCountdown(el, expiresAt, onExpire) {
  const tick = () => {
    const left = expiresAt - Date.now();
    el.textContent = formatRemaining(left);
    if (left <= 0) {
      clearInterval(timer);
      onExpire?.();
    }
  };
  const timer = setInterval(tick, 1000);
  tick();
  return () => clearInterval(timer);
}

export function toast(message, type = 'success') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', 'status');
  const dot = document.createElement('span');
  dot.className = 'toast-dot';
  const text = document.createElement('span');
  text.textContent = message;
  el.append(dot, text);
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 2400);
}

/** Copia texto; usa fallback porque a Clipboard API exige HTTPS fora de localhost. */
export async function copyText(text, successMsg = 'Copiado!') {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      if (!ok) throw new Error('copy falhou');
    }
    toast(successMsg);
  } catch {
    toast('Não foi possível copiar', 'error');
  }
}

export const absoluteUrl = (path) => new URL(path, location.origin).href;

export function getExtension(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i).toLowerCase() : '';
}

let publicConfigPromise = null;
export function getPublicConfig(force = false) {
  if (force || !publicConfigPromise) {
    publicConfigPromise = api('/api/config/public').catch(() => ({
      retentionDays: 3,
      maxFileSizeBytes: 15 * 1024 ** 3,
      chunkSizeBytes: 50 * 1024 ** 2,
      allowedExtensions: ['.zip', '.7z'],
      maxPasteSizeBytes: 10 * 1024 ** 2,
      stats: {
        totalFiles: 0,
        totalPastes: 0,
        totalItems: 0,
        totalSizeBytes: 0,
      },
    }));
  }
  return publicConfigPromise;
}

/** Preenche elementos com data-cfg="retention|maxFile|maxPaste|exts|usedStorage|totalFiles|filesCount|pastesCount". */
export async function fillConfigText(force = false) {
  const cfg = await getPublicConfig(force);
  const stats = cfg.stats || { totalFiles: 0, totalPastes: 0, totalItems: 0, totalSizeBytes: 0 };
  const values = {
    retention: formatRetention(cfg.retentionDays),
    maxFile: formatBytes(cfg.maxFileSizeBytes, 0),
    maxPaste: formatBytes(cfg.maxPasteSizeBytes, 0),
    exts: cfg.allowedExtensions.join(' · '),
    usedStorage: formatBytes(stats.totalSizeBytes),
    totalFiles: stats.totalItems.toLocaleString('pt-BR'),
    filesCount: stats.totalFiles.toLocaleString('pt-BR'),
    pastesCount: stats.totalPastes.toLocaleString('pt-BR'),
  };
  document.querySelectorAll('[data-cfg]').forEach((el) => {
    const v = values[el.dataset.cfg];
    if (v !== undefined) el.textContent = v;
  });
  return cfg;
}

/** Liga botões com data-copy-target="#id" (copia value/textContent do alvo). */
export function bindCopyButtons(root = document) {
  root.querySelectorAll('[data-copy-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.querySelector(btn.dataset.copyTarget);
      if (!target) return;
      copyText('value' in target ? target.value : target.textContent, btn.dataset.copyMsg || 'Copiado!');
    });
  });
}

export function fileBadge(name) {
  return (getExtension(name).slice(1) || 'file').slice(0, 4);
}
