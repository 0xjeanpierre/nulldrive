# Roteiro – nulldrive (clone de Pastebin com upload de arquivos)

> **Como usar:** entregue este arquivo inteiro como prompt para um agente de código.
> Ele deve executar as etapas na ordem, validando cada uma antes de seguir.

---

## 0. Objetivo

Criar um site estilo **Pastebin** chamado **nulldrive**, com código na pasta
`c:\Users\jpos\Documents\dev\nulldrive` e **executado 100% em Docker** (Docker Compose),
com duas funções:

1. **Colar texto** → gera link compartilhável, com download em `.txt` e hash **MD5**.
2. **Upload de arquivos** `.zip` / `.7z` até **1 GB**, que expiram após **3 dias**
   (prazo configurável).

**Fora do escopo nesta fase:** SSL/TLS, HTTPS, login, autenticação, captcha, rate-limit,
criptografia. O foco é **funcionar**.

> [!IMPORTANT]
> Os arquivos `Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml`, `.dockerignore`,
> `.env.example` e `config/config.json` **já existem** no projeto. O agente deve escrever o
> código respeitando-os (caminhos, variáveis de ambiente, porta, healthcheck) e só alterá-los
> se for estritamente necessário, explicando o motivo.
>
> Não é necessário Node instalado no host: todo build, execução e teste roda via
> `docker compose`.

---

## 1. Stack definida

| Camada      | Escolha                                                        |
|-------------|----------------------------------------------------------------|
| Runtime     | Node.js 20+                                                    |
| Servidor    | Express                                                        |
| Upload      | Upload **em chunks** (fatias) via `fetch`, gravado em stream   |
| Metadados   | SQLite (`better-sqlite3`)                                      |
| IDs         | `nanoid` (8–10 caracteres)                                     |
| Frontend    | HTML + CSS puro + JavaScript puro (sem framework)              |
| Config      | `config/config.json` + override por variáveis de ambiente      |
| Container   | `node:20-bookworm-slim` (multi-stage) + Docker Compose         |
| Persistência| Volume `nulldrive-storage` → `/app/storage`; `./config` → `/app/config` |

> Por que chunks? Um único POST de 1 GB falha com facilidade (timeout, memória, proxy).
> Fatiar em partes de ~50 MB torna o envio estável e permite barra de progresso real.

---

## 2. Estrutura de pastas esperada

```
nulldrive/
├─ package.json
├─ package-lock.json      # gerar via container (ver seção 9)
├─ Dockerfile             # JÁ EXISTE
├─ docker-compose.yml     # JÁ EXISTE
├─ docker-compose.dev.yml # JÁ EXISTE (hot reload)
├─ .dockerignore          # JÁ EXISTE
├─ .env.example           # JÁ EXISTE
├─ .gitignore             # node_modules, storage, .env
├─ config/
│  └─ config.json         # JÁ EXISTE – montado em /app/config
├─ README.md
├─ src/
│  ├─ server.js           # bootstrap do Express
│  ├─ config.js           # carrega config.json + env
│  ├─ db.js               # SQLite + migrations
│  ├─ routes/
│  │  ├─ pastes.js
│  │  ├─ uploads.js
│  │  └─ admin.js         # endpoints de config (sem proteção nesta fase)
│  ├─ services/
│  │  ├─ cleanup.js       # job de expiração
│  │  └─ validate.js      # extensão + magic bytes
│  └─ utils/hash.js
├─ public/
│  ├─ index.html          # home com abas: Texto | Arquivo
│  ├─ paste.html          # visualização de um paste
│  ├─ file.html           # página de download de arquivo
│  ├─ css/style.css
│  └─ js/
│     ├─ app.js
│     ├─ paste.js
│     ├─ file.js
│     └─ uploader.js      # lógica de chunks
└─ storage/               # no container: /app/storage (volume nomeado)
   ├─ db/nulldrive.sqlite
   ├─ pastes/
   ├─ files/
   └─ tmp/                # chunks em andamento
```

