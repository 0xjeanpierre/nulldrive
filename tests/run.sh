#!/usr/bin/env bash
# Roda a suíte de testes dentro do container (imagem nulldrive:latest, Node 20) e gera coverage/lcov.info.
# Não exige Node na máquina host. Uso: tests/run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${TEST_IMAGE:-nulldrive:latest}"

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Imagem $IMAGE não encontrada; construindo (make build)..." >&2
  docker build -q -f "$ROOT/docker/Dockerfile" -t "$IMAGE" "$ROOT/app"
fi

mkdir -p "$ROOT/coverage"
rm -f "$ROOT/coverage/lcov.raw"

# node_modules vem da imagem (/app/node_modules); o link é removido ao final
docker run --rm --user "$(id -u):$(id -g)" -v "$ROOT:/work" -w /work/app "$IMAGE" sh -c '
  ln -sfn /app/node_modules node_modules
  node --test --experimental-test-coverage \
    --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=lcov --test-reporter-destination=../coverage/lcov.raw \
    ../tests/unit.test.js ../tests/api.test.js ../tests/frontend.test.js ../tests/paste-form.test.js
  rc=$?
  rm -f node_modules
  exit $rc
'

# Caminhos relativos a app/ -> relativos à raiz do repositório (SF:app/...); remove arquivos de teste e duplicatas
awk '
  /^SF:/ {
    skip = ($0 ~ /(^SF:\.\.\/tests|node_modules|\/tests\/)/) || ($0 in seen)
    seen[$0] = 1
    if (!skip) sub(/^SF:/, "SF:app/")
  }
  { if (!skip) print }
  /^end_of_record/ { skip = 0 }
' "$ROOT/coverage/lcov.raw" > "$ROOT/coverage/lcov.info"
rm -f "$ROOT/coverage/lcov.raw"
echo "LCOV gerado em coverage/lcov.info"
