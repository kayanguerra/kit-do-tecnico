// GET  /api/itens  -> lista todos os itens (o frontend filtra no navegador)
// POST /api/itens  -> cria um item
import {
  json, erro, lerJson, agora, linhaParaItem, validarItem,
  nomeCategoria, relacionadosInvalidos, sqlUpsert
} from '../../_lib/util.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB
    .prepare('SELECT * FROM itens ORDER BY titulo COLLATE NOCASE')
    .all();
  return json({ ok: true, itens: results.map(linhaParaItem) });
}

export async function onRequestPost({ request, env }) {
  const lido = await lerJson(request);
  if (lido.resposta) return lido.resposta;

  const { item, erros } = validarItem(lido.dados);
  if (erros.length) return erro(400, 'Confira os campos.', erros);

  const categoria = await nomeCategoria(env.DB, item.categoria);
  if (!categoria) return erro(400, 'Confira os campos.', [`A categoria "${item.categoria}" não existe.`]);
  item.categoria = categoria;

  const ruins = await relacionadosInvalidos(env.DB, item.relacionados);
  if (ruins.length) {
    return erro(400, 'Confira os campos.', ['Algum comando relacionado não existe mais ou não é do tipo comando.']);
  }

  const momento = agora();
  const registro = {
    ...item,
    id: crypto.randomUUID(),
    usos: 0,
    ultimo_uso: null,
    criado_em: momento,
    atualizado_em: momento
  };
  await sqlUpsert(env.DB, registro).run();

  const linha = await env.DB.prepare('SELECT * FROM itens WHERE id = ?').bind(registro.id).first();
  return json({ ok: true, item: linhaParaItem(linha) }, 201);
}
