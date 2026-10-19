import {
  api,
  absoluteUrl,
  bindCopyButtons,
  copyText,
  fileBadge,
  fillConfigText,
  formatBytes,
  formatDate,
  initPreferences,
  startCountdown,
  t,
} from './common.js';

const $ = (sel) => document.querySelector(sel);
const id = decodeURIComponent(location.pathname.split('/')[2] || '');

initPreferences();
fillConfigText();
bindCopyButtons();

let currentFile = null;
let lastError = null;

function showError(status, message) {
  lastError = { status, message };
  $('#state-loading').classList.add('hidden');
  $('#file-view').classList.add('hidden');
  $('#error-code').textContent = status || '!';
  $('#error-title').textContent =
    status === 410 ? t('file.errExpiredTitle') : status === 404 ? t('file.errNotFoundTitle') : message || t('file.errGenericTitle');
  $('#error-text').textContent = status === 410 ? t('file.errExpiredText') : t('file.errNotFoundText');
  document.title = `${$('#error-title').textContent} – nulldrive`;
  $('#state-error').classList.remove('hidden');
}

function renderFileMeta(file) {
  if (!file) return;
  document.title = `${file.fileName} – nulldrive`;
  $('#file-name').textContent = file.fileName;
  $('#file-badge').textContent = fileBadge(file.fileName);
  $('#meta-size').textContent = formatBytes(file.sizeBytes, 2);
  $('#meta-created').textContent = formatDate(file.createdAt);
}

async function load() {
  let file;
  try {
    file = await api(`/api/files/${encodeURIComponent(id)}`);
  } catch (err) {
    return showError(err.status, err.message);
  }

  currentFile = file;
  renderFileMeta(file);
  $('#file-md5').textContent = file.md5;
  startCountdown($('#meta-countdown'), file.expiresAt, () => showError(410));

  $('#btn-download').href = file.downloadUrl;
  $('#btn-download-md5').href = `${file.url}/download.md5`;
  $('#btn-copy-link').addEventListener('click', () => copyText(absoluteUrl(file.url), t('common.linkCopied')));

  const name = file.fileName;
  $('#cmd-win').textContent = `certutil -hashfile "${name}" MD5`;
  $('#cmd-linux').textContent = `md5sum "${name}"`;
  $('#cmd-check').textContent = `md5sum -c "${name}.md5"`;

  $('#state-loading').classList.add('hidden');
  $('#file-view').classList.remove('hidden');
}

window.addEventListener('langchange', () => {
  if (lastError) showError(lastError.status, lastError.message);
  if (currentFile) renderFileMeta(currentFile);
});

load();
