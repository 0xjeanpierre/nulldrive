#!/usr/bin/env bash
# Roda o SonarQube Scanner sobre o projeto (código em app/).
# Configuração em scan/.env (veja scan/.env.example).
set -euo pipefail

SCAN_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCAN_DIR/.." && pwd)"
ENV_FILE="$SCAN_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Erro: $ENV_FILE não encontrado. Copie scan/.env.example e preencha." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${SQB_SERVER:?defina SQB_SERVER no scan/.env}"
: "${SQB_PORT:?defina SQB_PORT no scan/.env}"
: "${SQB_TOKEN:?defina SQB_TOKEN no scan/.env}"
: "${PROJECT_KEY:?defina PROJECT_KEY no scan/.env}"

# Gera coverage/lcov.info (testes rodam em container)
"$ROOT/tests/run.sh"

docker run --rm --network host \
  -e SONAR_HOST_URL="${SQB_SERVER}:${SQB_PORT}" \
  -e SONAR_TOKEN="${SQB_TOKEN}" \
  -v "${ROOT}:/usr/src" \
  sonarsource/sonar-scanner-cli \
  -Dsonar.projectKey="${PROJECT_KEY}" \
  -Dsonar.sources=app/src,app/public \
  -Dsonar.tests=tests \
  -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
  -Dsonar.coverage.exclusions=app/public/js/app.js,app/public/js/paste.js,app/public/js/file.js \
  -Dsonar.cpd.exclusions=app/public/js/common.js,app/src/routes/docs.js,app/public/*.html
