// Funções compartilhadas pela API. Este arquivo não exporta onRequest*,
// então não vira rota; é apenas importado pelas rotas.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TIPOS = ['comando', 'artigo'];

// Limites de tamanho (em caracteres) para evitar registros absurdos.
const LIMITES = {
  titulo: 200,
  categoria: 60,
  conteudo: 20000,
  descricao: 5000,
  prerequisitos: 5000,
  sintoma: 5000,
  causa: 5000,
  solucao: 30000,
  observacoes: 5000,
  tag: 40,
  maxTags: 30,
  maxRelacionados: 30
};

// Ordem das colunas usada em INSERT/UPDATE.
export const COLUNAS = [
  'id', 'tipo', 'titulo', 'categoria',
  'conteudo', 'descricao', 'prerequisitos', 'requer_admin', 'script',
  'sintoma', 'causa', 'solucao', 'observacoes', 'relacionados',
  'tags', 'favorito', 'usos', 'ultimo_uso', 'criado_em', 'atualizado_em'
];

export function agora() {
  return new Date().toISOString();
}

export function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export function erro(status, mensagem, detalhes) {
  const corpo = { ok: false, erro: mensagem };
  if (detalhes !== undefined) corpo.detalhes = detalhes;
  return json(corpo, status);
}

// Lê o corpo como JSON, exigindo Content-Type application/json e limite de tamanho.
// Retorna { dados } ou { resposta } (resposta de erro pronta).
export async function lerJson(request, limiteBytes = 1024 * 1024) {
  const tipo = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!tipo.startsWith('application/json')) {
    return { resposta: erro(415, 'Envie o corpo como application/json.') };
  }
  const texto = await request.text();
  if (new TextEncoder().encode(texto).length > limiteBytes) {
    return { resposta: erro(413, 'Conteúdo grande demais.') };
  }
  try {
    return { dados: JSON.parse(texto) };
  } catch {
    return { resposta: erro(400, 'JSON inválido.') };
  }
}

function texto(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor !== 'string') return null; // sinaliza tipo errado
  return valor.replace(/\r\n?/g, '\n');
}

function booleano(valor) {
  return valor === true || valor === 1 || valor === '1' ? 1 : 0;
}

// Converte uma linha do banco para o formato da API.
export function linhaParaItem(linha) {
  return {
    id: linha.id,
    tipo: linha.tipo,
    titulo: linha.titulo,
    categoria: linha.categoria,
    conteudo: linha.conteudo,
    descricao: linha.descricao,
    prerequisitos: linha.prerequisitos,
    requer_admin: linha.requer_admin === 1,
    script: linha.script === 1,
    sintoma: linha.sintoma,
    causa: linha.causa,
    solucao: linha.solucao,
    observacoes: linha.observacoes,
    relacionados: lerLista(linha.relacionados),
    tags: lerLista(linha.tags),
    favorito: linha.favorito === 1,
    usos: linha.usos,
    ultimo_uso: linha.ultimo_uso,
    criado_em: linha.criado_em,
    atualizado_em: linha.atualizado_em
  };
}

