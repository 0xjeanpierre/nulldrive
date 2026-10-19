import {
  api,
  absoluteUrl,
  bindCopyButtons,
  fileBadge,
  fillConfigText,
  formatBytes,
  formatDate,
  formatDuration,
  getExtension,
  getLang,
  getPublicConfig,
  initPreferences,
  t,
  toast,
} from './common.js';
import { ChunkUploader, getPending, clearPending } from './uploader.js';

const $ = (sel) => document.querySelector(sel);

initPreferences();
document.title = t('home.pageTitle');

let cfg;
fillConfigText().then((c) => {
  cfg = c;
  updateCounter();
});
getPublicConfig().then((c) => (cfg ??= c));
bindCopyButtons();

/* ===================== Abas ===================== */
const tabs = $('#tabs');
function selectTab(name, focus = false) {
  tabs.dataset.active = name;
  for (const btn of tabs.querySelectorAll('[role="tab"]')) {
    const active = btn.dataset.tab === name;
    btn.setAttribute('aria-selected', String(active));
    btn.tabIndex = active ? 0 : -1;
    $(`#${btn.getAttribute('aria-controls')}`).hidden = !active;
    if (active && focus) btn.focus();
  }
  history.replaceState(null, '', name === 'file' ? '#files' : location.pathname === '/files' ? '/' : location.pathname);
}
tabs.addEventListener('click', (e) => {
  const btn = e.target.closest('[role="tab"]');
  if (btn) selectTab(btn.dataset.tab);
});
tabs.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    selectTab(tabs.dataset.active === 'text' ? 'file' : 'text', true);
  }
});
if (location.hash === '#files' || location.hash === '#file' || location.hash === '#arquivo' || location.pathname === '/files') {
  selectTab('file');
}

/* ===================== Paste ===================== */
const form = $('#paste-form');
const titleEl = $('#paste-title');
const contentEl = $('#paste-content');
const counterEl = $('#paste-counter');
const createBtn = $('#btn-create-paste');
const encoder = new TextEncoder();
let counterRaf = 0;

function updateCounter() {
  cancelAnimationFrame(counterRaf);
  counterRaf = requestAnimationFrame(() => {
    const text = contentEl.value;
    const bytes = encoder.encode(text).length;
    const max = cfg?.maxPasteSizeBytes ?? 10 * 1024 ** 2;
    counterEl.textContent = t('home.counter', {
      chars: text.length.toLocaleString(getLang()),
      size: formatBytes(bytes),
      max: formatBytes(max, 0),
    });
    const over = bytes > max;
    counterEl.classList.toggle('over', over);
    createBtn.disabled = over;
  });
}
contentEl.addEventListener('input', updateCounter);

// Tab insere tabulação no editor
contentEl.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    document.execCommand('insertText', false, '\t');
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    form.requestSubmit();
  }
});
titleEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!contentEl.value.trim()) {
    toast(t('home.toastEmptyPaste'), 'error');
    contentEl.focus();
    return;
  }
  createBtn.classList.add('loading');
  try {
    const paste = await api('/api/pastes', {
      method: 'POST',
      body: JSON.stringify({ title: titleEl.value, content: contentEl.value }),
    });
    $('#paste-link').value = absoluteUrl(paste.url);
    $('#paste-md5').value = paste.md5;
    $('#btn-open-paste').href = paste.url;
    $('#btn-download-paste-txt').href = `${paste.url}/download`;
    $('#btn-download-paste-md5').href = `${paste.url}/download.md5`;
    form.classList.add('hidden');
    $('#paste-result').classList.remove('hidden');
    toast(t('home.toastPasteCreated'));
    fillConfigText(true);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    createBtn.classList.remove('loading');
  }
});

$('#btn-new-paste').addEventListener('click', () => {
  form.reset();
  updateCounter();
  $('#paste-result').classList.add('hidden');
  form.classList.remove('hidden');
  contentEl.focus();
});

/* ===================== Upload ===================== */
const dropzone = $('#dropzone');
const fileInput = $('#file-input');
const box = $('#upload-box');
const progress = $('#upload-progress');
const bar = $('#upload-bar');
const statusEl = $('#upload-status');
const btnPause = $('#btn-pause');
const btnResume = $('#btn-resume');
const btnCancel = $('#btn-cancel');
const btnRetrySelect = $('#btn-retry-select');
const resumeBanner = $('#resume-banner');
let uploader = null;
let pending = null;
let lastUploadedFile = null;

