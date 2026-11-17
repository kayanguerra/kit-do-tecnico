// GET  /api/categorias -> lista as categorias com a contagem de itens
// POST /api/categorias -> cria: { "nome": "Active Directory" }
import { json, erro, lerJson, agora, validarNomeCategoria } from '../../_lib/util.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB
    .prepare(`SELECT c.id, c.nome, c.ordem,
                     (SELECT COUNT(*) FROM itens i WHERE i.categoria = c.nome COLLATE NOCASE) AS total
              FROM categorias c
              ORDER BY c.ordem, c.nome COLLATE NOCASE`)
    .all();
  return json({ ok: true, categorias: results });
}

export async function onRequestPost({ request, env }) {
  const lido = await lerJson(request);
  if (lido.resposta) return lido.resposta;

  const v = validarNomeCategoria(lido.dados && lido.dados.nome);
  if (v.erro) return erro(400, v.erro);

  const existe = await env.DB
    .prepare('SELECT id FROM categorias WHERE nome = ? COLLATE NOCASE')
    .bind(v.nome)
    .first();
  if (existe) return erro(409, 'Já existe uma categoria com esse nome.');

  const maior = await env.DB.prepare('SELECT COALESCE(MAX(ordem), 0) AS m FROM categorias').first();
  const categoria = { id: crypto.randomUUID(), nome: v.nome, ordem: (maior ? maior.m : 0) + 1, total: 0 };
  await env.DB
    .prepare('INSERT INTO categorias (id, nome, ordem, criado_em) VALUES (?, ?, ?, ?)')
    .bind(categoria.id, categoria.nome, categoria.ordem, agora())
    .run();

  return json({ ok: true, categoria }, 201);
}
