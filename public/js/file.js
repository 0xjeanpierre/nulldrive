import { api, absoluteUrl, bindCopyButtons, copyText, fileBadge, fillConfigText, formatBytes, formatDate, startCountdown } from './common.js';

const $ = (sel) => document.querySelector(sel);
const id = decodeURIComponent(location.pathname.split('/')[2] || '');

fillConfigText();
bindCopyButtons();

function showError(status, message) {
  $('#state-loading').classList.add('hidden');
  $('#file-view').classList.add('hidden');
  $('#error-code').textContent = status || '!';
  $('#error-title').textContent =
    status === 410 ? 'Este arquivo expirou' : status === 404 ? 'Arquivo não encontrado' : message || 'Algo deu errado';
  $('#error-text').textContent =
    status === 410
      ? 'O prazo de retenção acabou e o arquivo foi removido do servidor.'
      : 'O link pode ter expirado, ainda estar em envio ou nunca ter existido.';
  document.title = `${$('#error-title').textContent} – vpendrive`;
  $('#state-error').classList.remove('hidden');
}

async function load() {
  let file;
  try {
    file = await api(`/api/files/${encodeURIComponent(id)}`);
  } catch (err) {
    return showError(err.status, err.message);
  }

  document.title = `${file.fileName} – vpendrive`;
  $('#file-name').textContent = file.fileName;
  $('#file-badge').textContent = fileBadge(file.fileName);
  $('#meta-size').textContent = formatBytes(file.sizeBytes, 2);
  $('#meta-created').textContent = formatDate(file.createdAt);
  $('#file-md5').textContent = file.md5;
  startCountdown($('#meta-countdown'), file.expiresAt, () => showError(410));

  $('#btn-download').href = file.downloadUrl;
  $('#btn-download-md5').href = `${file.url}/download.md5`;
  $('#btn-copy-link').addEventListener('click', () => copyText(absoluteUrl(file.url), 'Link copiado!'));

  const name = file.fileName;
  $('#cmd-win').textContent = `certutil -hashfile "${name}" MD5`;
  $('#cmd-linux').textContent = `md5sum "${name}"`;
  $('#cmd-check').textContent = `md5sum -c "${name}.md5"`;

  $('#state-loading').classList.add('hidden');
  $('#file-view').classList.remove('hidden');
}

load();
