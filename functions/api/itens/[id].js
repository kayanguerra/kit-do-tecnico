// GET    /api/itens/:id  -> um item
// PUT    /api/itens/:id  -> substitui todos os campos editáveis
// PATCH  /api/itens/:id  -> altera só o favorito: { "favorito": true }
// DELETE /api/itens/:id  -> exclui (e remove o vínculo nos artigos que apontavam para ele)
import {
  UUID_RE, json, erro, lerJson, agora, linhaParaItem, validarItem,
  nomeCategoria, relacionadosInvalidos, sqlUpsert
} from '../../_lib/util.js';

async function buscar(db, id) {
  return db.prepare('SELECT * FROM itens WHERE id = ?').bind(id).first();
}

function idValido(params) {
  const id = String(params.id || '');
  return UUID_RE.test(id) ? id : null;
}

export async function onRequestGet({ params, env }) {
  const id = idValido(params);
  if (!id) return erro(400, 'ID inválido.');
  const linha = await buscar(env.DB, id);
  if (!linha) return erro(404, 'Item não encontrado.');
  return json({ ok: true, item: linhaParaItem(linha) });
}

export async function onRequestPut({ request, params, env }) {
  const id = idValido(params);
  if (!id) return erro(400, 'ID inválido.');

  const atual = await buscar(env.DB, id);
  if (!atual) return erro(404, 'Item não encontrado.');

  const lido = await lerJson(request);
  if (lido.resposta) return lido.resposta;

  const { item, erros } = validarItem(lido.dados);
  if (erros.length) return erro(400, 'Confira os campos.', erros);

  const categoria = await nomeCategoria(env.DB, item.categoria);
  if (!categoria) return erro(400, 'Confira os campos.', [`A categoria "${item.categoria}" não existe.`]);
  item.categoria = categoria;

  if (item.relacionados.includes(id)) {
    return erro(400, 'Confira os campos.', ['Um item não pode ser relacionado a ele mesmo.']);
  }
  const ruins = await relacionadosInvalidos(env.DB, item.relacionados);
  if (ruins.length) {
    return erro(400, 'Confira os campos.', ['Algum comando relacionado não existe mais ou não é do tipo comando.']);
  }

  // Se um comando virar artigo, ele deixa de poder ser vínculo de outros artigos.
  const viraArtigo = atual.tipo === 'comando' && item.tipo === 'artigo';

  const registro = {
    ...item,
    id,
    usos: atual.usos,
    ultimo_uso: atual.ultimo_uso,
    criado_em: atual.criado_em,
    atualizado_em: agora()
  };
  const comandos = [sqlUpsert(env.DB, registro)];
  if (viraArtigo) comandos.push(...(await desvincular(env.DB, id)));
  await env.DB.batch(comandos);

  return json({ ok: true, item: linhaParaItem(await buscar(env.DB, id)) });
}

export async function onRequestPatch({ request, params, env }) {
  const id = idValido(params);
  if (!id) return erro(400, 'ID inválido.');

  const lido = await lerJson(request);
  if (lido.resposta) return lido.resposta;
  const dados = lido.dados || {};
  if (typeof dados.favorito !== 'boolean') {
    return erro(400, 'Envie { "favorito": true } ou { "favorito": false }.');
  }

  const resultado = await env.DB
    .prepare('UPDATE itens SET favorito = ?, atualizado_em = ? WHERE id = ?')
    .bind(dados.favorito ? 1 : 0, agora(), id)
    .run();
  if (!resultado.meta || resultado.meta.changes === 0) return erro(404, 'Item não encontrado.');

  return json({ ok: true, item: linhaParaItem(await buscar(env.DB, id)) });
}

export async function onRequestDelete({ params, env }) {
  const id = idValido(params);
  if (!id) return erro(400, 'ID inválido.');

  const atual = await buscar(env.DB, id);
  if (!atual) return erro(404, 'Item não encontrado.');

  const comandos = [env.DB.prepare('DELETE FROM itens WHERE id = ?').bind(id)];
  if (atual.tipo === 'comando') comandos.push(...(await desvincular(env.DB, id)));
  await env.DB.batch(comandos);

  return json({ ok: true, id });
}

// Gera os UPDATEs que tiram o ID dos "relacionados" dos artigos.
async function desvincular(db, id) {
  const { results } = await db
    .prepare("SELECT id, relacionados FROM itens WHERE tipo = 'artigo' AND relacionados LIKE ?")
    .bind(`%${id}%`)
    .all();
  const momento = agora();
  return results.map((linha) => {
    let lista = [];
    try {
      lista = JSON.parse(linha.relacionados || '[]');
    } catch {
      lista = [];
    }
    const nova = Array.isArray(lista) ? lista.filter((x) => x !== id) : [];
    return db
      .prepare('UPDATE itens SET relacionados = ?, atualizado_em = ? WHERE id = ?')
      .bind(JSON.stringify(nova), momento, linha.id);
  });
}
