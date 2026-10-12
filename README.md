# vpendrive 📦📋

Clone moderno e minimalista do Pastebin com suporte a compartilhamento de textos e uploads de grandes arquivos compactados (`.zip` e `.7z`) até **15 GB**, com expiração automática configurável (padrão 3 dias) e cálculo de hash **MD5**.

---

## 🚀 Funcionalidades

1. **Colar Texto (Paste)**
   - Geração de link único e compartilhável.
   - Download direto como arquivo `.txt` (UTF-8).
   - Cálculo e download de hash **MD5** (`.md5`) para validação de integridade.
   - Visualização com numeração de linhas, contagem regressiva e atalhos rápidos de cópia.

2. **Upload de Arquivos Grandes**
   - Suporte exclusivo a arquivos compactados: `.zip` e `.7z`.
   - Limite máximo: **15 GB**.
   - Envio fatiado em **chunks de 50 MB** com streaming direto em disco (sem estourar a memória RAM do servidor).
   - Validação antecipada por **Magic Bytes** (impede que arquivos renomeados burlem a validação).
   - Suporte a **Pausar**, **Retomar** e recuperação automática em caso de instabilidade de rede ou recarregamento de página.
   - Download com suporte a **HTTP Range** (permite pausar/retomar downloads no navegador).

3. **Retenção e Expiração**
   - Padrão: **3 dias** (totalmente configurável).
   - Rotina periódica de limpeza automática (apaga itens vencidos, resíduos órfãos e uploads abandonados).
   - Ajuste em tempo de execução via API administrativa sem necessidade de reiniciar.

---

## 🛠️ Como Executar com Docker Compose (Recomendado)

O projeto foi totalmente projetado para rodar isolado em Docker. Não é necessário ter Node.js instalado na máquina hospedeira.

### 1. Iniciar a aplicação
```powershell
docker compose up -d --build
```
Acesse a aplicação no navegador em: **[http://localhost:3000](http://localhost:3000)**.

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
> *Nota: Os dados e uploads ficam salvos no volume nomeado `vpendrive-storage` e não são perdidos ao reiniciar o container. Para apagar completamente todos os arquivos e banco de dados, use `docker compose down -v`.*

---

## ⚙️ Configuração

A configuração fica salva em [`config/config.json`](file:///c:/Users/jpos/Documents/dev/vpendrive/config/config.json) (montada como volume dentro do container):

```json
{
  "port": 3000,
  "host": "0.0.0.0",
  "storageDir": "/app/storage",
  "retentionDays": 3,
  "maxFileSizeBytes": 16106127360,
  "chunkSizeBytes": 52428800,
  "allowedExtensions": [".zip", ".7z"],
  "maxPasteSizeBytes": 10485760,
  "cleanupIntervalMinutes": 60,
  "incompleteUploadTtlHours": 24
}
```

### Alterar a Retenção em Tempo de Execução

Você pode alterar a retenção de novos envios para, por exemplo, 5 dias, através de uma chamada HTTP:

```powershell
curl.exe -X PUT http://localhost:3000/api/admin/config `
  -H "Content-Type: application/json" `
  -d '{"retentionDays": 5}'
```

Também é possível forçar a limpeza imediata de arquivos expirados:
```powershell
curl.exe -X POST http://localhost:3000/api/admin/cleanup
```

---

## 🔍 Como Validar os Hashes MD5

Ao baixar o `.txt` ou `.zip`/`.7z`, valide a integridade usando o terminal:

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
