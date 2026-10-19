import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

/** Valores padrão (menor precedência). */
export const DEFAULTS = Object.freeze({
  port: 8000,
  host: '0.0.0.0',
  storageDir: './storage',
  retentionDays: 3,
  maxFileSizeBytes: 15 * 1024 ** 3, // 15 GB
  chunkSizeBytes: 50 * 1024 ** 2, // 50 MB
  allowedExtensions: ['.zip', '.7z'],
  maxPasteSizeBytes: 10 * 1024 ** 2, // 10 MB
  cleanupIntervalMinutes: 60,
  incompleteUploadTtlHours: 24,
});

/** Variável de ambiente -> [chave, tipo]. */
const ENV_MAP = {
  HOST: ['host', 'string'],
  PORT: ['port', 'int'],
  STORAGE_DIR: ['storageDir', 'string'],
  RETENTION_DAYS: ['retentionDays', 'number'],
  MAX_FILE_SIZE_BYTES: ['maxFileSizeBytes', 'int'],
  CHUNK_SIZE_BYTES: ['chunkSizeBytes', 'int'],
  CLEANUP_INTERVAL_MINUTES: ['cleanupIntervalMinutes', 'number'],
};

/** Chaves que podem ser alteradas em tempo de execução, com limites. */
export const EDITABLE = {
  retentionDays: { type: 'number', min: 0.01, max: 365 },
  maxFileSizeBytes: { type: 'int', min: 1024 * 1024, max: 1024 ** 4 },
  chunkSizeBytes: { type: 'int', min: 1024 * 1024, max: 512 * 1024 ** 2 },
  maxPasteSizeBytes: { type: 'int', min: 1024, max: 100 * 1024 ** 2 },
  cleanupIntervalMinutes: { type: 'number', min: 1, max: 1440 },
  incompleteUploadTtlHours: { type: 'number', min: 1, max: 720 },
};

const ALLOWED_EXTENSIONS = ['.zip', '.7z'];

export const CONFIG_PATH = path.resolve(process.env.CONFIG_PATH || './config/config.json');

export const configEvents = new EventEmitter();

function parseValue(raw, type) {
  if (type === 'string') return String(raw);
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return type === 'int' ? Math.trunc(n) : n;
}

function readFileConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('o conteúdo precisa ser um objeto JSON');
    }
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Bind mount ./config vazio: cria o arquivo com os padrões
      fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2) + '\n');
      console.log(`[config] ${CONFIG_PATH} não existia; criado com valores padrão.`);
      return { ...DEFAULTS };
    }
    console.error(`[config] Erro ao ler ${CONFIG_PATH}: ${err.message}. Usando padrões.`);
    return {};
  }
}

function readEnvOverrides() {
  const out = {};
  for (const [envName, [key, type]] of Object.entries(ENV_MAP)) {
    const raw = process.env[envName];
    if (raw === undefined || raw === '') continue;
    const value = parseValue(raw, type);
    if (value === undefined) {
      console.warn(`[config] Variável ${envName}="${raw}" inválida; ignorada.`);
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Valida um valor editável. Retorna o valor normalizado ou lança erro. */
export function validateEditable(key, value) {
  const rule = EDITABLE[key];
  if (!rule) throw new Error(`"${key}" não pode ser alterado`);
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`"${key}" precisa ser numérico`);
  if (rule.type === 'int' && !Number.isInteger(n)) throw new Error(`"${key}" precisa ser inteiro`);
  if (n < rule.min || n > rule.max) {
    throw new Error(`"${key}" precisa estar entre ${rule.min} e ${rule.max}`);
  }
  return n;
}

function sanitize(cfg) {
  const out = { ...cfg };
  for (const key of Object.keys(EDITABLE)) {
    try {
      out[key] = validateEditable(key, out[key]);
    } catch (err) {
      console.warn(`[config] ${err.message}; usando padrão ${DEFAULTS[key]}.`);
      out[key] = DEFAULTS[key];
    }
  }
  const exts = Array.isArray(out.allowedExtensions)
    ? out.allowedExtensions.map((e) => String(e).toLowerCase()).filter((e) => ALLOWED_EXTENSIONS.includes(e))
    : [];
  out.allowedExtensions = exts.length ? [...new Set(exts)] : [...DEFAULTS.allowedExtensions];
  out.port = Number.isInteger(out.port) && out.port > 0 && out.port < 65536 ? out.port : DEFAULTS.port;
  out.host = typeof out.host === 'string' && out.host ? out.host : DEFAULTS.host;
  out.storageDir = path.resolve(typeof out.storageDir === 'string' && out.storageDir ? out.storageDir : DEFAULTS.storageDir);
  return out;
}

const envOverrides = readEnvOverrides();

/** Configuração efetiva (objeto mutável, compartilhado por todo o app). */
export const config = sanitize({ ...DEFAULTS, ...readFileConfig(), ...envOverrides });

export function getEnvOverriddenKeys() {
  return Object.keys(envOverrides);
}

export const paths = {
  root: config.storageDir,
  db: path.join(config.storageDir, 'db'),
  pastes: path.join(config.storageDir, 'pastes'),
  files: path.join(config.storageDir, 'files'),
  tmp: path.join(config.storageDir, 'tmp'),
};

export function ensureStorageDirs() {
  for (const dir of Object.values(paths)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Atualiza a configuração em memória e grava no config.json (escrita atômica).
 * @param {Record<string, unknown>} patch
 * @returns {{ updated: Record<string, number>, warnings: string[] }}
 */
export function updateConfig(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Corpo da requisição precisa ser um objeto JSON');
  }
  const keys = Object.keys(patch);
  if (!keys.length) throw new Error('Nenhuma chave informada');

  const updated = {};
  for (const key of keys) updated[key] = validateEditable(key, patch[key]);

  // Mescla com o que está no arquivo (preserva chaves não editáveis)
  let fileCfg = {};
  try {
    fileCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    fileCfg = { ...DEFAULTS };
  }
  const next = { ...fileCfg, ...updated };
  const tmp = `${CONFIG_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  try {
    fs.renameSync(tmp, CONFIG_PATH);
  } catch {
    // Alguns bind mounts (Windows) não permitem rename sobre arquivo existente
    fs.copyFileSync(tmp, CONFIG_PATH);
    fs.rmSync(tmp, { force: true });
  }

  const warnings = [];
  const envKeys = getEnvOverriddenKeys();
  for (const key of keys) {
    if (envKeys.includes(key)) {
      const msg = `"${key}" também está definido por variável de ambiente; a env voltará a valer após reiniciar.`;
      console.warn(`[config] ${msg}`);
      warnings.push(msg);
    }
  }

  const previous = {};
  for (const key of keys) previous[key] = config[key];
  Object.assign(config, updated);
  console.log('[config] Atualizado:', updated);
  configEvents.emit('change', updated, previous);
  return { updated, warnings };
}

/** Subconjunto seguro para o frontend. */
export function publicConfig() {
  return {
    retentionDays: config.retentionDays,
    maxFileSizeBytes: config.maxFileSizeBytes,
    chunkSizeBytes: config.chunkSizeBytes,
    allowedExtensions: config.allowedExtensions,
    maxPasteSizeBytes: config.maxPasteSizeBytes,
  };
}
