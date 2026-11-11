.PHONY: help up build dev down clean restart logs ps status check scan cleanup push

.DEFAULT_GOAL := help

# Arquivos do Docker ficam em docker/; o contexto de build é app/
COMPOSE := docker compose -f docker/docker-compose.yml

help: ## Exibe esta mensagem de ajuda
	@echo "NullDrive - Comandos disponíveis no Makefile:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

up: ## Inicia a aplicação em background via Docker Compose (HTTPS na porta 443)
	$(COMPOSE) up -d --build

build: ## Reconstrói a imagem Docker da aplicação
	$(COMPOSE) build

dev: ## Inicia em modo desenvolvimento com hot-reload (portas 8000 e 8443)
	$(COMPOSE) -f docker/docker-compose.dev.yml up --build

down: ## Para e remove os containers (mantém os arquivos no volume)
	$(COMPOSE) down

clean: ## Para os containers e APAGA o volume de dados (nulldrive-storage)
	$(COMPOSE) down -v

restart: ## Reinicia os containers da stack
	$(COMPOSE) restart

logs: ## Exibe e acompanha os logs dos containers
	$(COMPOSE) logs -f

ps: ## Lista o status dos containers
	$(COMPOSE) ps

cleanup: ## Dispara a limpeza imediata de arquivos expirados via API
	curl -sk -X POST https://localhost:443/api/admin/cleanup && echo ""

test: ## Roda os testes em container Docker e gera coverage/lcov.info
	@./tests/run.sh

scan: ## Roda o SonarQube Scanner sobre o projeto (usa scan/sonar-scan.sh)
	@./scan/sonar-scan.sh

check: ## Verifica a sintaxe de todos os arquivos JavaScript
	@if command -v node >/dev/null 2>&1; then \
		for f in app/src/*.js app/src/routes/*.js app/src/services/*.js app/src/utils/*.js app/public/js/*.js; do \
			node --check "$$f" || exit 1; \
		done; \
	else \
		docker run --rm -v "$(CURDIR)/app:/work" -w /work nulldrive:latest sh -c '\
			for f in src/*.js src/routes/*.js src/services/*.js src/utils/*.js public/js/*.js; do \
				node --check "$$f" || exit 1; \
			done'; \
	fi
	@echo "Sintaxe OK!"

push: ## Adiciona alterações, solicita mensagem de commit e faz git push
	@git status -s
	@msg="$(MSG)"; \
	if [ -z "$$msg" ]; then \
		printf "Digite a mensagem do commit: "; \
		read -r msg; \
	fi; \
	if [ -z "$$msg" ]; then \
		echo "Erro: A mensagem de commit não pode ser vazia."; \
		exit 1; \
	fi; \
	git add -A && \
	git commit -m "$$msg" && \
	git push
