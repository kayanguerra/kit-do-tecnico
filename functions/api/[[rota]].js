// Qualquer /api/* que não corresponda a uma rota existente cai aqui,
// para devolver JSON em vez da página HTML de erro.
import { erro } from '../_lib/util.js';

export function onRequest() {
  return erro(404, 'Rota da API não encontrada.');
}
