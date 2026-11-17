-- Kit do Técnico — dados iniciais (editáveis pelo site depois)
-- Aplicar com: npx wrangler d1 execute kit-do-tecnico --remote --file=./seed.sql
-- Rode uma única vez, logo depois do schema.sql.

INSERT INTO categorias (id, nome, ordem, criado_em) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'PowerShell',          1, '2026-11-12T00:00:00.000Z'),
  ('c0000000-0000-4000-8000-000000000002', 'CMD',                 2, '2026-11-12T00:00:00.000Z'),
  ('c0000000-0000-4000-8000-000000000003', 'Atalhos do Windows',  3, '2026-11-12T00:00:00.000Z'),
  ('c0000000-0000-4000-8000-000000000004', 'Atalhos de navegador',4, '2026-11-12T00:00:00.000Z'),
  ('c0000000-0000-4000-8000-000000000005', 'Redes',               5, '2026-11-12T00:00:00.000Z'),
  ('c0000000-0000-4000-8000-000000000006', 'Impressoras',         6, '2026-11-12T00:00:00.000Z'),
  ('c0000000-0000-4000-8000-000000000007', 'Microsoft 365',       7, '2026-11-12T00:00:00.000Z'),
  ('c0000000-0000-4000-8000-000000000008', 'Outros',              8, '2026-11-12T00:00:00.000Z');

-- 1) Reiniciar o Windows Explorer · PowerShell
INSERT INTO itens (id, tipo, titulo, categoria, conteudo, descricao, prerequisitos, requer_admin, tags, criado_em, atualizado_em) VALUES (
  'a1000000-0000-4000-8000-000000000001',
  'comando',
  'Reiniciar o Windows Explorer',
  'PowerShell',
  'Stop-Process -Name explorer -Force
Start-Sleep -Seconds 2
if (-not (Get-Process -Name explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }',
  'Barra de tarefas, menu Iniciar ou área de trabalho travados ou sem resposta.',
  'PowerShell aberto na sessão do próprio usuário (não funciona pela sessão de outro usuário).',
  0,
  '["explorer","barra de tarefas","menu iniciar","travado","área de trabalho"]',
  '2026-11-12T00:00:00.000Z',
  '2026-11-12T00:00:00.000Z'
);

-- 2) Limpar o cache DNS · CMD
INSERT INTO itens (id, tipo, titulo, categoria, conteudo, descricao, prerequisitos, requer_admin, tags, criado_em, atualizado_em) VALUES (
  'a1000000-0000-4000-8000-000000000002',
  'comando',
  'Limpar o cache DNS',
  'CMD',
  'ipconfig /flushdns',
  'Site ou servidor que mudou de IP continua abrindo o endereço antigo, ou nome não resolve depois de alteração no DNS.',
  'Em versões atuais do Windows 10/11 costuma funcionar sem elevação. Se aparecer "A operação solicitada requer elevação", abra o CMD como administrador.',
  0,
  '["dns","cache","rede","internet","site não abre","flushdns"]',
  '2026-11-12T00:00:00.000Z',
  '2026-11-12T00:00:00.000Z'
);

-- 3) Reabrir a última aba fechada · Atalhos de navegador
INSERT INTO itens (id, tipo, titulo, categoria, conteudo, descricao, prerequisitos, requer_admin, tags, criado_em, atualizado_em) VALUES (
  'a1000000-0000-4000-8000-000000000003',
  'comando',
  'Reabrir a última aba fechada',
  'Atalhos de navegador',
  'Ctrl + Shift + T',
  'Usuário fechou uma aba sem querer. Repetir o atalho reabre as abas anteriores, em ordem.',
  'Funciona no Chrome, Edge e Firefox. Não funciona em janela anônima depois que ela é fechada.',
  0,
  '["aba","guia","navegador","chrome","edge","firefox","reabrir"]',
  '2026-11-12T00:00:00.000Z',
  '2026-11-12T00:00:00.000Z'
);

-- 4) Reiniciar o spooler de impressão · PowerShell (usado pelo artigo abaixo)
INSERT INTO itens (id, tipo, titulo, categoria, conteudo, descricao, prerequisitos, requer_admin, tags, criado_em, atualizado_em) VALUES (
  'a1000000-0000-4000-8000-000000000004',
  'comando',
  'Reiniciar o spooler de impressão',
  'PowerShell',
  'Restart-Service -Name Spooler -Force',
  'Fila de impressão travada, documentos presos em "Imprimindo" ou "Erro".',
  'PowerShell aberto como administrador.',
  1,
  '["impressora","impressão","imprimir","spooler","fila"]',
  '2026-11-12T00:00:00.000Z',
  '2026-11-12T00:00:00.000Z'
);

-- 5) Artigo: Impressora não imprime / fila travada
INSERT INTO itens (id, tipo, titulo, categoria, sintoma, causa, solucao, observacoes, relacionados, tags, criado_em, atualizado_em) VALUES (
  'a1000000-0000-4000-8000-000000000005',
  'artigo',
  'Impressora não imprime / fila travada',
  'Impressoras',
  'O usuário manda imprimir e nada sai. Na fila de impressão os documentos ficam parados em "Imprimindo", "Erro" ou "Excluindo" e não somem.',
  'Um trabalho corrompido ou travado no spooler de impressão bloqueia todos os que vêm depois dele.',
  '1. Confirme que a impressora está ligada, com papel e sem erro no painel.
2. Abra o PowerShell como administrador.
3. Pare o spooler e limpe a fila:
```
Stop-Service -Name Spooler -Force
Remove-Item -Path "$env:SystemRoot\System32\spool\PRINTERS\*" -Force
Start-Service -Name Spooler
```
4. Se preferir só reiniciar o serviço, use o comando relacionado "Reiniciar o spooler de impressão".
5. Envie uma página de teste.
6. Se continuar, remova e adicione a impressora de novo. Referência: https://support.microsoft.com/windows',
  'Apagar a pasta PRINTERS remove todos os trabalhos pendentes de todos os usuários daquele computador. Avise o usuário antes.',
  '["a1000000-0000-4000-8000-000000000004"]',
  '["impressora","impressão","fila","spooler","não imprime","travada"]',
  '2026-11-12T00:00:00.000Z',
  '2026-11-12T00:00:00.000Z'
);
