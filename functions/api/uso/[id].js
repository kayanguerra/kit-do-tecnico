// POST /api/uso/:id -> soma 1 ao contador de uso (chamado a cada cópia)
// Não altera "atualizado_em", para não bagunçar a ordenação por "recentes".
import { UUID_RE, json, erro, agora } from '../../_lib/util.js';

export async function onRequestPost({ params, env }) {
  const id = String(params.id || '');
  if (!UUID_RE.test(id)) return erro(400, 'ID inválido.');

  const momento = agora();
  const resultado = await env.DB
    .prepare('UPDATE itens SET usos = usos + 1, ultimo_uso = ? WHERE id = ?')
    .bind(momento, id)
    .run();
  if (!resultado.meta || resultado.meta.changes === 0) return erro(404, 'Item não encontrado.');

  const linha = await env.DB.prepare('SELECT usos, ultimo_uso FROM itens WHERE id = ?').bind(id).first();
  return json({ ok: true, id, usos: linha.usos, ultimo_uso: linha.ultimo_uso });
}
