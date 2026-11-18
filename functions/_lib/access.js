// Validação do token do Cloudflare Access (segunda camada de proteção da API).
//
// O Access fica na frente do site e, em toda requisição que deixa passar, envia o
// cabeçalho Cf-Access-Jwt-Assertion: um JWT assinado com as chaves da equipe.
// Aqui conferimos assinatura, aplicação (aud), emissor (iss) e validade (exp/nbf).
// Se o Access um dia for mal configurado e deixar alguém passar sem login, o token
// não existe ou não confere, e a API recusa com 403.
//
// Configuração (wrangler.toml, seção [vars]):
//   ACCESS_TEAM_DOMAIN = "https://<equipe>.cloudflareaccess.com"
//   ACCESS_AUD         = "<Application Audience (AUD) Tag da aplicação>"
// Sem essa configuração a API NÃO libera: responde 500 (falha fechada).
// Única exceção: endereços locais (wrangler pages dev), onde não existe Access.

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const CACHE_CHAVES_MS = 60 * 60 * 1000; // 1 hora
const FOLGA_RELOGIO_S = 60;

let cache = { equipe: '', em: 0, chaves: new Map() };

function b64urlParaBytes(texto) {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlParaJson(texto) {
  return JSON.parse(new TextDecoder().decode(b64urlParaBytes(texto)));
}

async function buscarChaves(equipe) {
  const resp = await fetch(`${equipe}/cdn-cgi/access/certs`, { cf: { cacheTtl: 300 } });
  if (!resp.ok) throw new Error(`certs HTTP ${resp.status}`);
  const { keys } = await resp.json();
  const chaves = new Map();
  for (const jwk of keys || []) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    const chave = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    chaves.set(jwk.kid, chave);
  }
  cache = { equipe, em: Date.now(), chaves };
  return chaves;
}

async function chavePorKid(equipe, kid) {
  const valido = cache.equipe === equipe && Date.now() - cache.em < CACHE_CHAVES_MS;
  if (valido && cache.chaves.has(kid)) return cache.chaves.get(kid);
  // Chave nova (rotação) ou cache vencido: busca de novo uma vez.
  const chaves = await buscarChaves(equipe);
  return chaves.get(kid) || null;
}

// Retorna { usuario: { email, local } } se a requisição pode seguir; senão { bloqueio: { status, mensagem } }.
export async function validarAccess(request, env) {
  const r = await validarToken(request, env);
  return r.bloqueio ? r : { usuario: r.usuario };
}

async function validarToken(request, env) {
  const url = new URL(request.url);
  if (HOSTS_LOCAIS.has(url.hostname)) return { usuario: { email: '', local: true } };

  const equipe = String(env.ACCESS_TEAM_DOMAIN || '').replace(/\/+$/, '');
  const aud = String(env.ACCESS_AUD || '');
  if (!equipe || !aud) {
    return { bloqueio: { status: 500, mensagem: 'Validação do Access não configurada (ACCESS_TEAM_DOMAIN / ACCESS_AUD).' } };
  }

  const negado = { bloqueio: { status: 403, mensagem: 'Acesso negado.' } };
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return negado;

  const partes = token.split('.');
  if (partes.length !== 3) return negado;

  let cabecalho, dados;
  try {
    cabecalho = b64urlParaJson(partes[0]);
    dados = b64urlParaJson(partes[1]);
  } catch {
    return negado;
  }
  if (cabecalho.alg !== 'RS256' || !cabecalho.kid) return negado;

  let chave;
  try {
    chave = await chavePorKid(equipe, cabecalho.kid);
  } catch (e) {
    console.error('Access: não foi possível obter as chaves públicas:', e && e.message);
    return { bloqueio: { status: 503, mensagem: 'Não foi possível validar o login agora. Tente de novo.' } };
  }
  if (!chave) return negado;

  const assinaturaOk = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    chave,
    b64urlParaBytes(partes[2]),
    new TextEncoder().encode(`${partes[0]}.${partes[1]}`)
  );
  if (!assinaturaOk) return negado;

  const agoraS = Math.floor(Date.now() / 1000);
  const auds = Array.isArray(dados.aud) ? dados.aud : [dados.aud];
  if (!auds.includes(aud)) return negado;
  if (dados.iss !== equipe) return negado;
  if (typeof dados.exp !== 'number' || dados.exp < agoraS - FOLGA_RELOGIO_S) return negado;
  if (typeof dados.nbf === 'number' && dados.nbf > agoraS + FOLGA_RELOGIO_S) return negado;

  const email = typeof dados.email === 'string' ? dados.email.trim().toLowerCase() : '';
  return { usuario: { email, local: false } };
}
