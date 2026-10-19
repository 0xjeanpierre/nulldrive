import {
  api,
  absoluteUrl,
  bindCopyButtons,
  copyText,
  fillConfigText,
  formatBytes,
  formatDate,
  getLang,
  initPreferences,
  startCountdown,
  t,
} from './common.js';

const $ = (sel) => document.querySelector(sel);
const id = decodeURIComponent(location.pathname.split('/')[2] || '');

initPreferences();
fillConfigText();
bindCopyButtons();

let currentPaste = null;
let lastError = null;

function showError(status, message) {
  lastError = { status, message };
  $('#state-loading').classList.add('hidden');
  $('#paste-view').classList.add('hidden');
  $('#error-code').textContent = status || '!';
  $('#error-title').textContent =
    status === 410 ? t('paste.errExpiredTitle') : status === 404 ? t('paste.errNotFoundTitle') : message || t('paste.errGenericTitle');
  $('#error-text').textContent = status === 410 ? t('paste.errExpiredText') : t('paste.errNotFoundText');
  document.title = `${$('#error-title').textContent} – nulldrive`;
  $('#state-error').classList.remove('hidden');
}

function renderPasteMeta(paste) {
  if (!paste) return;
  const title = paste.title || t('paste.untitled');
  document.title = `${title} – nulldrive`;
  $('#paste-title').textContent = title;
  $('#meta-created').textContent = formatDate(paste.createdAt);
  $('#meta-size').textContent = formatBytes(paste.sizeBytes);
  const lines = paste.content.split('\n');
  const lineCount = paste.content.endsWith('\n') ? lines.length - 1 : lines.length;
  $('#meta-lines').textContent = `${lineCount.toLocaleString(getLang())} ${
    lineCount === 1 ? t('paste.lineSingular') : t('paste.linePlural')
  }`;
}

async function load() {
  let paste;
  try {
    paste = await api(`/api/pastes/${encodeURIComponent(id)}`);
  } catch (err) {
    return showError(err.status, err.message);
  }

  currentPaste = paste;
  renderPasteMeta(paste);
  $('#paste-md5').textContent = paste.md5;

  const lines = paste.content.split('\n');
  const lineCount = paste.content.endsWith('\n') ? lines.length - 1 : lines.length;
  $('#gutter').textContent = Array.from({ length: Math.max(1, lineCount) }, (_, i) => i + 1).join('\n');
  $('#code').textContent = paste.content;

  startCountdown($('#meta-countdown'), paste.expiresAt, () => showError(410));

  $('#btn-raw').href = `${paste.url}/raw`;
  $('#btn-download-txt').href = `${paste.url}/download`;
  $('#btn-download-md5').href = `${paste.url}/download.md5`;
  $('#btn-copy-text').addEventListener('click', () => copyText(paste.content, t('common.textCopied')));
  $('#btn-copy-link').addEventListener('click', () => copyText(absoluteUrl(paste.url), t('common.linkCopied')));

  const name = paste.fileName;
  $('#cmd-win').textContent = `certutil -hashfile "${name}" MD5`;
  $('#cmd-linux').textContent = `md5sum "${name}"`;
  $('#cmd-check').textContent = `md5sum -c "${name}.md5"`;

  $('#state-loading').classList.add('hidden');
  $('#paste-view').classList.remove('hidden');
}

window.addEventListener('langchange', () => {
  if (lastError) showError(lastError.status, lastError.message);
  if (currentPaste) renderPasteMeta(currentPaste);
});

load();
