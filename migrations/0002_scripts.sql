-- Kit do Técnico — migração 0002: tipo "Script"
-- Um script é um item do tipo "comando" com script = 1 (mesmos campos: conteúdo, quando usar,
-- pré-requisitos, onde rodar, requer admin). Assim artigos podem relacionar scripts sem mudar nada.
-- Só ADICIONA uma coluna com valor padrão 0: não apaga nem altera nenhum dado existente.
-- Aplicar ANTES de publicar o código novo:
--   npx wrangler d1 migrations apply kit-do-tecnico --remote

ALTER TABLE itens ADD COLUMN script INTEGER NOT NULL DEFAULT 0 CHECK (script IN (0, 1));
