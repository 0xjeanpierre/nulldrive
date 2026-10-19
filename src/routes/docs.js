import path from 'node:path';
import express from 'express';
import { config, EDITABLE } from '../config.js';

const router = express.Router();
const PUBLIC_DIR = path.resolve('public');

function buildOpenApiSpec(lang = 'pt-BR') {
  const isEn = String(lang).toLowerCase().startsWith('en');
  const t = (pt, en) => (isEn ? en : pt);

  return {
    openapi: '3.0.3',
    info: {
      title: 'NullDrive API',
      version: '1.0.0',
      description: t(
        'API REST do **NullDrive** (`nulldrive`) para compartilhamento de textos (pastes) e upload fatiado (chunks) de arquivos `.zip` e `.7z` de até 1 GB com verificação MD5 e expiração automática.',
        'REST API for **NullDrive** (`nulldrive`) for sharing text pastes and chunked uploads of `.zip` and `.7z` files up to 1 GB with MD5 verification and automatic expiration.'
      ),
    },
    servers: [
      {
        url: '/',
        description: t('Servidor atual', 'Current server'),
      },
    ],
    tags: [
      { name: 'System', description: t('Saúde do serviço, estatísticas e configuração pública', 'Service health, statistics, and public configuration') },
      { name: 'Pastes', description: t('Criação, consulta e download de textos compartilhados', 'Create, view, and download shared text pastes') },
      { name: 'Uploads', description: t('Upload de arquivos grandes em partes (chunks) com retomada', 'Resumable chunked upload for large files') },
      { name: 'Files', description: t('Metadados e download de arquivos enviados', 'Metadata and download for uploaded files') },
      { name: 'Admin', description: t('Gerenciamento de configuração em tempo de execução e limpeza', 'Runtime configuration management and cleanup') },
    ],
    paths: {
      '/api/health': {
        get: {
          tags: ['System'],
          summary: t('Verifica a saúde do servidor e do banco SQLite', 'Check server and SQLite database health'),
          responses: {
            200: {
              description: t('Serviço operacional', 'Service is healthy'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { status: { type: 'string', example: 'ok' } },
                  },
                },
              },
            },
          },
        },
      },
      '/api/stats': {
        get: {
          tags: ['System'],
          summary: t('Retorna estatísticas de armazenamento ativo', 'Get active storage statistics'),
          responses: {
            200: {
              description: t('Estatísticas atuais', 'Current statistics'),
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Stats' },
                },
              },
            },
          },
        },
      },
      '/api/config/public': {
        get: {
          tags: ['System'],
          summary: t('Retorna limites públicos e estatísticas', 'Get public limits and statistics'),
          responses: {
            200: {
              description: t('Configuração pública', 'Public configuration'),
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PublicConfig' },
                },
              },
            },
          },
        },
      },
      '/api/pastes': {
        post: {
          tags: ['Pastes'],
          summary: t('Cria um novo paste de texto', 'Create a new text paste'),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['content'],
                  properties: {
                    title: {
                      type: 'string',
                      maxLength: 200,
                      example: 'notas.txt',
                      description: t('Título opcional (usado como nome do arquivo .txt)', 'Optional title (used as .txt filename)'),
                    },
                    content: {
                      type: 'string',
                      example: 'Hello NullDrive!',
                      description: t('Conteúdo em texto UTF-8', 'UTF-8 text content'),
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: t('Paste criado com sucesso', 'Paste created successfully'),
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Paste' },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            413: { $ref: '#/components/responses/PayloadTooLarge' },
          },
        },
      },
      '/api/pastes/{id}': {
        get: {
          tags: ['Pastes'],
          summary: t('Obtém metadados e conteúdo de um paste', 'Get paste metadata and content'),
          parameters: [{ $ref: '#/components/parameters/ItemId' }],
          responses: {
            200: {
              description: t('Dados do paste', 'Paste details'),
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PasteWithContent' },
                },
              },
            },
            404: { $ref: '#/components/responses/NotFound' },
            410: { $ref: '#/components/responses/Gone' },
          },
        },
      },
      '/pastes/{id}/raw': {
        get: {
          tags: ['Pastes'],
          summary: t('Retorna o conteúdo puro (text/plain) do paste', 'Get raw plain-text paste content'),
          parameters: [{ $ref: '#/components/parameters/ItemId' }],
          responses: {
            200: {
              description: t('Texto puro UTF-8', 'Raw UTF-8 text'),
              content: { 'text/plain': { schema: { type: 'string' } } },
            },
            404: { $ref: '#/components/responses/NotFound' },
            410: { $ref: '#/components/responses/Gone' },
          },
        },
      },
      '/pastes/{id}/download': {
        get: {
          tags: ['Pastes'],
          summary: t('Baixa o paste como arquivo .txt', 'Download paste as .txt file'),
          parameters: [{ $ref: '#/components/parameters/ItemId' }],
          responses: {
            200: {
              description: t('Arquivo .txt para download', 'Downloadable .txt file'),
              content: { 'text/plain': { schema: { type: 'string', format: 'binary' } } },
            },
            404: { $ref: '#/components/responses/NotFound' },
            410: { $ref: '#/components/responses/Gone' },
          },
        },
      },
      '/pastes/{id}/download.md5': {
        get: {
          tags: ['Pastes'],
          summary: t('Baixa o arquivo .md5 do paste', 'Download .md5 checksum file for paste'),
          parameters: [{ $ref: '#/components/parameters/ItemId' }],
          responses: {
            200: {
              description: t('Arquivo .md5 compatível com md5sum -c', '.md5 file compatible with md5sum -c'),
              content: { 'text/plain': { schema: { type: 'string', example: 'd41d8cd98f00b204e9800998ecf8427e  notas.txt\n' } } },
            },
            404: { $ref: '#/components/responses/NotFound' },
            410: { $ref: '#/components/responses/Gone' },
          },
        },
      },
      '/api/uploads/init': {
        post: {
          tags: ['Uploads'],
          summary: t('Inicia um novo upload fatiado (.zip ou .7z)', 'Initialize a new chunked upload (.zip or .7z)'),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['fileName', 'size'],
                  properties: {
                    fileName: { type: 'string', example: 'backup.zip' },
                    size: { type: 'integer', example: 104857600, description: t('Tamanho total em bytes', 'Total size in bytes') },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: t('Upload iniciado', 'Upload initialized'),
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UploadInitResponse' },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            413: { $ref: '#/components/responses/PayloadTooLarge' },
            415: { $ref: '#/components/responses/UnsupportedMediaType' },
            507: {
              description: t('Espaço em disco insuficiente', 'Insufficient disk space'),
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          },
        },
      },
      '/api/uploads/{id}/chunk/{index}': {
        put: {
          tags: ['Uploads'],
          summary: t('Envia uma parte (chunk) em bytes crus', 'Upload a raw binary chunk'),
          parameters: [
            { $ref: '#/components/parameters/ItemId' },
            {
              name: 'index',
              in: 'path',
              required: true,
              schema: { type: 'integer', minimum: 0 },
              description: t('Índice da parte (0 até totalChunks - 1)', 'Chunk index (0 to totalChunks - 1)'),
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/octet-stream': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
          responses: {
            200: {
              description: t('Parte gravada com sucesso', 'Chunk written successfully'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      index: { type: 'integer', example: 0 },
                      receivedChunks: { type: 'integer', example: 1 },
                      totalChunks: { type: 'integer', example: 2 },
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            404: { $ref: '#/components/responses/NotFound' },
            409: { $ref: '#/components/responses/Conflict' },
            415: { $ref: '#/components/responses/UnsupportedMediaType' },
          },
        },
      },
      '/api/uploads/{id}/status': {
        get: {
          tags: ['Uploads'],
          summary: t('Consulta o progresso e partes já recebidas de um upload', 'Get upload progress and received chunk indices'),
          parameters: [{ $ref: '#/components/parameters/ItemId' }],
          responses: {
            200: {
              description: t('Status do upload', 'Upload status'),
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UploadStatus' },
                },
              },
            },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/api/uploads/{id}/complete': {
        post: {
          tags: ['Uploads'],
          summary: t('Finaliza o upload, valida tamanho total e calcula hash MD5', 'Finalize upload, verify total size, and compute MD5 hash'),
          parameters: [{ $ref: '#/components/parameters/ItemId' }],
          responses: {
            200: {
              description: t('Arquivo pronto para compartilhamento', 'File ready for sharing'),
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/File' },
                },
              },
            },
            404: { $ref: '#/components/responses/NotFound' },
            409: { $ref: '#/components/responses/Conflict' },
          },
        },
      },
      '/api/uploads/{id}': {
        delete: {
          tags: ['Uploads'],
          summary: t('Cancela um upload em andamento e remove arquivos temporários', 'Abort an in-progress upload and delete temporary files'),
          parameters: [{ $ref: '#/components/parameters/ItemId' }],
          responses: {
            204: { description: t('Upload cancelado e removido', 'Upload cancelled and removed') },
            404: { $ref: '#/components/responses/NotFound' },
            409: { $ref: '#/components/responses/Conflict' },
          },
        },
      },
      '/api/files/{id}': {
        get: {
          tags: ['Files'],
          summary: t('Obtém metadados de um arquivo pronto', 'Get metadata of a ready file'),
          parameters: [{ $ref: '#/components/parameters/ItemId' }],
          responses: {
            200: {
              description: t('Metadados do arquivo', 'File metadata'),
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/File' },
                },
              },
            },
            404: { $ref: '#/components/responses/NotFound' },
            410: { $ref: '#/components/responses/Gone' },
          },
        },
      },
      '/files/{id}/download': {
        get: {
          tags: ['Files'],
          summary: t('Baixa o arquivo (suporta HTTP Range / retomada)', 'Download file (supports HTTP Range / resume)'),
          parameters: [{ $ref: '#/components/parameters/ItemId' }],
          responses: {
            200: {
              description: t('Stream binário do arquivo', 'Binary file stream'),
              content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
            },
            206: {
              description: t('Conteúdo parcial (HTTP Range)', 'Partial content (HTTP Range)'),
            },
            404: { $ref: '#/components/responses/NotFound' },
            410: { $ref: '#/components/responses/Gone' },
          },
        },
      },
      '/files/{id}/download.md5': {
        get: {
          tags: ['Files'],
          summary: t('Baixa o arquivo .md5 correspondente', 'Download corresponding .md5 checksum file'),
          parameters: [{ $ref: '#/components/parameters/ItemId' }],
          responses: {
            200: {
              description: t('Arquivo .md5 compatível com md5sum -c', '.md5 file compatible with md5sum -c'),
              content: { 'text/plain': { schema: { type: 'string' } } },
            },
            404: { $ref: '#/components/responses/NotFound' },
            410: { $ref: '#/components/responses/Gone' },
          },
        },
      },
      '/api/admin/config': {
        get: {
          tags: ['Admin'],
          summary: t('Retorna a configuração completa do servidor', 'Get full server configuration'),
          responses: {
            200: {
              description: t('Configuração ativa e regras de edição', 'Active configuration and editable rules'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      config: { type: 'object' },
                      configPath: { type: 'string' },
                      editableKeys: { type: 'object' },
                      envOverriddenKeys: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
        put: {
          tags: ['Admin'],
          summary: t('Atualiza parâmetros configuráveis em tempo de execução', 'Update configurable parameters at runtime'),
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    retentionDays: { type: 'number', example: config.retentionDays, minimum: EDITABLE.retentionDays.min, maximum: EDITABLE.retentionDays.max },
                    maxFileSizeBytes: { type: 'integer', example: config.maxFileSizeBytes },
                    chunkSizeBytes: { type: 'integer', example: config.chunkSizeBytes },
                    maxPasteSizeBytes: { type: 'integer', example: config.maxPasteSizeBytes },
                    cleanupIntervalMinutes: { type: 'number', example: config.cleanupIntervalMinutes },
                    incompleteUploadTtlHours: { type: 'number', example: config.incompleteUploadTtlHours },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: t('Configuração atualizada e persistida em config.json', 'Configuration updated and persisted to config.json'),
              content: { 'application/json': { schema: { type: 'object' } } },
            },
            400: { $ref: '#/components/responses/BadRequest' },
          },
        },
      },
      '/api/admin/extend/{id}': {
        post: {
          tags: ['Admin'],
          summary: t('Estende o prazo de expiração de um paste ou arquivo', 'Extend expiration time for a paste or file'),
          parameters: [{ $ref: '#/components/parameters/ItemId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['days'],
                  properties: {
                    days: { type: 'number', example: 2, minimum: 0.01, maximum: 365 },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: t('Data de expiração estendida', 'Expiration date extended'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      type: { type: 'string', enum: ['file', 'paste'] },
                      expiresAt: { type: 'integer' },
                    },
                  },
                },
              },
            },
            400: { $ref: '#/components/responses/BadRequest' },
            404: { $ref: '#/components/responses/NotFound' },
          },
        },
      },
      '/api/admin/cleanup': {
        post: {
          tags: ['Admin'],
          summary: t('Executa imediatamente a limpeza de itens expirados e órfãos', 'Immediately trigger cleanup of expired and orphan items'),
          responses: {
            200: {
              description: t('Resultado da limpeza', 'Cleanup result'),
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      pastes: { type: 'integer', example: 0 },
                      files: { type: 'integer', example: 0 },
                      staleUploads: { type: 'integer', example: 0 },
                      orphans: { type: 'integer', example: 0 },
                      freedBytes: { type: 'integer', example: 0 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      parameters: {
        ItemId: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', example: 'V1StGXR8_Z' },
          description: t('Identificador único do item', 'Unique item identifier'),
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: t('Mensagem de erro', 'Error message') },
          },
        },
        Stats: {
          type: 'object',
          properties: {
            totalFiles: { type: 'integer', example: 2 },
            totalPastes: { type: 'integer', example: 5 },
            totalItems: { type: 'integer', example: 7 },
            totalSizeBytes: { type: 'integer', example: 52428800 },
          },
        },
        PublicConfig: {
          type: 'object',
          properties: {
            retentionDays: { type: 'number', example: config.retentionDays },
            maxFileSizeBytes: { type: 'integer', example: config.maxFileSizeBytes },
            chunkSizeBytes: { type: 'integer', example: config.chunkSizeBytes },
            allowedExtensions: { type: 'array', items: { type: 'string' }, example: config.allowedExtensions },
            maxPasteSizeBytes: { type: 'integer', example: config.maxPasteSizeBytes },
            stats: { $ref: '#/components/schemas/Stats' },
          },
        },
        Paste: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'V1StGXR8_Z' },
            title: { type: 'string', nullable: true, example: 'notas' },
            sizeBytes: { type: 'integer', example: 128 },
            md5: { type: 'string', example: '5eb63bbbe01eeed093cb22bb8f5acdc3' },
            createdAt: { type: 'integer', example: 1760900000000 },
            expiresAt: { type: 'integer', example: 1761159200000 },
            fileName: { type: 'string', example: 'notas.txt' },
            url: { type: 'string', example: '/pastes/V1StGXR8_Z' },
          },
        },
        PasteWithContent: {
          allOf: [
            { $ref: '#/components/schemas/Paste' },
            {
              type: 'object',
              properties: {
                content: { type: 'string', example: 'Hello NullDrive!' },
              },
            },
          ],
        },
        UploadInitResponse: {
          type: 'object',
          properties: {
            uploadId: { type: 'string', example: 'k9Xp2LmN4q' },
            fileName: { type: 'string', example: 'backup.zip' },
            size: { type: 'integer', example: 104857600 },
            chunkSize: { type: 'integer', example: config.chunkSizeBytes },
            totalChunks: { type: 'integer', example: 2 },
          },
        },
        UploadStatus: {
          type: 'object',
          properties: {
            uploadId: { type: 'string', example: 'k9Xp2LmN4q' },
            fileName: { type: 'string', example: 'backup.zip' },
            size: { type: 'integer', example: 104857600 },
            chunkSize: { type: 'integer', example: config.chunkSizeBytes },
            totalChunks: { type: 'integer', example: 2 },
            receivedBytes: { type: 'integer', example: 52428800 },
            received: { type: 'array', items: { type: 'integer' }, example: [0] },
            status: { type: 'string', enum: ['uploading', 'finalizing', 'ready', 'failed'] },
          },
        },
        File: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'k9Xp2LmN4q' },
            fileName: { type: 'string', example: 'backup.zip' },
            sizeBytes: { type: 'integer', example: 104857600 },
            md5: { type: 'string', example: '098f6bcd4621d373cade4e832627b4f6' },
            createdAt: { type: 'integer', example: 1760900000000 },
            expiresAt: { type: 'integer', example: 1761159200000 },
            url: { type: 'string', example: '/files/k9Xp2LmN4q' },
            downloadUrl: { type: 'string', example: '/files/k9Xp2LmN4q/download' },
          },
        },
      },
      responses: {
        BadRequest: {
          description: t('Requisição inválida', 'Bad request'),
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        NotFound: {
          description: t('Item não encontrado', 'Item not found'),
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        Conflict: {
          description: t('Conflito de estado', 'State conflict'),
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        Gone: {
          description: t('Item expirado ou descartado', 'Item expired or discarded'),
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        PayloadTooLarge: {
          description: t('Conteúdo excede o limite permitido', 'Content exceeds maximum allowed size'),
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
        UnsupportedMediaType: {
          description: t('Formato de arquivo não permitido ou inválido', 'Unsupported or invalid file format'),
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    },
  };
}

router.get(['/api/openapi.json', '/api/docs.json', '/swagger.json'], (req, res) => {
  res.json(buildOpenApiSpec(req.query.lang || 'pt-BR'));
});

router.get(['/docs', '/api/docs', '/swagger'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'docs.html'));
});

export default router;

