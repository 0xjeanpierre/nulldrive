/** Utilitários compartilhados pelo frontend (API, formatação, tema Dim/White e i18n PT-BR/EN-US). */

const THEME_KEY = 'nulldrive.theme';
const LANG_KEY = 'nulldrive.lang';

export const TRANSLATIONS = {
  'pt-BR': {
    'brand.aria': 'NullDrive – início',
    'header.pill': 'Sem cadastro · expira em <b data-cfg="retention">3 dias</b>',
    'header.newPaste': '+ Novo',
    'header.uploadFile': '+ Enviar arquivo',
    'header.apiDocs': 'API Docs',
    'docs.backHome': '← Início',
    'docs.openJson': 'OpenAPI JSON',
    'docs.pageTitle': 'API Docs (Swagger) – nulldrive',
    'theme.dim': 'Dim',
    'theme.light': 'White',
    'theme.toggleAria': 'Alternar tema (Dim / White)',
    'lang.toggleAria': 'Alternar idioma (PT-BR / EN-US)',
    'footer.retention': 'retenção:',
    'footer.limit': 'limite:',
    'footer.storage': 'armazenamento:',
    'footer.totalItems': 'arquivos no total',
    'common.copy': 'Copiar',
    'common.copied': 'Copiado!',
    'common.copyFailed': 'Não foi possível copiar',
    'common.linkCopied': 'Link copiado!',
    'common.md5Copied': 'MD5 copiado!',
    'common.textCopied': 'Texto copiado!',
    'common.expired': 'expirado',
    'common.expiresIn': 'expira em',
    'common.withMd5': 'Com .md5',
    'common.or': ' ou ',

    'home.pageTitle': 'nulldrive – Compartilhe textos e arquivos .zip/.7z',
    'home.intro':
      'Cole um texto ou envie um <b>.zip</b> / <b>.7z</b> de até <b data-cfg="maxFile">1 GB</b>. Você recebe um link com hash MD5 para conferir a integridade.',
    'home.tabText': '📋 Colar texto',
    'home.tabFile': '📦 Enviar arquivo',
    'home.pasteTitleLabel': 'Título',
    'home.pasteTitlePlaceholder': 'Título (opcional) — vira o nome do .txt',
    'home.pasteContentLabel': 'Conteúdo',
    'home.pasteContentPlaceholder': 'Cole seu texto aqui…',
    'home.counter': '{chars} caracteres · {size} de {max}',
    'home.createPasteBtn': 'Criar paste',
    'home.pasteCreatedTitle': 'Paste criado!',
    'home.expiresInSub': 'Expira em <b data-cfg="retention">3 dias</b>',
    'home.labelLink': 'Link',
    'home.labelPasteMd5': 'MD5 do .txt',
    'home.openPasteBtn': 'Abrir paste',
    'home.downloadTxtBtn': 'Baixar .txt',
    'home.downloadMd5Btn': 'Baixar .md5',
    'home.newPasteBtn': 'Novo paste',
    'home.toastEmptyPaste': 'Cole algum texto primeiro',
    'home.toastPasteCreated': 'Paste criado!',
    'home.discardBtn': 'Descartar',
    'home.resumeBanner': '⚠ Upload de "{name}" pausado em {pct}%. Selecione o mesmo arquivo para continuar.',
    'home.toastPendingDiscarded': 'Upload pendente descartado',
    'home.dropTitle': 'Arraste o arquivo aqui',
    'home.dropSub': 'ou clique para escolher',
    'home.chipUpTo': 'até <span data-cfg="maxFile">1 GB</span>',
    'home.chipResumable': 'retomável',
    'home.statProgress': 'Progresso',
    'home.statSent': 'Enviado',
    'home.statSpeed': 'Velocidade',
    'home.statEta': 'Restante',
    'home.pauseBtn': '⏸ Pausar',
    'home.resumeBtn': '▶ Retomar',
    'home.cancelBtn': '✕ Cancelar',
    'home.retrySelectBtn': 'Escolher outro arquivo',
    'home.fileUploadedTitle': 'Arquivo enviado!',
    'home.openPageBtn': 'Abrir página',
    'home.downloadBtn': 'Baixar',
    'home.uploadAnotherBtn': 'Enviar outro',
    'home.toastUploadInProgress': 'Já existe um envio em andamento',
    'home.errTypeNotAllowed': 'Tipo não permitido. Envie {allowed}.',
    'home.errFileEmpty': 'O arquivo está vazio.',
    'home.errFileTooLarge': 'O arquivo tem {size}; o limite é {max}.',
    'home.confirmReplacePending': 'Existe um upload pendente de "{oldName}". Descartá-lo e enviar "{newName}"?',
    'home.confirmCancelUpload': 'Cancelar o envio? As partes já enviadas serão apagadas.',
    'home.toastSingleFile': 'Envie um arquivo por vez; usando o primeiro.',
    'home.toastFileUploaded': 'Arquivo enviado!',
    'home.toastUploadCancelled': 'Envio cancelado',
    'home.statusPreparing': 'Preparando envio…',
    'home.statusUploadingPart': 'Enviando parte {current} de {total}…',
    'home.statusPausing': 'Pausando…',
    'home.statusPaused': 'Pausado. Você pode retomar a qualquer momento (até recarregando a página).',
    'home.statusFinalizing': 'Finalizando: o servidor está calculando o MD5 (arquivos grandes podem levar alguns minutos)…',
    'home.statusError': 'Erro no envio',
    'home.uploadResultMeta': '{name} · {size} · expira em {date}',

    'uploader.resumingNotice': 'Retomando: {done} de {total} partes já estavam no servidor.',
    'uploader.retryNotice': 'Falha na parte {part} ({err}). Nova tentativa {attempt}/{max} em {sec}s…',
    'uploader.networkError': 'falha de rede',

    'paste.pageTitleDefault': 'Paste – nulldrive',
    'paste.loading': 'Carregando paste…',
    'paste.errExpiredTitle': 'Este paste expirou',
    'paste.errNotFoundTitle': 'Paste não encontrado',
    'paste.errGenericTitle': 'Algo deu errado',
    'paste.errExpiredText': 'O prazo de retenção acabou e o conteúdo foi removido do servidor.',
    'paste.errNotFoundText': 'O link pode ter expirado ou nunca ter existido.',
    'paste.createNewBtn': 'Criar um novo paste',
    'paste.untitled': 'Paste sem título',
    'paste.lineSingular': 'linha',
    'paste.linePlural': 'linhas',
    'paste.copyTextBtn': '📋 Copiar texto',
    'paste.copyLinkBtn': '🔗 Copiar link',
    'paste.viewRawBtn': '👁 Ver raw',
    'paste.downloadTxtBtn': '⬇ Baixar .txt',
    'paste.downloadMd5Btn': '⬇ Baixar .md5',
    'paste.verifyTitle': 'Verificar integridade do .txt baixado',

    'file.pageTitleDefault': 'Download – nulldrive',
    'file.loading': 'Carregando arquivo…',
    'file.errExpiredTitle': 'Este arquivo expirou',
    'file.errNotFoundTitle': 'Arquivo não encontrado',
    'file.errGenericTitle': 'Algo deu errado',
    'file.errExpiredText': 'O prazo de retenção acabou e o arquivo foi removido do servidor.',
    'file.errNotFoundText': 'O link pode ter expirado, ainda estar em envio ou nunca ter existido.',
    'file.uploadNewBtn': 'Enviar um arquivo',
    'file.downloadFileBtn': 'Baixar arquivo',
    'file.downloadMd5Btn': 'Baixar .md5',
    'file.copyLinkBtn': '🔗 Copiar link',
    'file.verifyTitle': 'Verificar integridade após baixar',
  },
  'en-US': {
    'brand.aria': 'NullDrive – home',
    'header.pill': 'No sign-up · expires in <b data-cfg="retention">3 days</b>',
    'header.newPaste': '+ New',
    'header.uploadFile': '+ Upload file',
    'header.apiDocs': 'API Docs',
    'docs.backHome': '← Home',
    'docs.openJson': 'OpenAPI JSON',
    'docs.pageTitle': 'API Docs (Swagger) – nulldrive',
    'theme.dim': 'Dim',
    'theme.light': 'White',
    'theme.toggleAria': 'Toggle theme (Dim / White)',
    'lang.toggleAria': 'Toggle language (PT-BR / EN-US)',
    'footer.retention': 'retention:',
    'footer.limit': 'limit:',
    'footer.storage': 'storage:',
    'footer.totalItems': 'total items',
    'common.copy': 'Copy',
    'common.copied': 'Copied!',
    'common.copyFailed': 'Could not copy',
    'common.linkCopied': 'Link copied!',
    'common.md5Copied': 'MD5 copied!',
    'common.textCopied': 'Text copied!',
    'common.expired': 'expired',
    'common.expiresIn': 'expires in',
    'common.withMd5': 'With .md5',
    'common.or': ' or ',

    'home.pageTitle': 'nulldrive – Share text and .zip/.7z files',
    'home.intro':
      'Paste text or upload a <b>.zip</b> / <b>.7z</b> file up to <b data-cfg="maxFile">1 GB</b>. You get a shareable link with an MD5 hash to verify integrity.',
    'home.tabText': '📋 Paste text',
    'home.tabFile': '📦 Upload file',
    'home.pasteTitleLabel': 'Title',
    'home.pasteTitlePlaceholder': 'Title (optional) — becomes the .txt filename',
    'home.pasteContentLabel': 'Content',
    'home.pasteContentPlaceholder': 'Paste your text here…',
    'home.counter': '{chars} characters · {size} of {max}',
    'home.createPasteBtn': 'Create paste',
    'home.pasteCreatedTitle': 'Paste created!',
    'home.expiresInSub': 'Expires in <b data-cfg="retention">3 days</b>',
    'home.labelLink': 'Link',
    'home.labelPasteMd5': '.txt MD5',
    'home.openPasteBtn': 'Open paste',
    'home.downloadTxtBtn': 'Download .txt',
    'home.downloadMd5Btn': 'Download .md5',
    'home.newPasteBtn': 'New paste',
    'home.toastEmptyPaste': 'Paste some text first',
    'home.toastPasteCreated': 'Paste created!',
    'home.discardBtn': 'Discard',
    'home.resumeBanner': '⚠ Upload of "{name}" paused at {pct}%. Select the same file to resume.',
    'home.toastPendingDiscarded': 'Pending upload discarded',
    'home.dropTitle': 'Drag & drop your file here',
    'home.dropSub': 'or click to browse',
    'home.chipUpTo': 'up to <span data-cfg="maxFile">1 GB</span>',
    'home.chipResumable': 'resumable',
    'home.statProgress': 'Progress',
    'home.statSent': 'Uploaded',
    'home.statSpeed': 'Speed',
    'home.statEta': 'Remaining',
    'home.pauseBtn': '⏸ Pause',
    'home.resumeBtn': '▶ Resume',
    'home.cancelBtn': '✕ Cancel',
    'home.retrySelectBtn': 'Choose another file',
    'home.fileUploadedTitle': 'File uploaded!',
    'home.openPageBtn': 'Open page',
    'home.downloadBtn': 'Download',
    'home.uploadAnotherBtn': 'Upload another',
    'home.toastUploadInProgress': 'An upload is already in progress',
    'home.errTypeNotAllowed': 'File type not allowed. Upload {allowed}.',
    'home.errFileEmpty': 'The file is empty.',
    'home.errFileTooLarge': 'File size is {size}; maximum allowed is {max}.',
    'home.confirmReplacePending': 'There is a pending upload for "{oldName}". Discard it and upload "{newName}"?',
    'home.confirmCancelUpload': 'Cancel upload? Already uploaded chunks will be deleted.',
    'home.toastSingleFile': 'Upload one file at a time; using the first one.',
    'home.toastFileUploaded': 'File uploaded!',
    'home.toastUploadCancelled': 'Upload cancelled',
    'home.statusPreparing': 'Preparing upload…',
    'home.statusUploadingPart': 'Uploading chunk {current} of {total}…',
    'home.statusPausing': 'Pausing…',
    'home.statusPaused': 'Paused. You can resume at any time (even after reloading the page).',
    'home.statusFinalizing': 'Finalizing: server is computing MD5 (large files may take a few minutes)…',
    'home.statusError': 'Upload error',
    'home.uploadResultMeta': '{name} · {size} · expires on {date}',

    'uploader.resumingNotice': 'Resuming: {done} of {total} chunks were already on the server.',
    'uploader.retryNotice': 'Chunk {part} failed ({err}). Retrying {attempt}/{max} in {sec}s…',
    'uploader.networkError': 'network failure',

    'paste.pageTitleDefault': 'Paste – nulldrive',
    'paste.loading': 'Loading paste…',
    'paste.errExpiredTitle': 'This paste has expired',
    'paste.errNotFoundTitle': 'Paste not found',
    'paste.errGenericTitle': 'Something went wrong',
    'paste.errExpiredText': 'The retention period has ended and the content was removed from the server.',
    'paste.errNotFoundText': 'The link may have expired or never existed.',
    'paste.createNewBtn': 'Create a new paste',
    'paste.untitled': 'Untitled paste',
    'paste.lineSingular': 'line',
    'paste.linePlural': 'lines',
    'paste.copyTextBtn': '📋 Copy text',
    'paste.copyLinkBtn': '🔗 Copy link',
    'paste.viewRawBtn': '👁 View raw',
    'paste.downloadTxtBtn': '⬇ Download .txt',
    'paste.downloadMd5Btn': '⬇ Download .md5',
    'paste.verifyTitle': 'Verify integrity of downloaded .txt',

    'file.pageTitleDefault': 'Download – nulldrive',
    'file.loading': 'Loading file…',
    'file.errExpiredTitle': 'This file has expired',
    'file.errNotFoundTitle': 'File not found',
    'file.errGenericTitle': 'Something went wrong',
    'file.errExpiredText': 'The retention period has ended and the file was removed from the server.',
    'file.errNotFoundText': 'The link may have expired, still be uploading, or never existed.',
    'file.uploadNewBtn': 'Upload a file',
    'file.downloadFileBtn': 'Download file',
    'file.downloadMd5Btn': 'Download .md5',
    'file.copyLinkBtn': '🔗 Copy link',
    'file.verifyTitle': 'Verify integrity after download',
  },
};

