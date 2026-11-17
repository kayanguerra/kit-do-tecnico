-- Kit do Técnico — esquema do banco D1 (SQLite)
-- Aplicar com: npx wrangler d1 execute kit-do-tecnico --remote --file=./schema.sql
-- ATENÇÃO: este script apaga e recria as tabelas. Não rode de novo em produção com dados.

DROP TABLE IF EXISTS itens;
DROP TABLE IF EXISTS categorias;

CREATE TABLE categorias (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  ordem     INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);

CREATE TABLE itens (
  id            TEXT PRIMARY KEY,
  tipo          TEXT NOT NULL CHECK (tipo IN ('comando', 'artigo')),
  titulo        TEXT NOT NULL,
  categoria     TEXT NOT NULL,
  -- Campos do tipo "comando"
  conteudo      TEXT NOT NULL DEFAULT '',
  descricao     TEXT NOT NULL DEFAULT '',   -- "quando usar"
  prerequisitos TEXT NOT NULL DEFAULT '',
  requer_admin  INTEGER NOT NULL DEFAULT 0 CHECK (requer_admin IN (0, 1)),
  -- Campos do tipo "artigo"
  sintoma       TEXT NOT NULL DEFAULT '',
  causa         TEXT NOT NULL DEFAULT '',
  solucao       TEXT NOT NULL DEFAULT '',
  observacoes   TEXT NOT NULL DEFAULT '',
  relacionados  TEXT NOT NULL DEFAULT '[]', -- JSON: lista de IDs de itens do tipo "comando"
  -- Campos comuns
  tags          TEXT NOT NULL DEFAULT '[]', -- JSON: lista de textos
  favorito      INTEGER NOT NULL DEFAULT 0 CHECK (favorito IN (0, 1)),
  usos          INTEGER NOT NULL DEFAULT 0,
  ultimo_uso    TEXT,
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE INDEX idx_itens_categoria ON itens (categoria);
CREATE INDEX idx_itens_tipo ON itens (tipo);
