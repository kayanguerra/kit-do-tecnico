/* Aplica o tema salvo antes de a página aparecer (evita piscar na cor errada). */
(function () {
  var tema = 'marinho';
  try { tema = localStorage.getItem('kit-tema') || 'marinho'; } catch (e) { /* sem armazenamento */ }
  if (tema !== 'marinho' && tema !== 'verde') tema = 'marinho'; // "azul" antigo vira marinho
  document.documentElement.setAttribute('data-tema', tema);
})();
