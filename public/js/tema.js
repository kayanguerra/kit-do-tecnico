/* Aplica o tema salvo antes de a página aparecer (evita piscar na cor errada).
   Temas do Kayan Design System: "escuro" (padrão, o da marca) e "claro".
   Valores antigos ("marinho", "verde", "azul") viram "escuro". */
(function () {
  var tema = 'escuro';
  try { tema = localStorage.getItem('kit-tema') || 'escuro'; } catch (e) { /* sem armazenamento */ }
  if (tema !== 'escuro' && tema !== 'claro') tema = 'escuro';
  document.documentElement.setAttribute('data-tema', tema);
})();