export function getLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === 'pt-BR' || saved === 'en-US') return saved;
  return 'pt-BR';
}

export function t(key, vars = {}) {
  const lang = getLang();
  const dict = TRANSLATIONS[lang] || TRANSLATIONS['pt-BR'];
  let str = dict[key] ?? TRANSLATIONS['pt-BR'][key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replaceAll(`{${k}}`, String(v));
  }
  return str;
}

export function setLang(lang) {
  const normalized = lang === 'en-US' ? 'en-US' : 'pt-BR';
  localStorage.setItem(LANG_KEY, normalized);
  document.documentElement.lang = normalized;
  applyTranslations();
  window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: normalized } }));
}

export function getTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === 'light' ? 'light' : 'dark';
}

export function setTheme(theme) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, normalized);
  document.documentElement.dataset.theme = normalized;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', normalized === 'light' ? '#f6f7f9' : '#16181d');
  updateThemeButton();
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: normalized } }));
}

function updateThemeButton() {
  const btn = document.getElementById('btn-theme');
  if (!btn) return;
  const isLight = getTheme() === 'light';
  if (!btn.querySelector('.theme-switch-track')) {
    btn.innerHTML = `
      <span class="theme-switch-track" aria-hidden="true">
        <svg class="bulb-bg bulb-bg-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18h6"/><path d="M10 22h4"/>
          <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"/>
          <line x1="4" y1="4" x2="20" y2="20"/>
        </svg>
        <svg class="bulb-bg bulb-bg-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18h6"/><path d="M10 22h4"/>
          <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"/>
          <path d="M12 2v1M4.22 4.22l.7.7M1 11h1M22 11h1M19.78 4.22l-.7.7"/>
        </svg>
      </span>
      <span class="theme-switch-thumb" aria-hidden="true">
        <svg class="thumb-bulb" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18h6" fill="none"/><path d="M10 22h4" fill="none"/>
          <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"/>
        </svg>
      </span>`;
  }
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-checked', String(isLight));
  btn.setAttribute('aria-label', t('theme.toggleAria'));
  btn.title = t('theme.toggleAria');
}

