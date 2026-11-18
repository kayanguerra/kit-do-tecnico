// GET /api/eu -> quem está logado e se pode editar (o site usa para esconder os botões de edição).
// A permissão de verdade é conferida no _middleware.js; isto é só informativo.
import { json } from '../_lib/util.js';

export function onRequestGet({ data }) {
  const usuario = data.usuario || { email: '', podeEditar: false };
  return json({ ok: true, email: usuario.email, podeEditar: usuario.podeEditar });
}
