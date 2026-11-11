# syntax=docker/dockerfile:1

############################
# Estágio 1 – dependências #
############################
FROM node:20-bookworm-slim AS deps

# Ferramentas para compilar módulos nativos (better-sqlite3), caso não exista binário pré-compilado
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./

# Usa lockfile se existir; senão faz install normal
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
 && npm cache clean --force

########################
# Estágio 2 – runtime  #
########################
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8000 \
    STORAGE_DIR=/app/storage \
    CONFIG_PATH=/app/config/config.json

WORKDIR /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

# Pastas persistentes (montadas como volume pelo compose)
RUN mkdir -p /app/storage/pastes /app/storage/files /app/storage/tmp /app/storage/db /app/config \
 && chown -R node:node /app/storage /app/config

USER node

EXPOSE 8000

VOLUME ["/app/storage"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
