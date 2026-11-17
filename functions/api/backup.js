// GET  /api/backup -> exporta tudo em JSON
// POST /api/backup -> importa. Corpo: { "confirmar": false|true, "backup": { ...arquivo exportado... } }
//   confirmar = false: só valida e devolve a prévia (quantos serão criados e substituídos)
//   confirmar = true : valida de novo e aplica tudo numa única transação (batch do D1)
import {
  UUID_RE, json, erro, lerJson, agora, linhaParaItem, validarItem,
  validarNomeCategoria, sqlUpsert
} from '../_lib/util.js';

const APP = 'kit-do-tecnico';
const VERSAO = 1;
const LIMITE_BYTES = 5 * 1024 * 1024;
const MAX_ITENS = 5000;
const DATA_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export async function onRequestGet({ env }) {
  const [cats, itens] = await env.DB.batch([
    env.DB.prepare('SELECT nome, ordem FROM categorias ORDER BY ordem, nome COLLATE NOCASE'),
    env.DB.prepare('SELECT * FROM itens ORDER BY criado_em')
  ]);
  const dados = {
    app: APP,
    versao: VERSAO,
    exportado_em: agora(),
    categorias: cats.results,
    itens: itens.results.map(linhaParaItem)
  };
  const data = dados.exportado_em.slice(0, 10);
  return new Response(JSON.stringify(dados, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="kit-do-tecnico-backup-${data}.json"`
    }
  });
}

export async function onRequestPost({ request, env }) {
  const lido = await lerJson(request, LIMITE_BYTES);
  if (lido.resposta) return lido.resposta;

  const corpo = lido.dados || {};
  const analise = await analisar(env.DB, corpo.backup);
  if (analise.erros.length) {
    return erro(400, 'Arquivo de backup inválido. Nada foi alterado.', analise.erros.slice(0, 30));
  }

  const previa = {
    total: analise.registros.length,
    criar: analise.criar,
    substituir: analise.substituir,
    categorias_novas: analise.categoriasNovas.map((c) => c.nome)
  };

  if (corpo.confirmar !== true) {
    return json({ ok: true, aplicado: false, previa });
  }

  const momento = agora();
  const comandos = [
    ...analise.categoriasNovas.map((c) =>
      env.DB
        .prepare('INSERT INTO categorias (id, nome, ordem, criado_em) VALUES (?, ?, ?, ?)')
        .bind(crypto.randomUUID(), c.nome, c.ordem, momento)
    ),
    ...analise.registros.map((r) => sqlUpsert(env.DB, r))
  ];
  if (comandos.length) await env.DB.batch(comandos);

  return json({ ok: true, aplicado: true, previa });
}

async function analisar(db, backup) {
  const erros = [];
  const vazio = { erros, registros: [], criar: 0, substituir: 0, categoriasNovas: [] };

  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    erros.push('O arquivo não parece um backup do Kit do Técnico.');
    return vazio;
  }
  if (backup.app !== APP) erros.push('O arquivo não é um backup do Kit do Técnico (campo "app").');
  if (backup.versao !== VERSAO) erros.push(`Versão de backup não suportada: ${String(backup.versao)}.`);
  if (!Array.isArray(backup.itens)) erros.push('O arquivo não tem a lista "itens".');
  if (backup.categorias !== undefined && !Array.isArray(backup.categorias)) {
    erros.push('O campo "categorias" deve ser uma lista.');
  }
  if (erros.length) return vazio;
  if (backup.itens.length > MAX_ITENS) {
    erros.push(`O backup tem mais de ${MAX_ITENS} itens.`);
    return vazio;
  }

  // Estado atual do banco.
  const [catsDb, itensDb] = await db.batch([
    db.prepare('SELECT nome, ordem FROM categorias'),
    db.prepare('SELECT id, tipo FROM itens')
  ]);
  const categoriasExistentes = new Map(catsDb.results.map((c) => [c.nome.toLowerCase(), c.nome]));
  let maiorOrdem = catsDb.results.reduce((m, c) => Math.max(m, c.ordem), 0);
  const tipoFinal = new Map(itensDb.results.map((i) => [i.id, i.tipo]));
  const existentes = new Set(itensDb.results.map((i) => i.id));

  // Categorias novas: as listadas no arquivo e as usadas pelos itens.
  const categoriasNovas = [];
  const novasVistas = new Set();
  function garantirCategoria(nomeBruto, contexto) {
    const v = validarNomeCategoria(nomeBruto);
    if (v.erro) {
      erros.push(`${contexto}: ${v.erro}`);
      return null;
    }
    const chave = v.nome.toLowerCase();
    if (categoriasExistentes.has(chave)) return categoriasExistentes.get(chave);
    if (!novasVistas.has(chave)) {
      novasVistas.add(chave);
      maiorOrdem += 1;
      categoriasNovas.push({ nome: v.nome, ordem: maiorOrdem });
      categoriasExistentes.set(chave, v.nome);
    }
    return categoriasExistentes.get(chave);
  }
  (backup.categorias || []).forEach((c, i) => {
    garantirCategoria(c && typeof c === 'object' ? c.nome : c, `Categoria ${i + 1}`);
  });

  // Itens.
  const registros = [];
  const idsNoArquivo = new Set();
  let criar = 0;
  let substituir = 0;
  const momento = agora();

  backup.itens.forEach((bruto, i) => {
    const rotulo = `Item ${i + 1}${bruto && typeof bruto.titulo === 'string' ? ` ("${bruto.titulo.slice(0, 40)}")` : ''}`;
    const id = bruto && typeof bruto.id === 'string' ? bruto.id.toLowerCase() : '';
    if (!UUID_RE.test(id)) {
      erros.push(`${rotulo}: ID ausente ou inválido.`);
      return;
    }
    if (idsNoArquivo.has(id)) {
      erros.push(`${rotulo}: ID repetido no arquivo.`);
      return;
    }
    idsNoArquivo.add(id);

    const { item, erros: errosItem } = validarItem(bruto);
    errosItem.forEach((e) => erros.push(`${rotulo}: ${e}`));
    if (errosItem.length) return;

    const categoria = garantirCategoria(item.categoria, rotulo);
    if (!categoria) return;
    item.categoria = categoria;

    const usos = Number.isInteger(bruto.usos) && bruto.usos >= 0 ? bruto.usos : 0;
    const data = (v) => (typeof v === 'string' && DATA_RE.test(v) ? v : null);

    registros.push({
      ...item,
      id,
      usos,
      ultimo_uso: data(bruto.ultimo_uso),
      criado_em: data(bruto.criado_em) || momento,
      atualizado_em: data(bruto.atualizado_em) || momento
    });
    tipoFinal.set(id, item.tipo);
    if (existentes.has(id)) substituir += 1;
    else criar += 1;
  });

  // Vínculos: cada relacionado precisa ser um comando no estado final.
  for (const r of registros) {
    if (r.relacionados.includes(r.id)) {
      erros.push(`"${r.titulo.slice(0, 40)}": o item está relacionado a ele mesmo.`);
    }
    for (const rel of r.relacionados) {
      if (tipoFinal.get(rel) !== 'comando') {
        erros.push(`"${r.titulo.slice(0, 40)}": comando relacionado ${rel} não existe no banco nem no arquivo.`);
      }
    }
  }

  return { erros, registros, criar, substituir, categoriasNovas };
}
