.PHONY: help up build dev down clean restart logs ps status check cleanup push

.DEFAULT_GOAL := help

help: ## Exibe esta mensagem de ajuda
	@echo "NullDrive - Comandos disponíveis no Makefile:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

up: ## Inicia a aplicação em background via Docker Compose (porta 8000)
	docker compose up -d --build

build: ## Reconstrói a imagem Docker da aplicação
	docker compose build

dev: ## Inicia em modo desenvolvimento com hot-reload
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

down: ## Para e remove os containers (mantém os arquivos no volume)
	docker compose down

clean: ## Para os containers e APAGA o volume de dados (nulldrive-storage)
	docker compose down -v

restart: ## Reinicia o container da aplicação
	docker compose restart app

logs: ## Exibe e acompanha os logs do container
	docker compose logs -f app

ps: ## Lista o status dos containers
	docker compose ps

cleanup: ## Dispara a limpeza imediata de arquivos expirados via API
	curl -s -X POST http://localhost:8000/api/admin/cleanup && echo ""

check: ## Verifica a sintaxe de todos os arquivos JavaScript
	@for f in src/*.js src/routes/*.js src/services/*.js src/utils/*.js public/js/*.js; do \
		node --check "$$f" || exit 1; \
	done
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