---

## 3. Configuração (`config/config.json`)

```json
{
  "port": 8000,
  "host": "0.0.0.0",
  "storageDir": "/app/storage",
  "retentionDays": 3,
  "maxFileSizeBytes": 1073741824,
  "chunkSizeBytes": 52428800,
  "allowedExtensions": [".zip", ".7z"],
  "maxPasteSizeBytes": 10485760,
  "cleanupIntervalMinutes": 60,
  "incompleteUploadTtlHours": 24
}
```

Regras:
- `1 GB = 1 * 1024^3 = 1073741824` bytes.
- O caminho do arquivo vem de `CONFIG_PATH` (no container: `/app/config/config.json`;
  fallback local: `./config/config.json`). Se o arquivo **não existir**, criá-lo com os
  valores padrão acima (o bind mount `./config` pode estar vazio).
- Precedência: **padrões no código < config.json < variáveis de ambiente**.
- Variáveis de ambiente suportadas: `HOST`, `PORT`, `STORAGE_DIR`, `CONFIG_PATH`,
  `RETENTION_DAYS`, `MAX_FILE_SIZE_BYTES`, `CHUNK_SIZE_BYTES`, `CLEANUP_INTERVAL_MINUTES`.
- O banco SQLite fica em `<storageDir>/db/nulldrive.sqlite` (dentro do volume).
- Criar as subpastas de `storageDir` no boot, se não existirem.
- `retentionDays` aceita decimal (ex.: `0.5` = 12 h), mínimo `0.01`, máximo `365`.
- **Alteração em tempo de execução** (via backend):
  - `GET  /api/admin/config` → retorna config atual.
  - `PUT  /api/admin/config` → body `{ "retentionDays": 5 }` atualiza memória **e** grava
    no `config.json` (que está no bind mount, portanto persiste e aparece no host).
    Validar tipos e limites. Gravar de forma atômica (arquivo temporário + `rename`).
  - Se a chave também estiver definida por env, logar um aviso: a env voltará a valer
    após reiniciar o container.
  - A mudança afeta **novos** uploads. Opcional: `POST /api/admin/extend/:id`
    com `{ "days": 2 }` para estender um arquivo específico.
- Os pastes de texto usam a mesma `retentionDays` (manter consistente e simples).
- Endpoints auxiliares:
  - `GET /api/health` → `200 { "status": "ok" }` (usado pelo `HEALTHCHECK` do Dockerfile).
  - `GET /api/config/public` → `{ retentionDays, maxFileSizeBytes, chunkSizeBytes, allowedExtensions, maxPasteSizeBytes }`.

---

## 4. Banco de dados (SQLite)

```sql
CREATE TABLE IF NOT EXISTS pastes (
  id          TEXT PRIMARY KEY,
  title       TEXT,
  size_bytes  INTEGER NOT NULL,
  md5         TEXT NOT NULL,
  created_at  INTEGER NOT NULL,   -- epoch ms
  expires_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id              TEXT PRIMARY KEY,
  original_name   TEXT NOT NULL,
  stored_name     TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  received_bytes  INTEGER NOT NULL DEFAULT 0,
  total_chunks    INTEGER NOT NULL,
  received_chunks INTEGER NOT NULL DEFAULT 0,
  md5             TEXT,
  status          TEXT NOT NULL,  -- 'uploading' | 'ready' | 'failed'
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER         -- definido quando status = 'ready'
);
```

O conteúdo do paste fica em `storage/pastes/<id>.txt` (não no banco).

---

## 5. Feature 1 – Colar texto

