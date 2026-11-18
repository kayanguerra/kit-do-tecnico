/* Kit do Técnico — frontend em JavaScript puro.
 * Regra de segurança: todo dado vindo da API entra na página só por textContent,
 * setAttribute ou propriedades de elemento. Nenhum innerHTML recebe dados.
 */
'use strict';

(() => {
  const API = '/api';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const CHAVE_SYNC = 'kit-ultima-sincronizacao';

  const estado = {
    itens: [],
    categorias: [],
    indice: new Map(),
    secao: 'biblioteca', // biblioteca | favoritos | recentes
    busca: '',
    tipo: 'todos',       // todos | comando | script | artigo
    categoria: null,     // nome da categoria ou null
    onde: null,          // powershell | cmd | executar | atalho | null
    ordem: 'relevancia', // relevancia | usados | recentes | alfabetica
    offline: false,
    podeEditar: false,   // vem de /api/eu; quem não está em EDITORES só lê
    email: '',           // vem de /api/eu: e-mail do login no Cloudflare Access
    carregado: false
  };

  let detalheLateral = null; // { id, anteriores } quando o painel da direita (computador) está aberto; anteriores = itens abertos antes via "Comandos relacionados"
  const DESKTOP = window.matchMedia('(min-width: 1024px)');
  const TELA_MEDIA = window.matchMedia('(min-width: 768px)'); // a partir daqui os filtros ficam na tela (igual ao CSS)
  const pilha = [];          // painéis abertos: { no, corpo, nome, id, render }
  const esperandoVolta = []; // promessas aguardando o popstate

  const $ = (seletor, raiz = document) => raiz.querySelector(seletor);

  // ---------- Ícones (constantes do próprio código, nunca dados) ----------

  const ICONES = {
    voltar: '<path d="M15 18l-6-6 6-6"/>',
    fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
    estrela: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
    copiar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    lixo: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    quebrar: '<path d="M4 6h16M4 12h13a3 3 0 0 1 0 6h-4m0 0 2-2m-2 2 2 2M4 18h5"/>',
    escudo: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    pasta: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    baixar: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
    subir: '<path d="M12 20V9m0 0-4 4m4-4 4 4M5 4h14"/>',
    atualizar: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
    restaurar: '<path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5"/>',
    externo: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    filtro: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    livro: '<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h6"/>'
  };

  function icone(nome) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONES[nome] || '';
    return svg;
  }

  // ---------- Criação segura de elementos ----------

  function el(tag, props, ...filhos) {
    const no = document.createElement(tag);
    if (props) {
      for (const [chave, valor] of Object.entries(props)) {
        if (valor === null || valor === undefined || valor === false) continue;
        if (chave === 'class') no.className = valor;
        else if (chave === 'text') no.textContent = valor;
        else if (chave.startsWith('on') && typeof valor === 'function') no.addEventListener(chave.slice(2), valor);
        else if (['value', 'checked', 'disabled', 'hidden', 'selected', 'readOnly', 'start'].includes(chave)) no[chave] = valor;
        else no.setAttribute(chave, valor === true ? '' : String(valor));
      }
    }
    anexar(no, filhos);
    return no;
  }

  function anexar(no, filhos) {
    for (const f of filhos.flat(Infinity)) {
      if (f === null || f === undefined || f === false) continue;
      no.append(f instanceof Node ? f : document.createTextNode(String(f)));
    }
    return no;
  }

  function limpar(no) {
    while (no.firstChild) no.removeChild(no.firstChild);
    return no;
  }

  // ---------- Utilidades ----------

  function normalizar(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function formatarData(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function lerLocal(chave) {
    try { return localStorage.getItem(chave); } catch { return null; }
  }

  function gravarLocal(chave, valor) {
    try { localStorage.setItem(chave, valor); } catch { /* armazenamento indisponível */ }
  }

  let temporizadorAviso = null;
  function aviso(texto, tipo = '') {
    const no = $('#aviso');
    no.textContent = texto;
    no.className = `aviso ${tipo}`;
    no.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => { no.hidden = true; }, tipo === 'erro' ? 4500 : 2000);
  }

  function confirmar(texto, rotuloOk = 'Confirmar') {
    const dialogo = $('#dialogo');
    if (typeof dialogo.showModal !== 'function') {
      return Promise.resolve(window.confirm(texto));
    }
    $('#dialogo-texto').textContent = texto;
    $('#dialogo-ok').textContent = rotuloOk;
    dialogo.returnValue = '';
    return new Promise((resolver) => {
      dialogo.addEventListener('close', () => resolver(dialogo.returnValue === 'ok'), { once: true });
      dialogo.showModal();
    });
  }

  // ---------- API ----------

  class ErroApi extends Error {
    constructor(tipo, mensagem, detalhes) {
      super(mensagem);
      this.tipo = tipo;         // rede | sessao | api
      this.detalhes = detalhes || [];
    }
  }

  async function api(metodo, caminho, corpo) {
    const opcoes = {
      method: metodo,
      headers: {},
      credentials: 'same-origin',
      redirect: 'manual', // com Cloudflare Access, sessão expirada vira redirecionamento
      cache: 'no-store'
    };
    if (corpo !== undefined) {
      opcoes.headers['Content-Type'] = 'application/json';
      opcoes.body = JSON.stringify(corpo);
    }

    let resposta;
    try {
      resposta = await fetch(API + caminho, opcoes);
    } catch {
      throw new ErroApi('rede', 'Sem conexão com o servidor.');
    }

    if (resposta.type === 'opaqueredirect' || resposta.status === 0) {
      throw new ErroApi('sessao', 'Sua sessão expirou. Recarregue a página para entrar de novo.');
    }
    const tipoConteudo = resposta.headers.get('Content-Type') || '';
    if (!tipoConteudo.includes('application/json')) {
      throw new ErroApi('sessao', 'Resposta inesperada do servidor. Recarregue a página e entre de novo.');
    }

    let dados;
    try {
      dados = await resposta.json();
    } catch {
      throw new ErroApi('api', 'Resposta inválida do servidor.');
    }
    if (!resposta.ok || !dados || dados.ok !== true) {
      throw new ErroApi('api', (dados && dados.erro) || `Erro ${resposta.status}.`, dados && dados.detalhes);
    }
    dados.__offline = resposta.headers.get('X-Kit-Offline') === '1';
    return dados;
  }

  function exigirOnline() {
    if (estado.offline) {
      aviso('Sem conexão: modo somente leitura.', 'erro');
      return false;
    }
    if (!estado.podeEditar) {
      aviso('Seu acesso é somente leitura.', 'erro');
      return false;
    }
    return true;
  }

  function definirPermissao(pode) {
    estado.podeEditar = Boolean(pode);
    document.body.classList.toggle('somente-leitor', !estado.podeEditar);
  }

  // ---------- Conta (menu): quem está logado, nível de acesso e Sair ----------

  function mostrarConta(eu) {
    const bloco = $('#gaveta-conta');
    if (!bloco) return;
    if (!eu) { // offline ou sem resposta: não dá para saber quem está logado
      bloco.hidden = !estado.email;
      return;
    }
    estado.email = eu.email || '';
    $('#conta-email').textContent = estado.email || 'Modo local (sem login)';
    $('#conta-email').title = estado.email;
    const papel = $('#conta-papel');
    papel.textContent = eu.podeEditar ? 'Editor' : 'Somente leitura';
    papel.classList.toggle('leitor', !eu.podeEditar);
    bloco.hidden = false;
  }

  // Sair: apaga a cópia offline da biblioteca neste aparelho e encerra o login do Access.
  // O tema escolhido fica (é só preferência visual, sem dados).
  async function sair() {
    try {
      if ('caches' in window) await caches.delete('kit-api-v1');
    } catch { /* sem acesso ao cache: segue para o logout */ }
    try { localStorage.removeItem(CHAVE_SYNC); } catch { /* armazenamento indisponível */ }
    definirItens([]);
    estado.categorias = [];
    renderizarLista();
    window.location.assign('/cdn-cgi/access/logout');
  }

  // ---------- Dados ----------

  function indexar(item) {
    estado.indice.set(item.id, {
      titulo: normalizar(item.titulo),
      tags: item.tags.map(normalizar),
      categoria: normalizar(item.categoria),
      conteudo: normalizar(item.conteudo),
      corpo: normalizar([item.conteudo, item.descricao, item.prerequisitos, item.sintoma,
        item.causa, item.solucao, item.observacoes].join(' \n '))
    });
  }

  function definirItens(itens) {
    estado.itens = itens;
    estado.indice.clear();
    itens.forEach(indexar);
  }

  function substituirItem(item) {
    const i = estado.itens.findIndex((x) => x.id === item.id);
    if (i >= 0) estado.itens[i] = item;
    else estado.itens.push(item);
    indexar(item);
  }

  function removerItem(id) {
    estado.itens = estado.itens.filter((x) => x.id !== id);
    estado.indice.delete(id);
    for (const item of estado.itens) {
      if (item.relacionados.includes(id)) item.relacionados = item.relacionados.filter((r) => r !== id);
    }
  }

  function buscarItem(id) {
    return estado.itens.find((x) => x.id === id) || null;
  }

  async function carregar() {
    try {
      const [rItens, rCats, rEu] = await Promise.all([
        api('GET', '/itens'),
        api('GET', '/categorias'),
        api('GET', '/eu').catch(() => null) // sem resposta: continua como leitor
      ]);
      definirPermissao(rEu && rEu.podeEditar);
      mostrarConta(rEu && !rEu.__offline ? rEu : null);
      definirItens(rItens.itens);
      estado.categorias = rCats.categorias;
      estado.carregado = true;
      const offline = rItens.__offline || rCats.__offline;
      if (!offline) gravarLocal(CHAVE_SYNC, new Date().toISOString());
      definirOffline(offline);
    } catch (e) {
      if (e.tipo === 'rede') {
        definirOffline(true);
        if (!estado.carregado) mostrarVazio('Sem conexão e ainda não há dados salvos neste aparelho. Abra o site uma vez com internet.');
      } else {
        aviso(e.message, 'erro');
        if (!estado.carregado) mostrarVazio(e.message);
      }
    } finally {
      $('#carregando').hidden = true;
    }
    renderizarChips();
    renderizarLista();
    atualizarPaineis();
  }

  function definirOffline(valor) {
    estado.offline = valor;
    document.body.classList.toggle('modo-leitura', valor);
    $('#status-conexao').hidden = !valor;
    const banner = $('#aviso-offline');
    banner.hidden = !valor;
    if (valor) {
      const sync = formatarData(lerLocal(CHAVE_SYNC));
      banner.textContent = sync
        ? `Sem conexão. Modo somente leitura, com os dados de ${sync}.`
        : 'Sem conexão. Modo somente leitura, com os dados salvos neste aparelho.';
    }
  }

  // ---------- Busca e ordenação ----------

  function pontuar(item, termos, frase) {
    const ix = estado.indice.get(item.id);
    if (!ix) return 0;
    let total = 0;
    // Frase inteira: título igual ou comando contendo exatamente o que foi digitado
    if (ix.titulo === frase) total += 40;
    else if (ix.titulo.includes(frase)) total += 15;
    if (ix.conteudo && ix.conteudo.includes(frase)) total += 15;
    for (const termo of termos) {
      let p = 0;
      if (ix.titulo.includes(termo)) {
        p += 10;
        if (ix.titulo.startsWith(termo) || ix.titulo.includes(` ${termo}`)) p += 5;
      }
      if (ix.tags.some((t) => t === termo)) p += 12;
      else if (ix.tags.some((t) => t.includes(termo))) p += 8;
      if (ix.categoria.includes(termo)) p += 4;
      if (ix.conteudo && ix.conteudo.includes(termo)) p += 6;
      if (ix.corpo.includes(termo)) p += 2;
      if (p === 0) return 0; // todos os termos precisam aparecer em algum lugar
      total += p;
    }
    return total;
  }

  const comparadorTexto = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

  // Tipo do item para a interface: comando | script | artigo (script = comando com script: true)
  function tipoDe(item) {
    if (item.tipo === 'comando' && item.script) return 'script';
    return item.tipo;
  }

  function casaTipo(item) {
    return estado.tipo === 'todos' || tipoDe(item) === estado.tipo;
  }

  function rotuloTipo(item) {
    if (item.tipo === 'artigo') return 'Artigo';
    if (item.script) return 'Script';
    return ehLink(item) ? 'Link' : 'Comando';
  }

  // Extensão do arquivo ao baixar um script, conforme "onde rodar"
  function extensaoScript(item) {
    const onde = ondeRodar(item);
    if (onde.includes('powershell')) return 'ps1';
    if (onde.includes('cmd')) return 'bat';
    if (/^#!/.test(item.conteudo)) return 'sh';
    return 'txt';
  }

  function nomeArquivo(titulo, ext) {
    const base = normalizar(titulo).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'script';
    return `${base}.${ext}`;
  }

  function itensVisiveis() {
    const frase = normalizar(estado.busca).trim().replace(/\s+/g, ' ');
    const termos = frase.split(' ').filter(Boolean);
    const cat = estado.categoria ? normalizar(estado.categoria) : null;

    let lista = estado.itens.filter((item) => {
      if (estado.secao === 'favoritos' && !item.favorito) return false;
      if (estado.secao === 'recentes' && !item.ultimo_uso) return false;
      if (!casaTipo(item)) return false;
      if (cat && normalizar(item.categoria) !== cat) return false;
      if (estado.onde && !ondeRodar(item).includes(estado.onde)) return false;
      return true;
    });

    const pontos = new Map();
    if (termos.length) {
      lista = lista.filter((item) => {
        const p = pontuar(item, termos, frase);
        if (p > 0) pontos.set(item.id, p);
        return p > 0;
      });
    }

    const porTitulo = (a, b) => comparadorTexto.compare(a.titulo, b.titulo);
    const porData = (campo) => (a, b) => String(b[campo] || '').localeCompare(String(a[campo] || ''));

    switch (estado.ordem) {
      case 'usados':
        lista.sort((a, b) => b.usos - a.usos || porData('ultimo_uso')(a, b) || porTitulo(a, b));
        break;
      case 'recentes':
        lista.sort((a, b) => porData('atualizado_em')(a, b) || porTitulo(a, b));
        break;
      case 'alfabetica':
        lista.sort(porTitulo);
        break;
      default:
        if (termos.length) {
          lista.sort((a, b) => pontos.get(b.id) - pontos.get(a.id) || b.usos - a.usos || porTitulo(a, b));
        } else if (estado.secao === 'recentes') {
          lista.sort((a, b) => porData('ultimo_uso')(a, b) || porTitulo(a, b));
        } else {
          lista.sort((a, b) => Number(b.favorito) - Number(a.favorito) || b.usos - a.usos || porTitulo(a, b));
        }
    }
    return lista;
  }

  // ---------- Atalhos de teclado (exibição) ----------

  const MODIFICADORES = new Set(['ctrl', 'control', 'shift', 'alt', 'altgr', 'win', 'windows', 'cmd',
    'command', 'option', 'opt', 'fn', 'super', 'meta', '⌘', '⌥', '⇧', '⌃']);

  function ehAtalho(texto) {
    const t = String(texto || '').trim();
    if (!t || t.length > 60 || t.includes('\n')) return false;
    const partes = t.split(/\s*\+\s*/);
    if (partes.length < 2) return false;
    if (!partes.every((p) => p.length >= 1 && p.length <= 12 && !/\s/.test(p))) return false;
    return partes.some((p) => MODIFICADORES.has(normalizar(p)));
  }

  function teclas(texto) {
    const partes = String(texto).trim().split(/\s*\+\s*/);
    const no = el('span', { class: 'teclas', 'aria-label': partes.join(' + ') });
    partes.forEach((p, i) => {
      if (i > 0) no.append(el('span', { class: 'mais', 'aria-hidden': 'true', text: '+' }));
      no.append(el('kbd', { text: p }));
    });
    return no;
  }

  // ---------- Copiar ----------

  function copiarFallback(texto) {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.left = '0';
    area.style.opacity = '0';
    area.style.fontSize = '16px'; // evita zoom no iOS
    document.body.append(area);
    const focoAnterior = document.activeElement;
    area.focus();
    area.select();
    area.setSelectionRange(0, texto.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    if (focoAnterior && typeof focoAnterior.focus === 'function') focoAnterior.focus({ preventScroll: true });
    return ok;
  }

  async function copiar(texto, botao, idUso) {
    let ok = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(texto);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok) ok = copiarFallback(texto);

    if (!ok) {
      aviso('Não foi possível copiar. Selecione o texto e copie manualmente.', 'erro');
      return;
    }
    if (navigator.vibrate) {
      try { navigator.vibrate(20); } catch { /* sem vibração */ }
    }
    if (botao) {
      const rotulo = botao.querySelector('.rotulo');
      const original = rotulo ? rotulo.textContent : '';
      botao.classList.add('copiado');
      if (rotulo) rotulo.textContent = 'Copiado!';
      clearTimeout(botao._t);
      botao._t = setTimeout(() => {
        botao.classList.remove('copiado');
        if (rotulo) rotulo.textContent = original;
      }, 1600);
    }
    registrarUso(idUso);
  }

  function registrarUso(id) {
    const item = id && buscarItem(id);
    if (!item || estado.offline) return;
    item.usos += 1;
    item.ultimo_uso = new Date().toISOString();
    api('POST', `/uso/${encodeURIComponent(id)}`)
      .then((r) => { item.usos = r.usos; item.ultimo_uso = r.ultimo_uso; })
      .catch(() => { /* contador é opcional; não incomoda o usuário */ });
    if (estado.ordem === 'usados' || estado.secao === 'recentes') renderizarLista();
    atualizarContadores();
  }

  function botaoCopiar(texto, idUso, rotulo = 'Copiar') {
    const botao = el('button', { type: 'button', class: 'btn btn-copiar' }, icone('copiar'), el('span', { class: 'rotulo', text: rotulo }));
    botao.addEventListener('click', () => copiar(texto, botao, idUso));
    return botao;
  }

  function blocoCodigo(texto, idUso) {
    const bloco = el('div', { class: 'codigo' });
    const pre = el('pre', { tabindex: '0' }, el('code', { text: texto }));
    const btnQuebrar = el('button', {
      type: 'button', class: 'btn btn-pequeno', 'aria-pressed': 'false', 'aria-label': 'Quebrar linhas'
    }, icone('quebrar'), el('span', { text: 'Quebrar' }));
    btnQuebrar.addEventListener('click', () => {
      const ativo = bloco.classList.toggle('quebrar');
      btnQuebrar.setAttribute('aria-pressed', String(ativo));
    });
    bloco.append(pre, el('div', { class: 'codigo-acoes' }, botaoCopiar(texto, idUso), btnQuebrar));
    return bloco;
  }

  // ---------- Texto com links e solução formatada ----------

  const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/g;

  function comLinks(texto) {
    const frag = document.createDocumentFragment();
    let ultimo = 0;
    for (const m of String(texto).matchAll(URL_RE)) {
      let bruto = m[0];
      while (/[.,;:!?)\]]$/.test(bruto)) bruto = bruto.slice(0, -1);
      let url = null;
      try { url = new URL(bruto); } catch { url = null; }
      if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) continue;
      frag.append(document.createTextNode(texto.slice(ultimo, m.index)));
      frag.append(el('a', { href: url.href, target: '_blank', rel: 'noopener noreferrer', text: bruto }));
      ultimo = m.index + bruto.length;
    }
    frag.append(document.createTextNode(texto.slice(ultimo)));
    return frag;
  }

  // Formato aceito na solução:
  //   1. passo        -> lista numerada
  //   - item          -> lista simples
  //   ``` ... ```     -> bloco de código com botão Copiar
  //   https://...     -> link
  function textoFormatado(texto, idUso) {
    const raiz = el('div', { class: 'rich' });
    const linhas = String(texto || '').split('\n');
    let paragrafo = [];
    let lista = null;

    const fecharParagrafo = () => {
      if (paragrafo.length) raiz.append(el('p', null, comLinks(paragrafo.join('\n'))));
      paragrafo = [];
    };

    for (let i = 0; i < linhas.length; i += 1) {
      const linha = linhas[i];

      if (/^\s*```/.test(linha)) {
        fecharParagrafo();
        lista = null;
        const codigo = [];
        i += 1;
        while (i < linhas.length && !/^\s*```/.test(linhas[i])) {
          codigo.push(linhas[i]);
          i += 1;
        }
        raiz.append(blocoCodigo(codigo.join('\n'), idUso));
        continue;
      }

      const num = /^\s*(\d+)[.)]\s+(.*)$/.exec(linha);
      if (num) {
        fecharParagrafo();
        if (!lista || lista.tagName !== 'OL') {
          lista = el('ol', { start: Number(num[1]) });
          raiz.append(lista);
        }
        lista.append(el('li', null, comLinks(num[2])));
        continue;
      }

      const marcador = /^\s*[-*•]\s+(.*)$/.exec(linha);
      if (marcador) {
        fecharParagrafo();
        if (!lista || lista.tagName !== 'UL') {
          lista = el('ul');
          raiz.append(lista);
        }
        lista.append(el('li', null, comLinks(marcador[1])));
        continue;
      }

      if (!linha.trim()) {
        fecharParagrafo();
        continue; // linha em branco não encerra a lista
      }

      lista = null;
      paragrafo.push(linha);
    }
    fecharParagrafo();
    return raiz;
  }

  // ---------- Elementos de item ----------

  // ---------- Onde rodar (PowerShell, CMD, Win + R, atalho) ----------

  const ONDE = [
    ['powershell', 'PowerShell'],
    ['cmd', 'CMD'],
    ['executar', 'Win + R'],
    ['atalho', 'Atalho']
  ];
  const TAG_ONDE = { powershell: 'powershell', cmd: 'cmd', executar: 'win+r' };
  const VERBO_PS = /^\s*(Get|Set|New|Remove|Add|Start|Stop|Restart|Test|Install|Uninstall|Connect|Disconnect|Clear|Export|Import|Invoke|Enable|Disable|Update|Select|Where|ForEach)-[A-Za-z]/m;

  function ondeRodar(item) {
    if (item.tipo !== 'comando') return [];
    if (!item.script && ehAtalho(item.conteudo)) return ['atalho'];
    const tags = item.tags.map(normalizar);
    const lista = Object.keys(TAG_ONDE).filter((k) => tags.includes(TAG_ONDE[k]));
    if (!lista.length && (VERBO_PS.test(item.conteudo) || /\$[A-Za-z_]/.test(item.conteudo))) lista.push('powershell');
    return lista;
  }

  function ehLink(item) {
    if (item.tipo !== 'comando' || item.script) return false;
    const t = String(item.conteudo || '').trim();
    return /^https?:\/\/\S+$/i.test(t) && !t.includes('\n');
  }

  function abrirLink(item) {
    let url = null;
    try { url = new URL(item.conteudo.trim()); } catch { url = null; }
    if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
      aviso('Endereço inválido.', 'erro');
      return;
    }
    window.open(url.href, '_blank', 'noopener,noreferrer');
    registrarUso(item.id);
  }

  function lerItem(id) {
    abrirDetalhe(id);
    registrarUso(id);
  }

  function selos(item) {
    return [
      el('span', { class: `selo selo-${ehLink(item) ? 'link' : tipoDe(item)}`, text: rotuloTipo(item) }),
      el('span', { class: 'selo', text: item.categoria }),
      ondeRodar(item).map((k) => el('span', { class: `selo selo-onde selo-${k}`, text: ONDE.find((o) => o[0] === k)[1] })),
      item.requer_admin ? el('span', { class: 'selo selo-admin', title: 'Requer administrador' }, icone('escudo'), 'Admin') : null
    ];
  }

  function linha(item) {
    let previa = null;
    if (item.tipo === 'comando') {
      const linhas = item.conteudo.split('\n');
      if (!item.script && ehAtalho(item.conteudo)) previa = el('div', { class: 'linha-previa' }, teclas(item.conteudo));
      else previa = el('p', { class: 'linha-previa' },
        el('span', { class: 'linha-prompt', 'aria-hidden': 'true', text: '>' }),
        el('span', { class: 'linha-comando', text: (linhas.find((l) => l.trim()) || '').trim() }),
        item.script && linhas.length > 1 ? el('span', { class: 'linha-qtd', text: `${linhas.length} linhas` }) : null);
    }
    const resumo = item.tipo === 'artigo' ? item.sintoma : item.descricao;

    const principal = el('button', { type: 'button', class: 'linha-principal', 'aria-label': `Abrir detalhes de ${item.titulo}` },
      el('span', { class: 'linha-titulo', text: item.titulo }),
      resumo ? el('span', { class: 'linha-resumo', text: resumo }) : null,
      previa,
      el('span', { class: 'linha-meta' }, selos(item)));
    principal.addEventListener('click', () => {
      if (item.tipo === 'artigo') lerItem(item.id);
      else abrirDetalhe(item.id);
    });

    const estrela = el('button', {
      type: 'button', class: 'btn-icone btn-estrela so-online', 'aria-pressed': String(item.favorito),
      'aria-label': item.favorito ? `Remover ${item.titulo} dos favoritos` : `Favoritar ${item.titulo}`
    }, icone('estrela'));
    estrela.addEventListener('click', () => alternarFavorito(item.id));

    let acao;
    if (item.tipo === 'artigo') {
      acao = el('button', { type: 'button', class: 'btn btn-acao' }, icone('livro'), el('span', { class: 'rotulo', text: 'Ler' }));
      acao.addEventListener('click', () => lerItem(item.id));
    } else if (ehLink(item)) {
      acao = el('button', { type: 'button', class: 'btn btn-acao' }, icone('externo'), el('span', { class: 'rotulo', text: 'Abrir' }));
      acao.addEventListener('click', () => abrirLink(item));
    } else {
      acao = el('button', { type: 'button', class: 'btn btn-acao btn-acao-copiar' }, icone('copiar'), el('span', { class: 'rotulo', text: 'Copiar' }));
      acao.addEventListener('click', () => copiar(item.conteudo, acao, item.id));
    }

    const selecionado = detalheLateral && detalheLateral.id === item.id;
    return el('li', { class: 'linha-item' },
      el('div', { class: `linha${selecionado ? ' selecionada' : ''}`, 'data-id': item.id },
        principal,
        el('div', { class: 'linha-acoes' }, estrela, acao)));
  }

  // ---------- Tela principal ----------

  function chip(rotulo, ativo, acao, qtd = null) {
    const b = qtd === null
      ? el('button', { type: 'button', class: 'chip', 'aria-pressed': String(ativo), text: rotulo })
      : el('button', { type: 'button', class: 'chip', 'aria-pressed': String(ativo), 'aria-label': `${rotulo}, ${qtd} ${qtd === 1 ? 'item' : 'itens'}` },
        el('span', { text: rotulo }), el('span', { class: 'chip-qtd', 'aria-hidden': 'true', text: String(qtd) }));
    b.addEventListener('click', acao);
    return b;
  }

  let categoriasAbertas = false; // computador: linha de categorias expandida

  const TITULOS_SECAO = { biblioteca: 'Biblioteca', favoritos: 'Favoritos', recentes: 'Recentes' };

  function filtrosAtivos() {
    return estado.tipo !== 'todos' || estado.onde !== null || estado.categoria !== null;
  }

  function renderizarChips() {
    const raiz = limpar($('#chips'));
    const grupo = (classe) => el('div', { class: `chips-grupo ${classe}`, role: 'group' });
    const redesenhar = () => { renderizarChips(); renderizarLista(); };

    // 1. Tipo
    const g1 = grupo('chips-tipo');
    const tipos = [['todos', 'Todos'], ['comando', 'Comandos'], ['script', 'Scripts'], ['artigo', 'Artigos']];
    for (const [valor, rotulo] of tipos) {
      g1.append(chip(rotulo, estado.tipo === valor, () => { estado.tipo = valor; redesenhar(); }));
    }

    // 2. Onde rodar
    const g2 = grupo('chips-onde');
    for (const [valor, rotulo] of ONDE) {
      const ativo = estado.onde === valor;
      g2.append(chip(rotulo, ativo, () => { estado.onde = ativo ? null : valor; redesenhar(); }));
    }

    // 3. Categorias que têm itens no filtro atual, com a quantidade (a selecionada aparece sempre)
    const g3 = grupo('chips-cat');
    g3.setAttribute('aria-label', 'Categoria');
    for (const { c, n } of categoriasVisiveis()) {
      const ativo = estado.categoria !== null && normalizar(estado.categoria) === normalizar(c.nome);
      g3.append(chip(c.nome, ativo, () => { estado.categoria = ativo ? null : c.nome; redesenhar(); }, n));
    }
    const btnMais = el('button', { type: 'button', class: 'chip chip-mais', hidden: true, 'aria-expanded': String(categoriasAbertas) });
    btnMais.addEventListener('click', () => { categoriasAbertas = !categoriasAbertas; ajustarCategorias(); });

    // 4. Redefinir: limpa só os filtros da faixa (mantém seção, busca e ordenação)
    const redefinir = el('button', {
      type: 'button', class: 'chip chip-redefinir', disabled: !filtrosAtivos(), 'aria-label': 'Redefinir filtros'
    }, icone('restaurar'), el('span', { text: 'Redefinir' }));
    redefinir.addEventListener('click', () => {
      estado.tipo = 'todos';
      estado.onde = null;
      estado.categoria = null;
      redesenhar();
    });
    // Computador: categorias numa linha própria, recolhida em uma linha com botão "+N"
    const g3wrap = el('div', { class: 'chips-cat-wrap' }, el('span', { class: 'chips-rotulo', text: 'Categorias' }), g3, btnMais);

    // Celular: Onde roda e Categoria ficam atrás de um botão Filtros, com a quantidade ativa
    const ativos = (estado.onde ? 1 : 0) + (estado.categoria ? 1 : 0);
    const btnFiltros = el('button', {
      type: 'button', class: 'chip chip-filtros', 'aria-pressed': String(ativos > 0),
      'aria-label': ativos ? `Filtros, ${ativos} ativo${ativos > 1 ? 's' : ''}` : 'Filtros'
    }, icone('filtro'), el('span', { text: 'Filtros' }), ativos ? el('span', { class: 'chip-total', text: String(ativos) }) : null);
    btnFiltros.addEventListener('click', abrirFiltros);
    const linhaTipo = el('div', { class: 'chips-linha-tipo' }, g1, btnFiltros);

    raiz.append(
      el('div', { class: 'chips-linha1' }, linhaTipo, el('span', { class: 'chip-divisor', 'aria-hidden': 'true' }), g2, redefinir),
      g3wrap);
    renderizarAtalhosOnde();
    requestAnimationFrame(ajustarCategorias);
  }

  // Menu (celular e tablet): atalhos "Onde roda" que aplicam o mesmo filtro da faixa e fecham o menu
  function renderizarAtalhosOnde() {
    const raiz = $('#gaveta-onde');
    if (!raiz) return;
    limpar(raiz);
    const qtd = {};
    for (const item of estado.itens) {
      if (estado.secao === 'favoritos' && !item.favorito) continue;
      if (estado.secao === 'recentes' && !item.ultimo_uso) continue;
      for (const o of ondeRodar(item)) qtd[o] = (qtd[o] || 0) + 1;
    }
    for (const [valor, rotulo] of ONDE) {
      const ativo = estado.onde === valor;
      const n = qtd[valor] || 0;
      const b = el('button', {
        type: 'button', class: 'gaveta-atalho', 'aria-pressed': String(ativo),
        'aria-label': `${rotulo}, ${n} ${n === 1 ? 'item' : 'itens'}`
      }, el('span', { class: 'gaveta-atalho-nome', text: rotulo }), el('span', { class: 'gaveta-atalho-qtd', 'aria-hidden': 'true', text: String(n) }));
      b.addEventListener('click', () => {
        estado.onde = ativo ? null : valor;
        if (!ativo && estado.tipo === 'artigo') estado.tipo = 'todos'; // artigos não têm "onde roda"
        fecharGaveta();
        renderizarChips();
        renderizarLista();
        window.scrollTo({ top: 0 });
        $('#btn-gaveta').focus({ preventScroll: true });
      });
      raiz.append(b);
    }
  }

  // Recolhe as categorias em uma linha e mostra "+N" com quantas ficaram escondidas
  function ajustarCategorias() {
    const g3 = $('#chips .chips-cat');
    const btn = $('#chips .chip-mais');
    if (!g3 || !btn) return;
    if (!TELA_MEDIA.matches) { btn.hidden = true; return; } // celular usa o painel Filtros
    const filhos = [...g3.children];
    const topo = filhos.length ? filhos[0].offsetTop : 0;
    const ocultos = filhos.filter((f) => f.offsetTop > topo + 4);
    // a categoria selecionada nunca fica escondida
    if (!categoriasAbertas && ocultos.some((f) => f.getAttribute('aria-pressed') === 'true')) categoriasAbertas = true;
    g3.classList.toggle('recolhido', !categoriasAbertas);
    btn.hidden = ocultos.length === 0;
    btn.setAttribute('aria-expanded', String(categoriasAbertas));
    btn.textContent = categoriasAbertas ? 'Mostrar menos' : `+${ocultos.length}`;
    btn.setAttribute('aria-label', categoriasAbertas ? 'Mostrar menos categorias' : `Mostrar mais ${ocultos.length} categorias`);
  }

  // Categorias com itens na seção, tipo e "onde roda" atuais, com a quantidade de cada uma
  function categoriasVisiveis() {
    const qtd = new Map();
    for (const item of estado.itens) {
      if (estado.secao === 'favoritos' && !item.favorito) continue;
      if (estado.secao === 'recentes' && !item.ultimo_uso) continue;
      if (!casaTipo(item)) continue;
      if (estado.onde && !ondeRodar(item).includes(estado.onde)) continue;
      const k = normalizar(item.categoria);
      qtd.set(k, (qtd.get(k) || 0) + 1);
    }
    const sel = estado.categoria ? normalizar(estado.categoria) : null;
    return estado.categorias
      .map((c) => ({ c, n: qtd.get(normalizar(c.nome)) || 0 }))
      .filter(({ c, n }) => n > 0 || normalizar(c.nome) === sel);
  }

  // Painel de filtros do celular (Onde roda e Categoria)
  function abrirFiltros() {
    const btnLimpar = el('button', { type: 'button', class: 'btn btn-secundario', text: 'Redefinir' });
    const btnVer = el('button', { type: 'button', class: 'btn btn-primario' });
    const p = abrirPainel({ titulo: 'Filtros', nome: 'filtros', rodape: [btnLimpar, btnVer] });
    const mudou = () => { renderizarChips(); renderizarLista(); p.render(); };
    p.render = () => {
      const corpo = limpar(p.corpo);
      const onde = el('div', { class: 'chips-painel', role: 'group', 'aria-label': 'Onde roda' });
      for (const [valor, rotulo] of ONDE) {
        const ativo = estado.onde === valor;
        onde.append(chip(rotulo, ativo, () => { estado.onde = ativo ? null : valor; mudou(); }));
      }
      const cats = el('div', { class: 'chips-painel', role: 'group', 'aria-label': 'Categoria' });
      for (const { c, n } of categoriasVisiveis()) {
        const ativo = estado.categoria !== null && normalizar(estado.categoria) === normalizar(c.nome);
        cats.append(chip(c.nome, ativo, () => { estado.categoria = ativo ? null : c.nome; mudou(); }, n));
      }
      corpo.append(
        el('section', { class: 'secao' }, el('h3', { text: 'Onde roda' }), onde),
        el('section', { class: 'secao' }, el('h3', { text: 'Categoria' }), cats));
      const n = itensVisiveis().length;
      btnVer.textContent = n === 1 ? 'Ver 1 resultado' : `Ver ${n} resultados`;
      btnLimpar.disabled = !filtrosAtivos();
    };
    // Igual ao Redefinir do computador: limpa Tipo, Onde roda e Categoria (mantém seção, busca e ordenação)
    btnLimpar.addEventListener('click', () => { estado.tipo = 'todos'; estado.onde = null; estado.categoria = null; mudou(); });
    btnVer.addEventListener('click', () => fecharPainel());
    p.render();
  }

  function atualizarContadores() {
    const n = {
      biblioteca: estado.itens.length,
      favoritos: estado.itens.filter((i) => i.favorito).length,
      recentes: estado.itens.filter((i) => i.ultimo_uso).length
    };
    document.querySelectorAll('[data-contador]').forEach((no) => {
      no.textContent = estado.carregado ? String(n[no.dataset.contador]) : '';
    });
  }

  function trocarSecao(secao) {
    estado.secao = secao;
    $('#titulo-secao').textContent = TITULOS_SECAO[secao];
    document.querySelectorAll('.gaveta-item[data-secao]').forEach((b) => {
      if (b.dataset.secao === secao) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    renderizarChips();
    renderizarLista();
    window.scrollTo({ top: 0 });
  }

  function mostrarVazio(texto) {
    const vazio = $('#vazio');
    vazio.textContent = texto;
    vazio.hidden = false;
  }

  function renderizarLista() {
    const lista = limpar($('#lista'));
    if (!estado.carregado) return;
    const itens = itensVisiveis();
    const frag = document.createDocumentFragment();
    itens.forEach((item) => frag.append(linha(item)));
    lista.append(frag);

    $('#contagem').textContent = itens.length === 1 ? '1 resultado' : `${itens.length} resultados`;
    atualizarContadores();
    const vazio = $('#vazio');
    if (itens.length) {
      vazio.hidden = true;
    } else if (!estado.itens.length) {
      mostrarVazio('Nenhum item ainda. Toque em "Novo item" para cadastrar o primeiro.');
    } else if (estado.secao === 'favoritos' && !estado.busca && !filtrosAtivos()) {
      mostrarVazio('Nenhum favorito ainda. Toque na estrela de um item para guardar aqui.');
    } else if (estado.secao === 'recentes' && !estado.busca && !filtrosAtivos()) {
      mostrarVazio('Nada usado ainda. Os itens que você copiar, abrir ou ler aparecem aqui.');
    } else if (estado.busca) {
      mostrarVazio(`Nada encontrado para "${estado.busca}".`);
    } else {
      mostrarVazio('Nenhum item neste filtro.');
    }
  }

  // ---------- Painéis (tela cheia no celular, modal no desktop) ----------

  function abrirPainel({ titulo, nome, lateral = false, acoesTopo = [], rodape = null }) {
    const corpo = el('div', { class: 'painel-corpo' });
    const btnVoltar = el('button', { type: 'button', class: 'btn-icone', 'aria-label': 'Voltar' }, icone('voltar'));
    const h2 = el('h2', { text: titulo });
    const caixa = el('div', { class: 'painel-caixa', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
      el('div', { class: 'painel-topo' }, btnVoltar, h2, acoesTopo),
      corpo,
      rodape ? el('div', { class: 'painel-rodape' }, rodape) : null);
    const no = el('div', { class: `painel${lateral ? ' lateral' : ''}` }, caixa);

    btnVoltar.addEventListener('click', () => fecharPainel());
    no.addEventListener('click', (e) => { if (e.target === no) fecharPainel(); });

    const registro = { no, corpo, nome, h2, rodapeNo: caixa.querySelector('.painel-rodape') };
    pilha.push(registro);
    $('#camada').append(no);
    document.body.classList.add('travado');
    history.pushState({ painel: pilha.length }, '');
    setTimeout(() => btnVoltar.focus({ preventScroll: true }), 0);
    return registro;
  }

  function removerTopo() {
    const p = pilha.pop();
    if (p) p.no.remove();
    if (!pilha.length) document.body.classList.remove('travado');
  }

  function fecharPainel() {
    if (!pilha.length) return Promise.resolve();
    return new Promise((resolver) => {
      esperandoVolta.push(resolver);
      history.back();
    });
  }

  window.addEventListener('popstate', (e) => {
    const nivel = (e.state && e.state.painel) || 0;
    while (pilha.length > nivel) removerTopo();
    while (esperandoVolta.length) esperandoVolta.shift()();
  });

  function atualizarPaineis() {
    for (const p of pilha) if (typeof p.render === 'function') p.render();
    if (detalheLateral) {
      if (buscarItem(detalheLateral.id)) renderizarLateral();
      else fecharLateral();
    }
  }

  // ---------- Detalhe à direita (computador) ----------

  function medirTopo() {
    const altura = $('#topo').getBoundingClientRect().height;
    document.documentElement.style.setProperty('--altura-topo', `${Math.round(altura)}px`);
  }

  function marcarSelecionada() {
    document.querySelectorAll('.linha.selecionada').forEach((n) => n.classList.remove('selecionada'));
    if (!detalheLateral) return;
    const alvo = document.querySelector(`.linha[data-id="${CSS.escape(detalheLateral.id)}"]`);
    if (alvo) alvo.classList.add('selecionada');
  }

  function renderizarLateral() {
    const item = buscarItem(detalheLateral.id);
    const raiz = limpar($('#detalhe'));
    if (!item) return;
    const btnFav = el('button', {
      type: 'button', class: 'btn-icone btn-fav so-online', 'aria-pressed': String(item.favorito),
      'aria-label': item.favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
    }, icone('estrela'));
    btnFav.addEventListener('click', () => alternarFavorito(item.id));
    const btnFechar = el('button', { type: 'button', class: 'btn-icone', 'aria-label': 'Fechar detalhe' }, icone('fechar'));
    btnFechar.addEventListener('click', () => fecharLateral(true));
    let btnVoltar = null;
    if (detalheLateral.anteriores.length) {
      btnVoltar = el('button', { type: 'button', class: 'btn-icone', 'aria-label': 'Voltar ao item anterior', title: 'Voltar' }, icone('voltar'));
      btnVoltar.addEventListener('click', () => voltarLateral());
    }
    const btnExcluir = el('button', { type: 'button', class: 'btn btn-perigo' }, icone('lixo'), 'Excluir');
    btnExcluir.addEventListener('click', () => excluirItem(item.id));
    const btnEditar = el('button', { type: 'button', class: 'btn btn-primario' }, icone('editar'), 'Editar item');
    btnEditar.addEventListener('click', () => { if (exigirOnline()) abrirFormulario(buscarItem(item.id)); });

    raiz.append(
      el('div', { class: 'painel-topo' }, btnVoltar,
        el('h2', { text: rotuloTipo(item) }), btnFav, btnFechar),
      el('div', { class: 'painel-corpo' }, conteudoDetalhe(item)),
      el('div', { class: 'painel-rodape so-online' }, btnExcluir, btnEditar));
  }

  function abrirLateral(id, empilhar = false) {
    const jaAberto = Boolean(detalheLateral);
    const anteriores = empilhar && detalheLateral && detalheLateral.id !== id
      ? [...detalheLateral.anteriores, detalheLateral.id]
      : [];
    detalheLateral = { id, anteriores };
    $('#detalhe').hidden = false;
    document.body.classList.add('com-detalhe');
    renderizarLateral();
    marcarSelecionada();
    $('#detalhe').scrollTop = 0;
    if (!jaAberto) $('#detalhe').querySelector('.painel-topo h2').setAttribute('tabindex', '-1');
  }

  // Volta ao item anterior quando o atual foi aberto por "Comandos relacionados"
  function voltarLateral() {
    if (!detalheLateral) return;
    const anteriores = [...detalheLateral.anteriores];
    let anterior = null;
    while (anteriores.length && !anterior) {
      const id = anteriores.pop();
      if (buscarItem(id)) anterior = id; // pula itens que foram excluídos
    }
    if (!anterior) { fecharLateral(true); return; }
    detalheLateral = { id: anterior, anteriores };
    renderizarLateral();
    marcarSelecionada();
    $('#detalhe').scrollTop = 0;
    const voltar = $('#detalhe').querySelector('.painel-topo .btn-icone');
    if (voltar) voltar.focus({ preventScroll: true });
  }

  function fecharLateral(devolverFoco = false) {
    if (!detalheLateral) return;
    const id = detalheLateral.id;
    detalheLateral = null;
    limpar($('#detalhe')).hidden = true;
    document.body.classList.remove('com-detalhe');
    marcarSelecionada();
    if (devolverFoco) {
      const alvo = document.querySelector(`.linha[data-id="${CSS.escape(id)}"] .linha-principal`);
      if (alvo) alvo.focus({ preventScroll: true });
    }
  }

  // ---------- Detalhe ----------

  // append() do navegador escreve "null" na tela para cada valor vazio; aqui os vazios são ignorados.
  function anexar(no, ...filhos) {
    no.append(...filhos.filter((f) => f !== null && f !== undefined && f !== false));
  }

  function secao(titulo, conteudo) {
    if (!conteudo) return null;
    return el('section', { class: 'secao' }, el('h3', { text: titulo }), conteudo);
  }

  function textoLivre(texto) {
    return texto && texto.trim() ? el('p', { class: 'texto-livre' }, comLinks(texto)) : null;
  }

  function abrirDetalhe(id, relacionado = false) {
    const item = buscarItem(id);
    if (!item) return;
    if (DESKTOP.matches && !pilha.length) {
      abrirLateral(id, relacionado);
      return;
    }

    const btnFav = el('button', { type: 'button', class: 'btn-icone btn-fav so-online', 'aria-label': 'Favorito' }, icone('estrela'));
    const btnExcluir = el('button', { type: 'button', class: 'btn btn-perigo' }, icone('lixo'), 'Excluir');
    const btnEditar = el('button', { type: 'button', class: 'btn btn-primario' }, icone('editar'), 'Editar item');

    const painel = abrirPainel({
      titulo: rotuloTipo(item),
      nome: 'detalhe',
      lateral: true,
      acoesTopo: [btnFav],
      rodape: [btnExcluir, btnEditar]
    });
    painel.id = id;
    if (painel.rodapeNo) painel.rodapeNo.classList.add('so-online');

    painel.render = () => {
      const atual = buscarItem(id);
      if (!atual) return;
      btnFav.setAttribute('aria-pressed', String(atual.favorito));
      btnFav.setAttribute('aria-label', atual.favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
      limpar(painel.corpo).append(conteudoDetalhe(atual));
    };
    painel.render();

    btnFav.addEventListener('click', () => alternarFavorito(id));
    btnEditar.addEventListener('click', () => { if (exigirOnline()) abrirFormulario(buscarItem(id)); });
    btnExcluir.addEventListener('click', () => excluirItem(id));
  }

  function conteudoDetalhe(item) {
    const frag = document.createDocumentFragment();
    frag.append(
      el('h2', { class: 'detalhe-titulo', text: item.titulo }),
      el('div', { class: 'detalhe-meta' }, selos(item))
    );

    if (item.tipo === 'comando') {
      if (item.script) {
        const ext = extensaoScript(item);
        const baixar = el('button', { type: 'button', class: 'btn btn-secundario btn-baixar' }, icone('baixar'), el('span', { text: `Baixar .${ext}` }));
        baixar.addEventListener('click', () => {
          // .bat precisa de quebra de linha do Windows (CRLF)
          const texto = ext === 'sh' ? item.conteudo : item.conteudo.replace(/\r?\n/g, '\r\n');
          baixarArquivo(nomeArquivo(item.titulo, ext), texto, 'text/plain');
          registrarUso(item.id);
        });
        frag.append(blocoCodigo(item.conteudo, item.id), baixar);
      } else if (ehAtalho(item.conteudo)) {
        frag.append(el('div', { class: 'atalho-bloco' }, teclas(item.conteudo)), botaoCopiar(item.conteudo, item.id));
      } else if (ehLink(item)) {
        const abrir = el('button', { type: 'button', class: 'btn btn-copiar' }, icone('externo'), el('span', { class: 'rotulo', text: 'Abrir link' }));
        abrir.addEventListener('click', () => abrirLink(item));
        frag.append(el('p', { class: 'texto-livre link-endereco', text: item.conteudo.trim() }), abrir, botaoCopiar(item.conteudo.trim(), item.id, 'Copiar endereço'));
      } else {
        frag.append(blocoCodigo(item.conteudo, item.id));
      }
      anexar(frag,
        secao('Quando usar', textoLivre(item.descricao)),
        secao('Pré-requisitos', textoLivre(item.prerequisitos))
      );
    } else {
      anexar(frag,
        secao('Sintoma / problema', textoLivre(item.sintoma)),
        secao('Causa provável', textoLivre(item.causa)),
        secao('Solução passo a passo', textoFormatado(item.solucao, item.id)),
        secao('Observações', textoLivre(item.observacoes))
      );
      const rel = item.relacionados.map(buscarItem).filter(Boolean);
      if (rel.length) {
        frag.append(secao(rel.some((r) => r.script) ? 'Comandos e scripts relacionados' : 'Comandos relacionados', el('div', null, rel.map((r) => {
          const link = el('button', { type: 'button', class: 'relacionado-link', text: r.titulo });
          link.addEventListener('click', () => abrirDetalhe(r.id, true));
          const copia = el('button', { type: 'button', class: 'btn btn-pequeno btn-copiar' }, icone('copiar'), el('span', { class: 'rotulo', text: 'Copiar' }));
          copia.addEventListener('click', () => copiar(r.conteudo, copia, r.id));
          return el('div', { class: 'relacionado' }, link, copia);
        }))));
      }
    }

    if (item.tags.length) {
      frag.append(secao('Tags', el('div', { class: 'tags' }, item.tags.map((t) => el('span', { class: 'tag', text: t })))));
    }
    const usos = item.usos === 1 ? 'Usado 1 vez' : `Usado ${item.usos} vezes`;
    const ultimo = item.ultimo_uso ? ` · último uso em ${formatarData(item.ultimo_uso)}` : '';
    frag.append(el('p', { class: 'uso-info', text: `${usos}${ultimo} · atualizado em ${formatarData(item.atualizado_em)}` }));
    return frag;
  }

  async function alternarFavorito(id) {
    const item = buscarItem(id);
    if (!item || !exigirOnline()) return;
    const novo = !item.favorito;
    item.favorito = novo;
    atualizarPaineis();
    renderizarLista();
    try {
      const r = await api('PATCH', `/itens/${encodeURIComponent(id)}`, { favorito: novo });
      substituirItem(r.item);
      aviso('Salvo', 'ok');
    } catch (e) {
      item.favorito = !novo;
      aviso(e.tipo === 'sessao' ? e.message : 'Erro ao salvar', 'erro');
    }
    atualizarPaineis();
    renderizarLista();
  }

  async function excluirItem(id) {
    const item = buscarItem(id);
    if (!item || !exigirOnline()) return;
    const ok = await confirmar(`Excluir "${item.titulo}"?\nEsta ação não pode ser desfeita.`, 'Excluir');
    if (!ok) return;
    try {
      await api('DELETE', `/itens/${encodeURIComponent(id)}`);
      removerItem(id);
      if (detalheLateral && detalheLateral.id === id) fecharLateral();
      else await fecharPainel();
      aviso('Item excluído', 'ok');
      renderizarChips();
      renderizarLista();
      atualizarPaineis();
    } catch (e) {
      aviso(e.tipo === 'sessao' ? e.message : 'Erro ao excluir', 'erro');
    }
  }

  // ---------- Formulário (criar e editar) ----------

  function campo(rotulo, controle, { obrigatorio = false, ajuda = '', nome = '' } = {}) {
    const idControle = `f-${nome}`;
    controle.id = idControle;
    const no = el('div', { class: 'campo', 'data-campo': nome },
      el('label', { for: idControle }, rotulo, obrigatorio ? el('span', { class: 'obrig', 'aria-hidden': 'true', text: ' *' }) : null),
      controle,
      ajuda ? el('p', { class: 'ajuda', text: ajuda }) : null,
      el('p', { class: 'msg-erro', hidden: true }));
    if (obrigatorio) controle.setAttribute('aria-required', 'true');
    return no;
  }

  function areaTexto(valor, { mono = false, linhas = 4 } = {}) {
    const t = el('textarea', { rows: String(linhas), class: mono ? 'mono' : null, spellcheck: mono ? 'false' : 'true' });
    if (mono) {
      t.setAttribute('autocapitalize', 'off');
      t.setAttribute('autocorrect', 'off');
      t.setAttribute('wrap', 'off');
    }
    t.value = valor || '';
    return t;
  }

  function juntarTagsOnde(tags, caixas) {
    const especiais = Object.values(TAG_ONDE);
    const resto = tags.filter((t) => !especiais.includes(normalizar(t)));
    const marcadas = caixas.map((l) => l.querySelector('input')).filter((c) => c.checked).map((c) => c.dataset.tag);
    return [...resto, ...marcadas];
  }

  function abrirFormulario(item) {
    const editando = Boolean(item);
    const base = item || {
      tipo: estado.tipo === 'artigo' ? 'artigo' : 'comando',
      script: estado.tipo === 'script',
      titulo: '',
      categoria: estado.categoria || (estado.categorias[0] && estado.categorias[0].nome) || '',
      conteudo: '', descricao: '', prerequisitos: '', requer_admin: false,
      sintoma: '', causa: '', solucao: '', observacoes: '', relacionados: [],
      tags: [], favorito: false
    };
    let tipo = tipoDe(base); // comando | script | artigo

    const form = el('form', { class: 'form', id: 'form-item', novalidate: true });

    // Tipo
    const btnComando = el('button', { type: 'button', text: 'Comando ou atalho' });
    const btnScript = el('button', { type: 'button', text: 'Script' });
    const btnArtigo = el('button', { type: 'button', text: 'Artigo de solução' });
    const segmentado = el('div', { class: 'segmentado segmentado-3', role: 'group', 'aria-label': 'Tipo do item' }, btnComando, btnScript, btnArtigo);

    const fTitulo = el('input', { type: 'text', maxlength: '200', autocomplete: 'off', enterkeyhint: 'next' });
    fTitulo.value = base.titulo;

    const fCategoria = el('select');
    const nomes = estado.categorias.map((c) => c.nome);
    if (base.categoria && !nomes.some((n) => normalizar(n) === normalizar(base.categoria))) nomes.push(base.categoria);
    fCategoria.append(el('option', { value: '', text: 'Escolha…' }));
    for (const n of nomes) {
      fCategoria.append(el('option', { value: n, text: n, selected: normalizar(n) === normalizar(base.categoria) }));
    }

    // Comando
    const fConteudo = areaTexto(base.conteudo, { mono: true, linhas: 5 });
    const fDescricao = areaTexto(base.descricao, { linhas: 3 });
    const fPre = areaTexto(base.prerequisitos, { linhas: 2 });
    const fAdmin = el('input', { type: 'checkbox', checked: Boolean(base.requer_admin) });
    const tagsBase = (base.tags || []).map(normalizar);
    const caixasOnde = Object.entries(TAG_ONDE).map(([k, tag]) => {
      const caixa = el('input', { type: 'checkbox', checked: tagsBase.includes(tag) });
      caixa.dataset.tag = tag;
      return el('label', { class: 'alternar' }, caixa, el('span', { text: ONDE.find((o) => o[0] === k)[1] }));
    });

    // Artigo
    const fSintoma = areaTexto(base.sintoma, { linhas: 3 });
    const fCausa = areaTexto(base.causa, { linhas: 2 });
    const fSolucao = areaTexto(base.solucao, { linhas: 8 });
    const fObs = areaTexto(base.observacoes, { linhas: 2 });

    const selecionados = new Set(base.relacionados || []);
    const filtroRel = el('input', { type: 'search', placeholder: 'Filtrar comandos', autocomplete: 'off', 'aria-label': 'Filtrar comandos' });
    const listaRel = el('div', { class: 'lista-escolha' });
    const desenharRelacionados = () => {
      limpar(listaRel);
      const termo = normalizar(filtroRel.value);
      const comandos = estado.itens
        .filter((x) => x.tipo === 'comando' && x.id !== (item && item.id))
        .filter((x) => !termo || normalizar(x.titulo).includes(termo) || selecionados.has(x.id))
        .sort((a, b) => Number(selecionados.has(b.id)) - Number(selecionados.has(a.id)) || comparadorTexto.compare(a.titulo, b.titulo));
      if (!comandos.length) {
        listaRel.append(el('div', { class: 'vazio', text: 'Nenhum comando encontrado.' }));
        return;
      }
      for (const c of comandos) {
        const caixa = el('input', { type: 'checkbox', checked: selecionados.has(c.id) });
        caixa.addEventListener('change', () => {
          if (caixa.checked) selecionados.add(c.id);
          else selecionados.delete(c.id);
        });
        listaRel.append(el('label', null, caixa, el('span', { text: `${c.titulo} · ${c.script ? 'Script · ' : ''}${c.categoria}` })));
      }
    };
    filtroRel.addEventListener('input', desenharRelacionados);
    desenharRelacionados();

    // Comuns
    const fTags = el('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', enterkeyhint: 'done' });
    fTags.value = (base.tags || []).filter((t) => !Object.values(TAG_ONDE).includes(normalizar(t))).join(', ');
    const fFav = el('input', { type: 'checkbox', checked: Boolean(base.favorito) });

    const errosServidor = el('div', { class: 'erros-servidor', hidden: true, role: 'alert' });

    const campoConteudo = campo('Conteúdo', fConteudo, { obrigatorio: true, nome: 'conteudo', ajuda: 'O que será copiado. Para atalho, escreva assim: Ctrl + Shift + T' });
    const grupoComando = el('div', { class: 'form' },
      campoConteudo,
      campo('Quando usar', fDescricao, { nome: 'descricao' }),
      campo('Pré-requisitos', fPre, { nome: 'prerequisitos' }),
      el('div', { class: 'campo' },
        el('span', { class: 'rotulo', text: 'Onde rodar' }),
        el('div', { class: 'onde-opcoes' }, caixasOnde),
        el('p', { class: 'ajuda', text: 'Marque todos que servem. Atalhos de teclado são reconhecidos sozinhos.' })),
      el('label', { class: 'alternar' }, fAdmin, el('span', { text: 'Requer administrador' })));

    const grupoArtigo = el('div', { class: 'form' },
      campo('Sintoma / problema', fSintoma, { obrigatorio: true, nome: 'sintoma' }),
      campo('Causa provável', fCausa, { nome: 'causa' }),
      campo('Solução passo a passo', fSolucao, {
        obrigatorio: true, nome: 'solucao',
        ajuda: 'Use "1." "2." para passos, ``` em linhas separadas para blocos de código e links começando com https://'
      }),
      campo('Observações', fObs, { nome: 'observacoes' }),
      el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: 'Comandos relacionados' }), filtroRel, listaRel));

    form.append(
      el('div', { class: 'aviso-segredo', role: 'note', text: 'Não salve senhas, tokens ou chaves.' }),
      errosServidor,
      el('div', { class: 'campo' }, el('span', { class: 'rotulo', text: 'Tipo' }), segmentado),
      campo('Título', fTitulo, { obrigatorio: true, nome: 'titulo' }),
      campo('Categoria', fCategoria, { obrigatorio: true, nome: 'categoria' }),
      grupoComando,
      grupoArtigo,
      campo('Tags', fTags, { nome: 'tags', ajuda: 'Separe por vírgula. Ex.: impressora, fila, spooler' }),
      el('label', { class: 'alternar' }, fFav, el('span', { text: 'Favorito' })));

    const rotuloConteudo = campoConteudo.querySelector('label, .rotulo');
    const ajudaConteudo = campoConteudo.querySelector('.ajuda');
    const textoRotulo = rotuloConteudo ? rotuloConteudo.firstChild : null;
    const definirTipo = (novo) => {
      tipo = novo;
      btnComando.setAttribute('aria-pressed', String(tipo === 'comando'));
      btnScript.setAttribute('aria-pressed', String(tipo === 'script'));
      btnArtigo.setAttribute('aria-pressed', String(tipo === 'artigo'));
      grupoComando.hidden = tipo === 'artigo';
      grupoArtigo.hidden = tipo !== 'artigo';
      const ehScript = tipo === 'script';
      if (textoRotulo && textoRotulo.nodeType === Node.TEXT_NODE) textoRotulo.nodeValue = ehScript ? 'Script' : 'Conteúdo';
      if (ajudaConteudo) {
        ajudaConteudo.textContent = ehScript
          ? 'Cole o script inteiro. Marque em "Onde rodar" se é PowerShell (.ps1) ou CMD (.bat) para baixar com a extensão certa.'
          : 'O que será copiado. Para atalho, escreva assim: Ctrl + Shift + T';
      }
      fConteudo.rows = ehScript ? 14 : 5;
    };
    btnComando.addEventListener('click', () => definirTipo('comando'));
    btnScript.addEventListener('click', () => definirTipo('script'));
    btnArtigo.addEventListener('click', () => definirTipo('artigo'));
    definirTipo(tipo);

    const btnCancelar = el('button', { type: 'button', class: 'btn btn-secundario', text: 'Cancelar' });
    const btnSalvar = el('button', { type: 'submit', class: 'btn btn-primario', form: 'form-item', text: 'Salvar' });

    const painel = abrirPainel({
      titulo: editando ? 'Editar item' : 'Novo item',
      nome: 'formulario',
      rodape: [btnCancelar, btnSalvar]
    });
    painel.corpo.append(form);
    btnCancelar.addEventListener('click', () => fecharPainel());

    const marcarErro = (nome, mensagem) => {
      const bloco = form.querySelector(`[data-campo="${nome}"]`);
      if (!bloco) return;
      bloco.classList.add('invalido');
      const msg = bloco.querySelector('.msg-erro');
      msg.textContent = mensagem;
      msg.hidden = false;
    };

    const limparErros = () => {
      form.querySelectorAll('.campo.invalido').forEach((b) => b.classList.remove('invalido'));
      form.querySelectorAll('.msg-erro').forEach((m) => { m.hidden = true; m.textContent = ''; });
      errosServidor.hidden = true;
      limpar(errosServidor);
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!exigirOnline()) return;
      limparErros();

      const dados = {
        tipo: tipo === 'script' ? 'comando' : tipo,
        script: tipo === 'script',
        titulo: fTitulo.value.trim(),
        categoria: fCategoria.value,
        conteudo: fConteudo.value,
        descricao: fDescricao.value,
        prerequisitos: fPre.value,
        requer_admin: fAdmin.checked,
        sintoma: fSintoma.value,
        causa: fCausa.value,
        solucao: fSolucao.value,
        observacoes: fObs.value,
        relacionados: tipo === 'artigo' ? [...selecionados].filter((rid) => buscarItem(rid)) : [],
        tags: juntarTagsOnde(fTags.value.split(',').map((t) => t.trim()).filter(Boolean), tipo !== 'artigo' ? caixasOnde : []),
        favorito: fFav.checked
      };

      const faltando = [];
      if (!dados.titulo) faltando.push(['titulo', 'Informe o título.']);
      if (!dados.categoria) faltando.push(['categoria', 'Escolha a categoria.']);
      if (tipo === 'comando' && !dados.conteudo.trim()) faltando.push(['conteudo', 'Informe o conteúdo do comando ou atalho.']);
      if (tipo === 'script' && !dados.conteudo.trim()) faltando.push(['conteudo', 'Informe o conteúdo do script.']);
      if (tipo === 'artigo' && !dados.sintoma.trim()) faltando.push(['sintoma', 'Informe o sintoma ou problema.']);
      if (tipo === 'artigo' && !dados.solucao.trim()) faltando.push(['solucao', 'Informe a solução passo a passo.']);
      if (faltando.length) {
        faltando.forEach(([n, m]) => marcarErro(n, m));
        const primeiro = form.querySelector('.campo.invalido textarea, .campo.invalido input, .campo.invalido select');
        if (primeiro) {
          primeiro.focus();
          primeiro.scrollIntoView({ block: 'center' });
        }
        aviso('Preencha os campos obrigatórios.', 'erro');
        return;
      }

      btnSalvar.disabled = true;
      btnSalvar.textContent = 'Salvando…';
      try {
        const r = editando
          ? await api('PUT', `/itens/${encodeURIComponent(item.id)}`, dados)
          : await api('POST', '/itens', dados);
        substituirItem(r.item);
        if (editando && item.tipo === 'comando' && r.item.tipo === 'artigo') {
          for (const x of estado.itens) {
            if (x.relacionados.includes(r.item.id)) x.relacionados = x.relacionados.filter((rid) => rid !== r.item.id);
          }
        }
        aviso('Salvo', 'ok');
        await fecharPainel();
        renderizarChips();
        renderizarLista();
        atualizarPaineis();
        if (!editando) abrirDetalhe(r.item.id);
      } catch (erro) {
        btnSalvar.disabled = false;
        btnSalvar.textContent = 'Salvar';
        aviso('Erro ao salvar', 'erro');
        errosServidor.append(el('strong', { text: erro.message }));
        if (erro.detalhes && erro.detalhes.length) {
          errosServidor.append(el('ul', null, erro.detalhes.map((d) => el('li', { text: d }))));
        }
        errosServidor.hidden = false;
        errosServidor.scrollIntoView({ block: 'center' });
      }
    });

    if (!editando) setTimeout(() => fTitulo.focus(), 50);
  }

  // ---------- Menu ----------

  // Menu lateral (gaveta): abre sobre o conteúdo
  function gavetaAberta() {
    return !$('#gaveta').hidden;
  }

  function abrirGaveta() {
    $('#gaveta').hidden = false;
    $('#gaveta-fundo').hidden = false;
    $('#btn-gaveta').setAttribute('aria-expanded', 'true');
    $('#btn-gaveta').setAttribute('aria-label', 'Fechar menu');
    requestAnimationFrame(() => document.body.classList.add('gaveta-on'));
    const ativo = document.querySelector('.gaveta-item[aria-current="page"]') || document.querySelector('.gaveta-item');
    if (ativo) ativo.focus();
  }

  function fecharGaveta(devolverFoco = false) {
    if (!gavetaAberta()) return;
    document.body.classList.remove('gaveta-on');
    $('#gaveta').hidden = true;
    $('#gaveta-fundo').hidden = true;
    $('#btn-gaveta').setAttribute('aria-expanded', 'false');
    $('#btn-gaveta').setAttribute('aria-label', 'Abrir menu');
    if (devolverFoco) $('#btn-gaveta').focus();
  }

  function itensGaveta() {
    return [...document.querySelectorAll('#gaveta button')].filter((b) => b.offsetParent !== null);
  }

  function prepararGaveta() {
    $('#btn-gaveta').addEventListener('click', () => (gavetaAberta() ? fecharGaveta(true) : abrirGaveta()));
    $('#gaveta-fundo').addEventListener('click', () => fecharGaveta(true));
    $('#btn-fechar-gaveta').addEventListener('click', () => fecharGaveta(true));
    document.querySelectorAll('.gaveta-item[data-secao]').forEach((b) => {
      b.addEventListener('click', () => {
        const eraGaveta = gavetaAberta();
        fecharGaveta();
        if (detalheLateral) fecharLateral();
        trocarSecao(b.dataset.secao);
        if (eraGaveta) $('#btn-gaveta').focus({ preventScroll: true });
      });
    });
    const acoes = {
      categorias: () => abrirCategorias(),
      exportar: () => exportarBackup(),
      importar: () => { if (exigirOnline()) $('#arquivo-backup').click(); },
      recarregar: () => carregar()
    };
    $('#btn-sair').addEventListener('click', () => {
      fecharGaveta();
      sair();
    });
    document.querySelectorAll('.gaveta-item[data-acao]').forEach((b) => {
      b.addEventListener('click', () => {
        fecharGaveta();
        acoes[b.dataset.acao]();
      });
    });
    // Teclado: setas navegam, Tab fica dentro do menu, Esc fecha e devolve o foco
    $('#gaveta').addEventListener('keydown', (e) => {
      const lista = itensGaveta();
      const i = lista.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); lista[(i + 1) % lista.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); lista[(i - 1 + lista.length) % lista.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); lista[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); lista[lista.length - 1].focus(); }
      else if (e.key === 'Tab') {
        if (e.shiftKey && i <= 0) { e.preventDefault(); lista[lista.length - 1].focus(); }
        else if (!e.shiftKey && i === lista.length - 1) { e.preventDefault(); lista[0].focus(); }
      }
    });
    // No computador a gaveta vira barra lateral fixa: sai do modo sobreposto ao ampliar a janela
    DESKTOP.addEventListener('change', (e) => { if (e.matches) fecharGaveta(); });
    trocarSecao(estado.secao);
  }

  function baixarArquivo(nome, texto, tipoMime = 'application/json') {
    const blob = new Blob([texto], { type: tipoMime });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: nome });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function exportarBackup() {
    const data = new Date().toISOString().slice(0, 10);
    if (estado.offline) {
      // Sem internet: exporta o que está salvo neste aparelho, no mesmo formato.
      const dados = {
        app: 'kit-do-tecnico',
        versao: 1,
        exportado_em: new Date().toISOString(),
        categorias: estado.categorias.map((c) => ({ nome: c.nome, ordem: c.ordem })),
        itens: estado.itens
      };
      baixarArquivo(`kit-do-tecnico-backup-${data}-offline.json`, JSON.stringify(dados, null, 2));
      aviso('Backup exportado (dados deste aparelho)', 'ok');
      return;
    }
    try {
      const resposta = await fetch(`${API}/backup`, { credentials: 'same-origin', redirect: 'manual', cache: 'no-store' });
      if (resposta.type === 'opaqueredirect' || !resposta.ok) throw new Error();
      baixarArquivo(`kit-do-tecnico-backup-${data}.json`, await resposta.text());
      aviso('Backup exportado', 'ok');
    } catch {
      aviso('Não foi possível exportar. Recarregue a página e tente de novo.', 'erro');
    }
  }

  async function lerBackupEscolhido(arquivo) {
    let backup;
    try {
      backup = JSON.parse(await arquivo.text());
    } catch {
      aviso('O arquivo escolhido não é um JSON válido.', 'erro');
      return;
    }
    let previa;
    try {
      previa = (await api('POST', '/backup', { confirmar: false, backup })).previa;
    } catch (e) {
      mostrarResultadoImportacao(null, e);
      return;
    }
    mostrarResultadoImportacao(previa, null, backup);
  }

  function mostrarResultadoImportacao(previa, erro, backup) {
    const btnCancelar = el('button', { type: 'button', class: 'btn btn-secundario', text: previa ? 'Cancelar' : 'Fechar' });
    const btnAplicar = previa ? el('button', { type: 'button', class: 'btn btn-primario', text: 'Aplicar importação' }) : null;
    const painel = abrirPainel({ titulo: 'Importar backup', nome: 'importar', rodape: [btnCancelar, btnAplicar] });
    btnCancelar.addEventListener('click', () => fecharPainel());

    if (!previa) {
      painel.corpo.append(el('div', { class: 'erros-servidor', role: 'alert' },
        el('strong', { text: erro.message }),
        erro.detalhes && erro.detalhes.length ? el('ul', null, erro.detalhes.map((d) => el('li', { text: d }))) : null));
      return;
    }

    painel.corpo.append(el('div', { class: 'previa-import' },
      el('p', null, el('strong', { text: String(previa.criar) }), ' item(ns) serão criados'),
      el('p', null, el('strong', { text: String(previa.substituir) }), ' item(ns) serão substituídos (mesmo ID)'),
      previa.categorias_novas.length
        ? el('p', { text: `Categorias novas: ${previa.categorias_novas.join(', ')}` })
        : null,
      el('p', { class: 'ajuda', text: 'Itens que já existem e não estão no arquivo continuam como estão. Substituir não pode ser desfeito: se quiser, exporte um backup antes.' })));

    btnAplicar.addEventListener('click', async () => {
      btnAplicar.disabled = true;
      btnAplicar.textContent = 'Importando…';
      try {
        await api('POST', '/backup', { confirmar: true, backup });
        await fecharPainel();
        await carregar();
        aviso('Backup importado', 'ok');
      } catch (e) {
        btnAplicar.disabled = false;
        btnAplicar.textContent = 'Aplicar importação';
        aviso(e.tipo === 'api' ? e.message : 'Erro ao salvar', 'erro');
      }
    });
  }

  // ---------- Categorias ----------

  function abrirCategorias() {
    const painel = abrirPainel({ titulo: 'Categorias', nome: 'categorias' });
    const fNova = el('input', { type: 'text', placeholder: 'Nova categoria', maxlength: '60', autocomplete: 'off', 'aria-label': 'Nova categoria', enterkeyhint: 'done' });
    const btnAdd = el('button', { type: 'submit', class: 'btn btn-primario', text: 'Adicionar' });
    const formNova = el('form', { class: 'cat-nova' }, fNova, btnAdd);
    const lista = el('div');

    formNova.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!exigirOnline()) return;
      const nome = fNova.value.trim();
      if (!nome) { aviso('Digite o nome da categoria.', 'erro'); return; }
      btnAdd.disabled = true;
      try {
        const r = await api('POST', '/categorias', { nome });
        estado.categorias.push(r.categoria);
        fNova.value = '';
        aviso('Salvo', 'ok');
        renderizarChips();
        painel.render();
      } catch (erro) {
        aviso(erro.tipo === 'api' ? erro.message : 'Erro ao salvar', 'erro');
      } finally {
        btnAdd.disabled = false;
      }
    });

    painel.render = () => {
      limpar(lista);
      for (const c of estado.categorias) {
        const total = estado.itens.filter((i) => normalizar(i.categoria) === normalizar(c.nome)).length;
        lista.append(linhaCategoria(c, total, painel));
      }
    };
    painel.corpo.append(formNova, lista);
    painel.render();
  }

  function linhaCategoria(c, total, painel) {
    const linha = el('div', { class: 'cat-linha' });
    const modoVer = () => {
      limpar(linha);
      const btnRenomear = el('button', { type: 'button', class: 'btn btn-pequeno', text: 'Renomear' });
      const btnExcluir = el('button', {
        type: 'button', class: 'btn btn-pequeno btn-perigo', text: 'Excluir', disabled: total > 0,
        title: total > 0 ? 'Mova ou exclua os itens desta categoria antes' : null
      });
      btnRenomear.addEventListener('click', modoEditar);
      btnExcluir.addEventListener('click', excluir);
      linha.append(
        el('span', { class: 'cat-nome', text: c.nome }),
        el('span', { class: 'cat-total', text: String(total) }),
        btnRenomear, btnExcluir);
    };
    const modoEditar = () => {
      limpar(linha);
      const entrada = el('input', { type: 'text', maxlength: '60', autocomplete: 'off', 'aria-label': 'Novo nome' });
      entrada.value = c.nome;
      const btnOk = el('button', { type: 'submit', class: 'btn btn-pequeno btn-primario', text: 'Salvar' });
      const btnNao = el('button', { type: 'button', class: 'btn btn-pequeno', text: 'Cancelar' });
      const f = el('form', { class: 'cat-nova' }, entrada, btnOk, btnNao);
      f.style.flex = '1';
      f.style.margin = '0';
      btnNao.addEventListener('click', modoVer);
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!exigirOnline()) return;
        const nome = entrada.value.trim();
        if (!nome) { aviso('Digite o nome da categoria.', 'erro'); return; }
        if (nome === c.nome) { modoVer(); return; }
        btnOk.disabled = true;
        try {
          const r = await api('PUT', `/categorias/${encodeURIComponent(c.id)}`, { nome });
          const anterior = normalizar(c.nome);
          c.nome = r.categoria.nome;
          for (const item of estado.itens) {
            if (normalizar(item.categoria) === anterior) {
              item.categoria = c.nome;
              indexar(item);
            }
          }
          if (estado.categoria && normalizar(estado.categoria) === anterior) estado.categoria = c.nome;
          aviso('Salvo', 'ok');
          renderizarChips();
          renderizarLista();
          painel.render();
        } catch (erro) {
          btnOk.disabled = false;
          aviso(erro.tipo === 'api' ? erro.message : 'Erro ao salvar', 'erro');
        }
      });
      linha.append(f);
      entrada.focus();
      entrada.select();
    };
    const excluir = async () => {
      if (!exigirOnline()) return;
      const ok = await confirmar(`Excluir a categoria "${c.nome}"?`, 'Excluir');
      if (!ok) return;
      try {
        await api('DELETE', `/categorias/${encodeURIComponent(c.id)}`);
        estado.categorias = estado.categorias.filter((x) => x.id !== c.id);
        if (estado.categoria && normalizar(estado.categoria) === normalizar(c.nome)) estado.categoria = null;
        aviso('Categoria excluída', 'ok');
        renderizarChips();
        renderizarLista();
        painel.render();
      } catch (erro) {
        aviso(erro.tipo === 'api' ? erro.message : 'Erro ao excluir', 'erro');
      }
    };
    modoVer();
    return linha;
  }

  // ---------- Tema (escuro / claro — Kayan Design System) ----------

  const CORES_TEMA = { escuro: '#050505', claro: '#F6F8FA' };

  function temaAtual() {
    return document.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'escuro';
  }

  function atualizarBotaoTema() {
    const proximo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
    const botao = $('#btn-tema');
    botao.setAttribute('aria-label', `Mudar para o tema ${proximo}`);
    botao.setAttribute('title', `Mudar para o tema ${proximo}`);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', CORES_TEMA[temaAtual()]);
  }

  function alternarTema() {
    const novo = temaAtual() === 'escuro' ? 'claro' : 'escuro';
    document.documentElement.setAttribute('data-tema', novo);
    gravarLocal('kit-tema', novo);
    atualizarBotaoTema();
    aviso(`Tema ${novo}`, 'ok');
  }

  // ---------- Início ----------

  function iniciar() {
    const busca = $('#campo-busca');
    const btnLimpar = $('#btn-limpar-busca');

    busca.addEventListener('input', () => {
      estado.busca = busca.value;
      btnLimpar.hidden = !busca.value;
      renderizarLista();
    });
    btnLimpar.addEventListener('click', () => {
      busca.value = '';
      estado.busca = '';
      btnLimpar.hidden = true;
      renderizarLista();
      busca.focus();
    });

    $('#ordenacao').addEventListener('change', (e) => {
      estado.ordem = e.target.value;
      renderizarLista();
    });

    $('#btn-novo').addEventListener('click', () => { if (exigirOnline()) abrirFormulario(null); });
    $('#btn-novo-topo').addEventListener('click', () => { if (exigirOnline()) abrirFormulario(null); });
    prepararGaveta();
    medirTopo();
    window.addEventListener('resize', medirTopo);
    let aguardandoAjuste = false;
    window.addEventListener('resize', () => {
      if (aguardandoAjuste) return;
      aguardandoAjuste = true;
      requestAnimationFrame(() => { aguardandoAjuste = false; ajustarCategorias(); });
    });
    DESKTOP.addEventListener('change', () => { if (!DESKTOP.matches) fecharLateral(); medirTopo(); });
    $('#btn-tema').addEventListener('click', alternarTema);
    atualizarBotaoTema();

    $('#arquivo-backup').addEventListener('change', (e) => {
      const arquivo = e.target.files && e.target.files[0];
      e.target.value = '';
      if (arquivo) {
        const continuar = () => lerBackupEscolhido(arquivo);
        if (pilha.length) fecharPainel().then(continuar);
        else continuar();
      }
    });

    // Atalhos de teclado (extra para desktop)
    document.addEventListener('keydown', (e) => {
      const alvo = e.target;
      const digitando = alvo instanceof HTMLElement && (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName));
      const atalhoK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      if ((e.key === '/' && !digitando) || atalhoK) {
        if (pilha.length) return;
        if (gavetaAberta()) fecharGaveta();
        e.preventDefault();
        busca.focus();
        busca.select();
        return;
      }
      if (e.key !== 'Escape' || $('#dialogo').open) return;
      if (gavetaAberta()) {
        e.preventDefault();
        fecharGaveta(true);
      } else if (pilha.length) {
        e.preventDefault();
        fecharPainel();
      } else if (detalheLateral) {
        e.preventDefault();
        if (detalheLateral.anteriores.length) voltarLateral();
        else fecharLateral(true);
      }
    });

    window.addEventListener('online', () => carregar());
    window.addEventListener('offline', () => definirOffline(true));

    // Histórico: garante um estado base para o botão Voltar do Android fechar painéis.
    history.replaceState({ painel: 0 }, '');

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => { /* sem PWA, o site funciona igual */ });
    }

    carregar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
