#!/usr/bin/env python3
"""E2E: clicar em "Criar paste" precisa criar o paste e mostrar o resultado.

Requer a aplicação rodando (ex.: `make dev`) e o Playwright instalado no host:
    python3 -m venv .venv-e2e && .venv-e2e/bin/pip install playwright
    .venv-e2e/bin/python tests/e2e/paste_create.py http://localhost:8000/
    .venv-e2e/bin/python tests/e2e/paste_create.py https://localhost:8443/

Sai com código 1 se o paste não for criado (regressão do bug do TDZ em counterRaf).
Usa o Chrome do sistema (CHROME_PATH, padrão /usr/bin/google-chrome) para não baixar browsers.
"""
import os
import sys

from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000/"
chrome = os.environ.get("CHROME_PATH", "/usr/bin/google-chrome")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=chrome, args=["--no-sandbox"])
    page = browser.new_context(ignore_https_errors=True).new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    api_statuses = []
    page.on("response", lambda r: api_statuses.append(r.status) if "/api/pastes" in r.url and r.request.method == "POST" else None)

    page.goto(url, wait_until="networkidle")
    page.fill("#paste-content", "texto de teste e2e")
    page.click("#btn-create-paste")
    page.wait_for_timeout(2500)

    created = page.is_visible("#paste-result") and api_statuses == [201]
    browser.close()

if errors:
    print("Erros de página:", *errors, sep="\n  ")
if created:
    print(f"OK: paste criado em {url}")
    sys.exit(0)
print(f"FALHA: paste não criado em {url} (POST /api/pastes: {api_statuses or 'nenhuma requisição'})")
sys.exit(1)
