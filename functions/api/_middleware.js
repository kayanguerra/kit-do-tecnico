// Middleware de todas as rotas /api/*:
// - confere o token do Cloudflare Access (segunda camada; ver _lib/access.js);
// - permissões: só os e-mails da variável secreta EDITORES podem gravar; os demais só leem;
// - bloqueia gravações vindas de outro site (verificação de Origin);
// - confere se o banco D1 está vinculado;
// - transforma qualquer exceção em JSON de erro, sem vazar detalhes internos.
import { erro } from '../_lib/util.js';
import { validarAccess } from '../_lib/access.js';

const METODOS_LEITURA = ['GET', 'HEAD', 'OPTIONS'];

// Gravações liberadas também para quem só lê: o contador de uso (POST /api/uso/<id>).
const GRAVACAO_DE_LEITOR = /^\/api\/uso\/[^/]+\/?$/;

// EDITORES: e-mails separados por vírgula (secret do Pages). Sem a variável, ninguém edita (falha fechada).
function podeEditar(usuario, env) {
  if (usuario.local) return true; // wrangler pages dev
  const lista = String(env.EDITORES || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return Boolean(usuario.email) && lista.includes(usuario.email);
}

export async function onRequest(context) {
  const { request, env } = context;

  let acesso;
  try {
    acesso = await validarAccess(request, env);
  } catch (e) {
    console.error('Access: falha ao validar o token:', e && e.message);
    acesso = { bloqueio: { status: 403, mensagem: 'Acesso negado.' } };
  }
  if (acesso.bloqueio) return erro(acesso.bloqueio.status, acesso.bloqueio.mensagem);

  const usuario = { email: acesso.usuario.email, podeEditar: podeEditar(acesso.usuario, env) };
  context.data.usuario = usuario;

  if (!METODOS_LEITURA.includes(request.method) && !usuario.podeEditar
      && !GRAVACAO_DE_LEITOR.test(new URL(request.url).pathname)) {
    return erro(403, 'Seu acesso é somente leitura.');
  }

  if (!METODOS_LEITURA.includes(request.method)) {
    const origem = request.headers.get('Origin');
    if (origem) {
      let hostOrigem = '';
      try {
        hostOrigem = new URL(origem).host;
      } catch {
        hostOrigem = '';
      }
      if (hostOrigem !== new URL(request.url).host) {
        return erro(403, 'Origem não permitida.');
      }
    }
  }

  if (!env.DB) {
    return erro(500, 'Banco de dados não vinculado. Confira o binding "DB" do D1 no projeto Pages.');
  }

  try {
    return await context.next();
  } catch (e) {
    console.error('Erro na API:', e && e.stack ? e.stack : e);
    return erro(500, 'Erro interno ao processar a solicitação.');
  }
}
