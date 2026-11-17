// PUT    /api/categorias/:id -> renomeia: { "nome": "Novo nome" } (atualiza os itens junto)
// DELETE /api/categorias/:id -> exclui, somente se não houver itens nela
import { UUID_RE, json, erro, lerJson, agora, validarNomeCategoria } from '../../_lib/util.js';

async function buscar(db, id) {
  return db.prepare('SELECT id, nome, ordem FROM categorias WHERE id = ?').bind(id).first();
}

export async function onRequestPut({ request, params, env }) {
  const id = String(params.id || '');
  if (!UUID_RE.test(id)) return erro(400, 'ID inválido.');

  const atual = await buscar(env.DB, id);
  if (!atual) return erro(404, 'Categoria não encontrada.');

  const lido = await lerJson(request);
  if (lido.resposta) return lido.resposta;

  const v = validarNomeCategoria(lido.dados && lido.dados.nome);
  if (v.erro) return erro(400, v.erro);

  const conflito = await env.DB
    .prepare('SELECT id FROM categorias WHERE nome = ? COLLATE NOCASE AND id <> ?')
    .bind(v.nome, id)
    .first();
  if (conflito) return erro(409, 'Já existe uma categoria com esse nome.');

  // As duas alterações rodam juntas: se uma falhar, nenhuma é aplicada.
  await env.DB.batch([
    env.DB.prepare('UPDATE categorias SET nome = ? WHERE id = ?').bind(v.nome, id),
    env.DB
      .prepare('UPDATE itens SET categoria = ?, atualizado_em = ? WHERE categoria = ? COLLATE NOCASE')
      .bind(v.nome, agora(), atual.nome)
  ]);

  return json({ ok: true, categoria: { id, nome: v.nome, ordem: atual.ordem }, nome_anterior: atual.nome });
}

export async function onRequestDelete({ params, env }) {
  const id = String(params.id || '');
  if (!UUID_RE.test(id)) return erro(400, 'ID inválido.');

  const atual = await buscar(env.DB, id);
  if (!atual) return erro(404, 'Categoria não encontrada.');

  const uso = await env.DB
    .prepare('SELECT COUNT(*) AS total FROM itens WHERE categoria = ? COLLATE NOCASE')
    .bind(atual.nome)
    .first();
  if (uso && uso.total > 0) {
    return erro(409, `A categoria "${atual.nome}" tem ${uso.total} item(ns). Mova ou exclua esses itens antes.`);
  }

  await env.DB.prepare('DELETE FROM categorias WHERE id = ?').bind(id).run();
  return json({ ok: true, id });
}
