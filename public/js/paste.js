import { api, absoluteUrl, bindCopyButtons, copyText, fillConfigText, formatBytes, formatDate, startCountdown } from './common.js';

const $ = (sel) => document.querySelector(sel);
const id = decodeURIComponent(location.pathname.split('/')[2] || '');

fillConfigText();
bindCopyButtons();

function showError(status, message) {
  $('#state-loading').classList.add('hidden');
  $('#paste-view').classList.add('hidden');
  $('#error-code').textContent = status || '!';
  $('#error-title').textContent =
    status === 410 ? 'Este paste expirou' : status === 404 ? 'Paste não encontrado' : message || 'Algo deu errado';
  $('#error-text').textContent =
    status === 410
      ? 'O prazo de retenção acabou e o conteúdo foi removido do servidor.'
      : 'O link pode ter expirado ou nunca ter existido.';
  document.title = `${$('#error-title').textContent} – vpendrive`;
  $('#state-error').classList.remove('hidden');
}

async function load() {
  let paste;
  try {
    paste = await api(`/api/pastes/${encodeURIComponent(id)}`);
  } catch (err) {
    return showError(err.status, err.message);
  }

  const title = paste.title || 'Paste sem título';
  document.title = `${title} – vpendrive`;
  $('#paste-title').textContent = title;
  $('#meta-created').textContent = formatDate(paste.createdAt);
  $('#meta-size').textContent = formatBytes(paste.sizeBytes);
  $('#paste-md5').textContent = paste.md5;

  const lines = paste.content.split('\n');
  const lineCount = paste.content.endsWith('\n') ? lines.length - 1 : lines.length;
  $('#meta-lines').textContent = `${lineCount.toLocaleString('pt-BR')} ${lineCount === 1 ? 'linha' : 'linhas'}`;
  $('#gutter').textContent = Array.from({ length: Math.max(1, lineCount) }, (_, i) => i + 1).join('\n');
  $('#code').textContent = paste.content;

  startCountdown($('#meta-countdown'), paste.expiresAt, () => showError(410));

  $('#btn-raw').href = `${paste.url}/raw`;
  $('#btn-download-txt').href = `${paste.url}/download`;
  $('#btn-download-md5').href = `${paste.url}/download.md5`;
  $('#btn-copy-text').addEventListener('click', () => copyText(paste.content, 'Texto copiado!'));
  $('#btn-copy-link').addEventListener('click', () => copyText(absoluteUrl(paste.url), 'Link copiado!'));

  const name = paste.fileName;
  $('#cmd-win').textContent = `certutil -hashfile "${name}" MD5`;
  $('#cmd-linux').textContent = `md5sum "${name}"`;
  $('#cmd-check').textContent = `md5sum -c "${name}.md5"`;

  $('#state-loading').classList.add('hidden');
  $('#paste-view').classList.remove('hidden');
}

load();