function lerLista(valor) {
  try {
    const lista = JSON.parse(valor || '[]');
    return Array.isArray(lista) ? lista.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Valida e normaliza um item recebido do frontend ou do backup.
// Não consulta o banco (categoria e relacionados são conferidos à parte).
// Retorna { item, erros }. "item" contém apenas os campos editáveis.
export function validarItem(entrada) {
  const erros = [];
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return { item: null, erros: ['Item inválido.'] };
  }

  const item = {};
  const camposTexto = ['titulo', 'categoria', 'conteudo', 'descricao', 'prerequisitos',
    'sintoma', 'causa', 'solucao', 'observacoes'];
  for (const campo of camposTexto) {
    const v = texto(entrada[campo]);
    if (v === null) {
      erros.push(`O campo "${campo}" deve ser texto.`);
      item[campo] = '';
    } else {
      item[campo] = v;
    }
  }
  item.titulo = item.titulo.trim();
  item.categoria = item.categoria.trim();

  item.tipo = entrada.tipo;
  if (!TIPOS.includes(item.tipo)) {
    erros.push('Tipo inválido. Use "comando" ou "artigo".');
  }

  if (!item.titulo) erros.push('Informe o título.');
  if (!item.categoria) erros.push('Escolha a categoria.');

  if (item.tipo === 'comando') {
    if (!item.conteudo.trim()) erros.push(booleano(entrada.script) ? 'Informe o conteúdo do script.' : 'Informe o conteúdo do comando ou atalho.');
    // Campos que não pertencem ao tipo são limpos.
    item.sintoma = '';
    item.causa = '';
    item.solucao = '';
    item.observacoes = '';
  } else if (item.tipo === 'artigo') {
    if (!item.sintoma.trim()) erros.push('Informe o sintoma ou problema.');
    if (!item.solucao.trim()) erros.push('Informe a solução passo a passo.');
    item.conteudo = '';
    item.descricao = '';
    item.prerequisitos = '';
  }

  for (const campo of camposTexto) {
    if (item[campo].length > LIMITES[campo]) {
      erros.push(`O campo "${campo}" passou do limite de ${LIMITES[campo]} caracteres.`);
    }
  }

  // Tags: aceita lista ou texto separado por vírgula.
  let tags = entrada.tags;
  if (typeof tags === 'string') tags = tags.split(',');
  if (tags === undefined || tags === null) tags = [];
  if (!Array.isArray(tags)) {
    erros.push('Tags inválidas.');
    tags = [];
  }
  const vistas = new Set();
  item.tags = [];
  for (const t of tags) {
    if (typeof t !== 'string') continue;
    const limpa = t.trim().replace(/\s+/g, ' ');
    if (!limpa) continue;
    const chave = limpa.toLowerCase();
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    if (limpa.length > LIMITES.tag) {
      erros.push(`A tag "${limpa.slice(0, 20)}…" passou de ${LIMITES.tag} caracteres.`);
      continue;
    }
    item.tags.push(limpa);
  }
  if (item.tags.length > LIMITES.maxTags) erros.push(`Use no máximo ${LIMITES.maxTags} tags.`);

  // Relacionados: só faz sentido em artigo.
  let rel = entrada.relacionados;
  if (rel === undefined || rel === null) rel = [];
  if (!Array.isArray(rel)) {
    erros.push('Comandos relacionados inválidos.');
    rel = [];
  }
  item.relacionados = item.tipo === 'artigo'
    ? [...new Set(rel.filter((r) => typeof r === 'string'))]
    : [];
  if (item.relacionados.some((r) => !UUID_RE.test(r))) {
    erros.push('Há um comando relacionado com ID inválido.');
  }
  if (item.relacionados.length > LIMITES.maxRelacionados) {
    erros.push(`Use no máximo ${LIMITES.maxRelacionados} comandos relacionados.`);
  }

  item.requer_admin = item.tipo === 'comando' ? booleano(entrada.requer_admin) : 0;
  // Script = comando com várias linhas para salvar/rodar como arquivo (.ps1, .bat...)
  item.script = item.tipo === 'comando' ? booleano(entrada.script) : 0;
  item.favorito = booleano(entrada.favorito);

  return { item, erros };
}

// Confere se a categoria existe. Retorna o nome com a grafia cadastrada, ou null.
export async function nomeCategoria(db, nome) {
  const linha = await db
    .prepare('SELECT nome FROM categorias WHERE nome = ? COLLATE NOCASE')
    .bind(nome)
    .first();
  return linha ? linha.nome : null;
}

// Confere se todos os IDs relacionados existem e são do tipo "comando".
// Retorna a lista de IDs que não passaram.
export async function relacionadosInvalidos(db, ids) {
  if (ids.length === 0) return [];
  const marcadores = ids.map(() => '?').join(',');
  const { results } = await db
    .prepare(`SELECT id FROM itens WHERE tipo = 'comando' AND id IN (${marcadores})`)
    .bind(...ids)
    .all();
  const encontrados = new Set(results.map((r) => r.id));
  return ids.filter((id) => !encontrados.has(id));
}

// Monta o INSERT ... ON CONFLICT para gravar um item completo.
export function sqlUpsert(db, registro) {
  const marcadores = COLUNAS.map(() => '?').join(', ');
  const atualizacoes = COLUNAS.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
  return db
    .prepare(`INSERT INTO itens (${COLUNAS.join(', ')}) VALUES (${marcadores})
              ON CONFLICT(id) DO UPDATE SET ${atualizacoes}`)
    .bind(...COLUNAS.map((c) => paraBanco(c, registro[c])));
}

function paraBanco(coluna, valor) {
  if (coluna === 'tags' || coluna === 'relacionados') return JSON.stringify(valor || []);
  if (valor === undefined) return null;
  return valor;
}

// Valida o nome de uma categoria. Retorna { nome } ou { erro }.
export function validarNomeCategoria(valor) {
  if (typeof valor !== 'string') return { erro: 'Informe o nome da categoria.' };
  const nome = valor.trim().replace(/\s+/g, ' ');
  if (!nome) return { erro: 'Informe o nome da categoria.' };
  if (nome.length > 60) return { erro: 'O nome da categoria pode ter no máximo 60 caracteres.' };
  return { nome };
}
