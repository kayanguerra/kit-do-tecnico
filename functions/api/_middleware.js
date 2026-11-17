// Middleware de todas as rotas /api/*:
// - bloqueia gravações vindas de outro site (verificação de Origin);
// - confere se o banco D1 está vinculado;
// - transforma qualquer exceção em JSON de erro, sem vazar detalhes internos.
import { erro } from '../_lib/util.js';

const METODOS_LEITURA = ['GET', 'HEAD', 'OPTIONS'];

export async function onRequest(context) {
  const { request, env } = context;

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