### API
| Método | Rota                       | Descrição                                          |
|--------|----------------------------|----------------------------------------------------|
| POST   | `/api/pastes`              | body JSON `{ title?, content }` → `{ id, url, md5, expiresAt }` |
| GET    | `/api/pastes/:id`          | metadados + conteúdo                               |
| GET    | `/p/:id/raw`               | texto puro (`text/plain; charset=utf-8`)           |
| GET    | `/p/:id/download`          | baixa `<titulo-ou-id>.txt` (`Content-Disposition: attachment`) |
| GET    | `/p/:id/download.md5`      | baixa arquivo `.md5` no formato `"<hash>  <nome>.txt"` |
| GET    | `/p/:id`                   | serve `paste.html`                                 |

### Regras
- Rejeitar conteúdo vazio ou maior que `maxPasteSizeBytes` (HTTP 413).
- MD5 calculado sobre os **bytes UTF-8** exatos que serão baixados no `.txt`
  (o hash exibido deve bater com `md5sum arquivo.txt` / `certutil -hashfile arquivo.txt MD5`).
- Paste expirado → HTTP 410 com página amigável.

### Tela `paste.html`
- Título, data de criação, **contagem regressiva** até expirar, tamanho.
- Conteúdo em `<pre>` com numeração de linhas e fonte monoespaçada.
- Botões: **Copiar texto**, **Copiar link**, **Ver raw**, **Baixar .txt**,
  **Baixar .md5**.
- Exibir o MD5 com botão de copiar e um exemplo de verificação:
  `certutil -hashfile arquivo.txt MD5` (Windows) e `md5sum arquivo.txt` (Linux).

---

## 6. Feature 2 – Upload de arquivos (.zip / .7z, até 1 GB)

### Fluxo em chunks
1. **Init** – `POST /api/uploads/init`
   body `{ fileName, size }`
   - Validar extensão (case-insensitive) ∈ `allowedExtensions`.
   - Validar `0 < size <= maxFileSizeBytes` (senão 413).
   - Verificar espaço livre em disco (`fs.statfs`) ≥ `size` (senão 507).
   - Criar registro `status='uploading'`, retornar
     `{ uploadId, chunkSize, totalChunks }`.
2. **Chunk** – `PUT /api/uploads/:id/chunk/:index`
   body = bytes crus (`application/octet-stream`).
   - **Não** usar `express.json()`/`bodyParser` nessa rota; fazer `req.pipe()` direto para
     `storage/tmp/<id>/<index>.part` (stream, sem carregar em memória).
   - Validar tamanho do chunk (último pode ser menor).
   - Idempotente: reenviar o mesmo índice sobrescreve.
   - No chunk 0: validar **magic bytes**:
     - ZIP: `50 4B 03 04` (ou `50 4B 05 06` vazio / `50 4B 07 08` spanned)
     - 7z: `37 7A BC AF 27 1C`
     - Se não bater → `status='failed'`, apagar tmp, HTTP 415.
3. **Status** – `GET /api/uploads/:id/status` → lista de índices recebidos
   (permite **retomar** upload após falha de rede).
4. **Complete** – `POST /api/uploads/:id/complete`
   - Conferir se todos os chunks existem e soma = `size`.
   - Concatenar chunks em ordem via stream em `storage/files/<id>_<nome-sanitizado>`,
     calculando **MD5 durante a concatenação** (`crypto.createHash('md5')`).
   - Apagar `tmp/<id>`, marcar `ready`, definir `expires_at = now + retentionDays`.
   - Retornar `{ id, url, md5, expiresAt }`.
5. **Abort** – `DELETE /api/uploads/:id` → remove tmp e registro.

### Download
| Método | Rota                    | Descrição                                       |
|--------|-------------------------|-------------------------------------------------|
| GET    | `/f/:id`                | página `file.html` (nome, tamanho, MD5, expiração) |
| GET    | `/api/files/:id`        | metadados JSON                                  |
| GET    | `/f/:id/download`       | stream do arquivo com `Content-Length` e suporte a **Range** (`res.sendFile` ou `res.download` resolvem) |
| GET    | `/f/:id/download.md5`   | arquivo `.md5`                                  |