function updateLangSelect() {
  const sel = document.getElementById('lang-select');
  if (!sel) return;
  const lang = getLang();
  if (sel.value !== lang) sel.value = lang;
  sel.setAttribute('aria-label', t('lang.toggleAria'));
  sel.title = t('lang.toggleAria');
}

export function applyTranslations(root = document) {
  document.documentElement.lang = getLang();
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  root.querySelectorAll('[data-i18n-copy-msg]').forEach((el) => {
    el.dataset.copyMsg = t(el.dataset.i18nCopyMsg);
  });
  updateThemeButton();
  updateLangSelect();
  fillConfigText();
}

export function initPreferences() {
  document.documentElement.dataset.theme = getTheme();
  document.documentElement.lang = getLang();

  const themeBtn = document.getElementById('btn-theme');
  if (themeBtn && !themeBtn.dataset.bound) {
    themeBtn.dataset.bound = 'true';
    themeBtn.addEventListener('click', () => {
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });
  }

  const langSelect = document.getElementById('lang-select');
  if (langSelect && !langSelect.dataset.bound) {
    langSelect.dataset.bound = 'true';
    langSelect.value = getLang();
    langSelect.addEventListener('change', (e) => {
      setLang(e.target.value);
    });
  }

  applyTranslations();
}

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
    const err = new Error(data?.error || `Error ${res.status}`);
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
  const formatted = v.toFixed(i === 0 ? 0 : decimals);
  return `${getLang() === 'pt-BR' ? formatted.replace('.', ',') : formatted} ${units[i]}`;
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
  if (ms <= 0) return t('common.expired');
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return d ? `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s` : `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

export function formatDate(ms) {
  return new Date(ms).toLocaleString(getLang(), { dateStyle: 'short', timeStyle: 'short' });
}

export function formatRetention(days) {
  const isPt = getLang() === 'pt-BR';
  if (days >= 1) {
    const d = Math.round(days * 10) / 10;
    const numStr = isPt ? String(d).replace('.', ',') : String(d);
    if (isPt) return `${numStr} ${d === 1 ? 'dia' : 'dias'}`;
    return `${numStr} ${d === 1 ? 'day' : 'days'}`;
  }
  const hours = Math.max(1, Math.round(days * 24));
  if (isPt) return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
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
export async function copyText(text, successMsg = t('common.copied')) {
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
    toast(t('common.copyFailed'), 'error');
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
      maxFileSizeBytes: 1 * 1024 ** 3,
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
  const lang = getLang();
  const values = {
    retention: formatRetention(cfg.retentionDays),
    maxFile: formatBytes(cfg.maxFileSizeBytes, 0),
    maxPaste: formatBytes(cfg.maxPasteSizeBytes, 0),
    exts: cfg.allowedExtensions.join(' · '),
    usedStorage: formatBytes(stats.totalSizeBytes),
    totalFiles: stats.totalItems.toLocaleString(lang),
    filesCount: stats.totalFiles.toLocaleString(lang),
    pastesCount: stats.totalPastes.toLocaleString(lang),
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
      const msgKey = btn.dataset.i18nCopyMsg;
      const msg = msgKey ? t(msgKey) : btn.dataset.copyMsg || t('common.copied');
      copyText('value' in target ? target.value : target.textContent, msg);
    });
  });
}

export function fileBadge(name) {
  return (getExtension(name).slice(1) || 'file').slice(0, 4);
}
