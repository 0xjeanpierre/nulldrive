# nulldrive 📦📋

Clone moderno e minimalista do Pastebin com suporte a compartilhamento de textos e uploads de **qualquer tipo de arquivo** (exceto pastas) até **1 GB**, com expiração automática configurável (padrão 3 dias) e cálculo de hash **MD5**.

---

## 🚀 Funcionalidades

1. **Colar Texto (Paste)**
   - Geração de link único e compartilhável.
   - Download direto como arquivo `.txt` (UTF-8).
   - Cálculo e download de hash **MD5** (`.md5`) para validação de integridade.
   - Visualização com numeração de linhas, contagem regressiva e atalhos rápidos de cópia.

2. **Upload de Arquivos Grandes**
   - Aceita **qualquer tipo de arquivo** (pastas não são suportadas — compacte-as antes).
   - Limite máximo: **1 GB**.
   - Envio fatiado em **chunks de 50 MB** com streaming direto em disco (sem estourar a memória RAM do servidor).
   - Opcional: restringir extensões via `allowedExtensions` no `config.json` (lista vazia = qualquer tipo).
   - Suporte a **Pausar**, **Retomar** e recuperação automática em caso de instabilidade de rede ou recarregamento de página.
   - Download com suporte a **HTTP Range** (permite pausar/retomar downloads no navegador).

3. **Retenção e Expiração**
   - Padrão: **3 dias** (totalmente configurável).
   - Rotina periódica de limpeza automática (apaga itens vencidos, resíduos órfãos e uploads abandonados).
   - Ajuste em tempo de execução via API administrativa sem necessidade de reiniciar.

4. **Interface, Temas, Idiomas e Documentação Swagger**
   - **Temas**: suporte a **Dark Mode (Color Dim)** e **White Mode (Light)** com alternância no cabeçalho.
   - **Idiomas (i18n)**: interface e documentação disponíveis em **Português (`pt-BR`)** e **Inglês (`en-US`)**.
   - **Rotas padronizadas em inglês**: `/pastes/:id`, `/files/:id`, `/#files`, `/docs`.
   - **API Swagger / OpenAPI 3.0**: documentação interativa disponível em **[http://localhost:8000/docs](http://localhost:8000/docs)** (especificação JSON em `/api/openapi.json`).

---

## 🛠️ Como Executar com Docker Compose (Recomendado)

O projeto foi totalmente projetado para rodar isolado em Docker. Não é necessário ter Node.js instalado na máquina hospedeira.

### 1. Iniciar a aplicação
```powershell
docker compose up -d --build
```
Acesse a aplicação no navegador em: **[http://localhost:8000](http://localhost:8000)** (e a documentação Swagger em **[http://localhost:8000/docs](http://localhost:8000/docs)**).

Para acompanhar os logs do servidor:
```powershell
docker compose logs -f app
```

### 2. Modo Desenvolvimento (com Hot Reload)
Se quiser modificar o código com reinício automático:
```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### 3. Parar o serviço
```powershell
docker compose down
```
> *Nota: Os dados e uploads ficam salvos no volume nomeado `nulldrive-storage` e não são perdidos ao reiniciar o container. Para apagar completamente todos os arquivos e banco de dados, use `docker compose down -v`.*

---

## ⚙️ Configuração

A configuração fica salva em [`config/config.json`](file:///c:/Users/jpos/Documents/dev/nulldrive/config/config.json) (montada como volume dentro do container):

```json
{
  "port": 8000,
  "host": "0.0.0.0",
  "storageDir": "/app/storage",
  "retentionDays": 3,
  "maxFileSizeBytes": 1073741824,
  "chunkSizeBytes": 52428800,
  "allowedExtensions": [],
  "maxPasteSizeBytes": 10485760,
  "cleanupIntervalMinutes": 60,
  "incompleteUploadTtlHours": 24
}
```

### Alterar a Retenção em Tempo de Execução

Você pode alterar a retenção de novos envios para, por exemplo, 5 dias, através de uma chamada HTTP:

```powershell
curl.exe -X PUT http://localhost:8000/api/admin/config `
  -H "Content-Type: application/json" `
  -d '{"retentionDays": 5}'
```

Também é possível forçar a limpeza imediata de arquivos expirados:
```powershell
curl.exe -X POST http://localhost:8000/api/admin/cleanup
```

---

## 🔍 Como Validar os Hashes MD5

Ao baixar o `.txt` ou o arquivo enviado, valide a integridade usando o terminal:

- **Windows (PowerShell / Prompt):**
  ```powershell
  certutil -hashfile "seu-arquivo.zip" MD5
  ```
- **Linux / macOS:**
  ```bash
  md5sum "seu-arquivo.zip"
  ```
- **Validar com arquivo `.md5` baixado:**
  ```bash
  md5sum -c "seu-arquivo.zip.md5"
  ```