### Regras de segurança mínimas (mesmo sem login)
- Sanitizar nome do arquivo (remover `..`, `/`, `\`, caracteres de controle).
- Nunca usar o nome enviado pelo usuário como caminho direto.
- Desativar timeout do servidor para uploads/downloads longos:
  `server.requestTimeout = 0; server.headersTimeout = 0` (ou valores altos),
  `server.keepAliveTimeout` razoável.
- Encerramento gracioso: tratar `SIGTERM`/`SIGINT` (enviados pelo `docker stop`), parar de
  aceitar conexões, parar o job de limpeza, fechar o SQLite e sair em até ~25 s
  (o compose usa `stop_grace_period: 30s`).

### Frontend `uploader.js`
- Drag & drop + seletor de arquivo (`accept=".zip,.7z"`).
- Validar extensão e tamanho **no cliente** antes do init (mensagem clara).
- Fatiar com `file.slice(start, end)` e enviar com `fetch` PUT.
- **3 chunks em paralelo**, com até 5 tentativas por chunk (backoff exponencial).
- Barra de progresso com %, MB enviados / total, velocidade (MB/s) e tempo restante.
- Botões **Pausar / Retomar / Cancelar**.
- Guardar `uploadId` no `localStorage` para retomar após recarregar a página
  (pedindo ao usuário para selecionar o mesmo arquivo novamente; conferir nome+tamanho).
- Ao concluir: mostrar link, MD5 e botão "Copiar link".

---

## 7. Expiração / limpeza (`services/cleanup.js`)

- Rodar ao iniciar o servidor e a cada `cleanupIntervalMinutes`.
- Apagar pastes e arquivos com `expires_at < now` (arquivo em disco + linha no banco).
- Apagar uploads `uploading` mais antigos que `incompleteUploadTtlHours` (e seu `tmp/`).
- Remover arquivos órfãos em `storage/` que não estejam no banco.
- Logar no console quantos itens foram removidos e quanto espaço foi liberado.
- Rotas de acesso também checam `expires_at` (não depender só do job).

---

## 8. Interface (design)

- Tema escuro moderno, fonte **Inter** (UI) e **JetBrains Mono** (código), via Google Fonts.
- Paleta coesa (ex.: fundo `#0f1117`, cartões `#171a23`, destaque gradiente roxo→ciano).
- Cartões com leve glassmorphism, bordas arredondadas, sombras suaves.
- Home com **duas abas**: "📋 Colar texto" e "📦 Enviar arquivo".
- Microanimações: hover em botões, transição entre abas, área de drop que "pulsa" ao arrastar,
  toast de "Copiado!".
- Mostrar no rodapé: retenção atual (lida de `GET /api/config/public`) e limite de 1 GB.
- Responsivo (funciona no celular).
- SEO básico: `<title>`, `<meta name="description">`, um único `<h1>` por página,
  HTML semântico, IDs únicos em elementos interativos.

---

## 9. Docker, scripts e execução

`package.json`:
```json
{
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js"
  },
  "engines": { "node": ">=20" }
}
```

### Arquivos Docker já fornecidos
| Arquivo                  | Papel                                                            |
|--------------------------|------------------------------------------------------------------|
| `Dockerfile`             | Multi-stage; compila `better-sqlite3`; roda como usuário `node`; `HEALTHCHECK` em `/api/health`; `CMD node src/server.js` |
| `docker-compose.yml`     | Serviço `app`, porta `${NULLDRIVE_PORT:-8000}:8000`, volume `nulldrive-storage`, bind `./config`, `init: true`, logs rotacionados |
| `docker-compose.dev.yml` | Override de desenvolvimento: monta `src/` e `public/`, `node --watch` |
| `.dockerignore`          | Exclui `node_modules`, `storage`, `config`, `.env`               |
| `.env.example`           | `NULLDRIVE_PORT` e envs opcionais                                |

Requisitos que o código deve cumprir para funcionar no container:
- Escutar em `HOST`/`PORT` (padrão `0.0.0.0:8000`), nunca `localhost`.
- Ler `STORAGE_DIR` e `CONFIG_PATH` das envs.
- Logs só em stdout/stderr (sem arquivo de log).
- Nenhum caminho absoluto do Windows no código.

### Gerar o `package-lock.json` sem Node no host
```powershell
docker run --rm -v "${PWD}:/app" -w /app node:20-bookworm-slim npm install --package-lock-only
```

### Executar
```powershell
copy .env.example .env          # opcional
docker compose up -d --build    # produção local
docker compose logs -f app
# abrir http://localhost:8000

# desenvolvimento com hot reload
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# parar / remover (o volume com os arquivos é mantido)
docker compose down
# apagar TUDO, inclusive arquivos enviados
docker compose down -v
```

### Alterar a retenção com o container rodando
```powershell
curl.exe -X PUT http://localhost:8000/api/admin/config -H "Content-Type: application/json" -d "{\"retentionDays\": 5}"
```
Ou editar `config/config.json` no host e rodar `docker compose restart app`.

> [!NOTE]
> Os arquivos enviados ficam num **volume nomeado** porque bind mounts em pastas do
> Windows (Docker Desktop/WSL2) são bem mais lentos para arquivos de vários GB.
> O espaço disponível é o do disco virtual do Docker/WSL2: garanta espaço suficiente
> (Docker Desktop → Settings → Resources).

O `README.md` deve explicar: subir com Docker, como alterar a retenção (config.json, env e
endpoint admin), onde ficam os arquivos (volume), backup do volume, limites e estrutura de
pastas.

---

## 10. Checklist de validação (o agente deve testar)

Todos os testes rodam contra o container (`http://localhost:8000`).

- [ ] `docker compose build` termina sem erros.
- [ ] `docker compose up -d` e `docker compose ps` mostra o serviço como `healthy`.
- [ ] `config/config.json` é criado/atualizado no host ao usar `PUT /api/admin/config`.
- [ ] `docker compose restart app` mantém pastes e arquivos (volume persistente).
- [ ] `docker compose stop` encerra de forma graciosa (log de shutdown, sem kill forçado).
- [ ] Processo no container roda como usuário `node`, não root
      (`docker compose exec app id`).

- [ ] Criar paste, abrir link, baixar `.txt` e conferir que o MD5 bate com
      `certutil -hashfile <arquivo> MD5`.
- [ ] Baixar o `.md5` e conferir formato.
- [ ] Paste vazio é rejeitado; paste acima do limite retorna 413.
- [ ] Upload de `.zip` pequeno funciona e o MD5 do download bate com o original.
- [ ] Upload de `.7z` funciona.
- [ ] Arquivo `.rar` ou `.txt` renomeado para `.zip` é rejeitado (magic bytes).
- [ ] Arquivo declarado > 1 GB é rejeitado no cliente e no servidor.
- [ ] Upload grande (gerar arquivo de teste de ~2 GB) não estoura memória do Node
      (observar uso de RAM estável).
- [ ] Interromper rede/recarregar no meio e **retomar** o upload.
- [ ] Alterar `retentionDays` via `PUT /api/admin/config` e ver refletido em novos itens.
- [ ] Forçar `expires_at` no passado e confirmar que o cleanup apaga arquivo e registro,
      e que o link retorna 410.
- [ ] Download com `Range` funciona (retomar download no navegador).

---

## 11. Próximas fases (NÃO implementar agora)

- HTTPS/TLS: adicionar serviço Caddy/Nginx no compose como reverse proxy
  (atenção: configurar `client_max_body_size`/timeouts para os chunks).
- Proteger `/api/admin/*` (token ou login).
- Rate limit e limite de uploads por IP.
- Senha opcional por paste/arquivo, "queimar após leitura".
- Syntax highlighting nos pastes.
- Antivírus (ClamAV) nos uploads.
