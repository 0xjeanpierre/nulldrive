---
name: fix-from-qube
description: >-
  Executa o scanner do SonarQube via Docker a partir do script sonar-scan.sh do projeto, consulta os apontamentos (Bugs, Vulnerabilities e Code Smells) na API do SonarQube, corrige os problemas diretamente no código-fonte e re-executa o scan para validar que as issues foram fechadas automaticamente. Use esta skill sempre que o usuário pedir para rodar o scan do SonarQube, corrigir apontamentos do SonarQube ou executar o fluxo fix-from-qube.
---

# Fix From Qube (Scan -> Análise -> Correção no Código -> Re-Scan)

Esta skill define o fluxo completo para executar a análise do SonarQube via `sonar-scan.sh`, inspecionar os problemas reportados diretamente na API do servidor SonarQube, corrigi-los no código-fonte do projeto e validar a resolução rodando um novo scan.

---

## Regras Inegociáveis

1. **Não invente nem suponha informações:** Nunca invente URLs de servidor, tokens, chaves de projeto (`projectKey`) ou regras de negócio. Extraia os dados exclusivamente do arquivo `sonar-scan.sh` existente no projeto.
2. **Não configure projetos por conta própria:** Se o arquivo `sonar-scan.sh` não existir, estiver incompleto ou se houver qualquer dúvida sobre comportamento do código/regra de negócio, **pergunte ao usuário antes de agir**.
3. **Resolução via código + novo scan:** Nunca feche issues manualmente na plataforma/API do SonarQube. Todas as correções devem ser feitas no código-fonte para que o próximo scan feche os apontamentos sozinho.

---

## Passo a Passo de Execução

### 1. Localizar e Ler o `sonar-scan.sh`
1. Procure o script `sonar-scan.sh` no workspace (por exemplo, `sonar-scan.sh` ou `scan/sonar-scan.sh`).
2. Se não encontrar o script ou se faltarem parâmetros essenciais, pare e pergunte ao usuário.
3. Leia o conteúdo do `sonar-scan.sh` para identificar:
   - O comando `docker run` com `sonarsource/sonar-scanner-cli`.
   - A URL do servidor SonarQube (ex.: variável `SQB_SERVER` / `SONAR_HOST_URL` e porta).
   - A chave do projeto (`PROJECT_KEY` / `-Dsonar.projectKey`).
   - O token de autenticação (`SQB_TOKEN` / `SONAR_TOKEN`).

### 2. Executar o Scan Inicial
1. Execute o script `sonar-scan.sh` a partir do diretório raiz do projeto (garantindo que o bind mount `-v "$(pwd):/usr/src"` mapeie a raiz correta do código):
   ```bash
   bash <caminho-do-sonar-scan.sh>
   ```
2. Aguarde o término do container com `ANALYSIS SUCCESSFUL` / `EXECUTION SUCCESS`.
3. Caso o log informe a URL da tarefa de processamento (`/api/ce/task?id=...`), aguarde até que o status do processamento no servidor esteja concluído (`SUCCESS`).

### 3. Consultar os Problemas via API do SonarQube
Utilizando a URL, o token e o `PROJECT_KEY` lidos do `sonar-scan.sh`, consulte a API REST do SonarQube:

1. **Status do Quality Gate:**
   ```bash
   curl -s -u "<TOKEN>:" "<SONAR_HOST_URL>/api/qualitygates/project_status?projectKey=<PROJECT_KEY>"
   ```
2. **Issues Abertas (`resolved=false`):**
   ```bash
   curl -s -u "<TOKEN>:" "<SONAR_HOST_URL>/api/issues/search?componentKeys=<PROJECT_KEY>&resolved=false&ps=100"
   ```
3. Se a resposta retornar `total: 0`, informe ao usuário que o projeto já está limpo e encerre o fluxo.

### 4. Ler o Código e Corrigir os Apontamentos
1. Para cada issue aberta retornada pela API, identifique:
   - Arquivo (`component`), linha (`line` / `textRange`), severidade (`severity`), tipo (`BUG`, `VULNERABILITY`, `CODE_SMELL`), regra (`rule`) e mensagem (`message`).
2. Leia o arquivo correspondente no projeto para compreender o contexto completo antes de editar.
3. **Verificação de ambiguidade:** Se a correção de uma issue puder alterar um comportamento funcional ou depender de uma escolha de arquitetura do usuário, **pergunte ao usuário antes de modificar**.
4. Aplique as correções no código-fonte preservando a funcionalidade existente.

### 5. Rodar Novamente o Scan e Confirmar Resolução
1. Após aplicar todas as correções no código, execute novamente o script `sonar-scan.sh`:
   ```bash
   bash <caminho-do-sonar-scan.sh>
   ```
2. Aguarde a conclusão do scan e consulte novamente a API de issues abertas:
   ```bash
   curl -s -u "<TOKEN>:" "<SONAR_HOST_URL>/api/issues/search?componentKeys=<PROJECT_KEY>&resolved=false&ps=100"
   ```
3. Apresente ao usuário o resumo das correções realizadas no código e o resultado atualizado do SonarQube (confirmando quais issues foram fechadas automaticamente pelo novo scan).