function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = `status-line ${kind}`;
}

function showView(view) {
  dropzone.classList.toggle('hidden', view !== 'drop');
  box.classList.toggle('hidden', view !== 'box');
  $('#upload-result').classList.toggle('hidden', view !== 'result');
  if (view !== 'drop') resumeBanner.classList.add('hidden');
}

async function checkPending() {
  pending = getPending();
  if (!pending) return;
  try {
    const s = await api(`/api/uploads/${pending.uploadId}/status`);
    if (s.status !== 'uploading') throw new Error('not pending');
    const pct = s.size ? Math.floor((s.receivedBytes / s.size) * 100) : 0;
    $('#resume-text').textContent = t('home.resumeBanner', { name: pending.name, pct });
    resumeBanner.classList.remove('hidden');
  } catch {
    clearPending();
    pending = null;
  }
}
checkPending();

$('#btn-discard-pending').addEventListener('click', async () => {
  if (pending) {
    api(`/api/uploads/${pending.uploadId}`, { method: 'DELETE' }).catch(() => {});
    clearPending();
    pending = null;
  }
  resumeBanner.classList.add('hidden');
  toast(t('home.toastPendingDiscarded'));
});

function validateFile(file) {
  const allowed = cfg?.allowedExtensions ?? ['.zip', '.7z'];
  const max = cfg?.maxFileSizeBytes ?? 15 * 1024 ** 3;
  if (!allowed.includes(getExtension(file.name))) {
    return t('home.errTypeNotAllowed', { allowed: allowed.join(t('common.or')) });
  }
  if (file.size === 0) return t('home.errFileEmpty');
  if (file.size > max) {
    return t('home.errFileTooLarge', { size: formatBytes(file.size), max: formatBytes(max, 0) });
  }
  return null;
}

async function handleFile(file) {
  if (!file) return;
  if (uploader && ['initializing', 'uploading', 'pausing', 'paused', 'finalizing'].includes(uploader.state)) {
    toast(t('home.toastUploadInProgress'), 'error');
    return;
  }
  const error = validateFile(file);
  if (error) {
    toast(error, 'error');
    return;
  }

  let resumeId = null;
  if (pending) {
    if (pending.name === file.name && pending.size === file.size) {
      resumeId = pending.uploadId;
    } else if (confirm(t('home.confirmReplacePending', { oldName: pending.name, newName: file.name }))) {
      api(`/api/uploads/${pending.uploadId}`, { method: 'DELETE' }).catch(() => {});
      clearPending();
    } else {
      return;
    }
    pending = null;
  }

  $('#upload-name').textContent = file.name;
  $('#upload-size').textContent = formatBytes(file.size, 2);
  $('#upload-badge').textContent = fileBadge(file.name);
  bar.style.width = '0%';
  progress.className = 'progress';
  ['#stat-percent', '#stat-sent', '#stat-speed', '#stat-eta'].forEach((s) => ($(s).textContent = '—'));
  showView('box');

  uploader = new ChunkUploader(file, { onProgress, onState, onNotice: (msg) => setStatus(msg) });
  uploader.start(resumeId);
}

function onProgress(p) {
  const pct = Math.min(100, p.percent);
  bar.style.width = `${pct.toFixed(2)}%`;
  progress.setAttribute('aria-valuenow', pct.toFixed(0));
  const pctFormatted = getLang() === 'pt-BR' ? pct.toFixed(1).replace('.', ',') : pct.toFixed(1);
  $('#stat-percent').textContent = `${pctFormatted}%`;
  $('#stat-sent').textContent = `${formatBytes(p.sent)} / ${formatBytes(p.total)}`;
  $('#stat-speed').textContent = p.speed ? `${formatBytes(p.speed)}/s` : '—';
  $('#stat-eta').textContent = p.speed ? formatDuration(p.eta) : '—';
  if (uploader?.state === 'uploading' && !statusEl.textContent.startsWith('Falha') && !statusEl.textContent.startsWith('Chunk')) {
    setStatus(t('home.statusUploadingPart', { current: Math.min(p.doneChunks + 1, p.totalChunks), total: p.totalChunks }));
  }
}

function setButtons({ pause = false, resume = false, cancel = false, retry = false }) {
  btnPause.classList.toggle('hidden', !pause);
  btnResume.classList.toggle('hidden', !resume);
  btnCancel.classList.toggle('hidden', !cancel);
  btnRetrySelect.classList.toggle('hidden', !retry);
}

function onState(state, data) {
  switch (state) {
    case 'initializing':
      setStatus(t('home.statusPreparing'));
      setButtons({ cancel: true });
      break;
    case 'uploading':
      progress.className = 'progress';
      setButtons({ pause: true, cancel: true });
      break;
    case 'pausing':
      setStatus(t('home.statusPausing'));
      setButtons({ cancel: true });
      break;
    case 'paused':
      progress.className = 'progress paused';
      setStatus(t('home.statusPaused'));
      $('#stat-speed').textContent = '—';
      $('#stat-eta').textContent = '—';
      setButtons({ resume: true, cancel: true });
      break;
    case 'finalizing':
      progress.className = 'progress indeterminate';
      setStatus(t('home.statusFinalizing'));
      $('#stat-speed').textContent = '—';
      $('#stat-eta').textContent = '—';
      setButtons({});
      break;
    case 'done':
      progress.className = 'progress done';
      bar.style.width = '100%';
      showResult(data);
      break;
    case 'error':
      progress.className = 'progress paused';
      setStatus(`✕ ${data?.message || t('home.statusError')}`, 'error');
      setButtons({ retry: true });
      toast(data?.message || t('home.statusError'), 'error');
      checkPending();
      break;
    case 'cancelled':
      toast(t('home.toastUploadCancelled'));
      showView('drop');
      break;
  }
}

function renderUploadResultMeta(file) {
  if (!file) return;
  $('#upload-result-meta').textContent = t('home.uploadResultMeta', {
    name: file.fileName,
    size: formatBytes(file.sizeBytes, 2),
    date: formatDate(file.expiresAt),
  });
}

function showResult(file) {
  lastUploadedFile = file;
  $('#file-link').value = absoluteUrl(file.url);
  $('#file-md5').value = file.md5;
  $('#btn-open-file').href = file.url;
  $('#btn-download-file').href = file.downloadUrl;
  renderUploadResultMeta(file);
  showView('result');
  toast(t('home.toastFileUploaded'));
  fillConfigText(true);
}

window.addEventListener('langchange', () => {
  document.title = t('home.pageTitle');
  updateCounter();
  if (!resumeBanner.classList.contains('hidden')) checkPending();
  if (lastUploadedFile) renderUploadResultMeta(lastUploadedFile);
});

btnPause.addEventListener('click', () => uploader?.pause());
btnResume.addEventListener('click', () => uploader?.resume());
btnCancel.addEventListener('click', () => {
  if (confirm(t('home.confirmCancelUpload'))) uploader?.cancel();
});
btnRetrySelect.addEventListener('click', () => {
  uploader = null;
  showView('drop');
  fileInput.click();
});
$('#btn-new-upload').addEventListener('click', () => {
  uploader = null;
  showView('drop');
});

fileInput.addEventListener('change', () => {
  handleFile(fileInput.files[0]);
  fileInput.value = '';
});

dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

let dragDepth = 0;
dropzone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragover', (e) => e.preventDefault());
dropzone.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    dropzone.classList.remove('dragover');
  }
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropzone.classList.remove('dragover');
  const files = e.dataTransfer?.files;
  if (files?.length > 1) toast(t('home.toastSingleFile'), 'error');
  handleFile(files?.[0]);
});

// Arquivo solto fora da dropzone: muda para a aba e não deixa o navegador abrir o arquivo
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer?.files?.length && !dropzone.contains(e.target)) {
    selectTab('file');
    handleFile(e.dataTransfer.files[0]);
  }
});

window.addEventListener('beforeunload', (e) => {
  if (uploader && ['initializing', 'uploading', 'finalizing'].includes(uploader.state)) {
    e.preventDefault();
    e.returnValue = '';
  }
});
