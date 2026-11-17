# Kit do Técnico — Documentação técnica e operacional

> Gerada em 16/11/2026 a partir do código em `C:\Projetos\kit-do-tecnico-final`.
> Nenhum segredo, token ou valor de configuração foi copiado para este documento (o `database_id` do D1 foi omitido de propósito).

## Como ler as marcações

| Marcação | Significado |
|---|---|
| **[Código]** | Confirmado lendo os arquivos do projeto. |
| **[Informado]** | Você me informou em conversas anteriores, mas eu **não** consegui verificar no ambiente publicado. |
| **[Pendente]** | Depende de conferência no painel da Cloudflare ou de um teste. A tabela de pendências (seção 7) diz como resolver. |

**Limite desta análise:** não consegui abrir `kit-do-tecnico.pages.dev` daqui (o acesso de rede da minha sessão bloqueia o domínio). Portanto **nada do ambiente publicado foi confirmado por mim**. Tudo o que diz respeito a produção está marcado como [Informado] ou [Pendente].

---

## Resumo em 2 minutos

- **O que é:** uma biblioteca pessoal de comandos (PowerShell, CMD, Win+R), atalhos de teclado, links e artigos de solução de problemas, feita para consultar e copiar pelo celular durante atendimentos. Funciona como app instalável (PWA) e abre offline em modo somente leitura.
- **Como é feito:** HTML, CSS e JavaScript puros (sem framework) na pasta `public/`; uma API pequena em **Cloudflare Pages Functions** na pasta `functions/`; dados no **Cloudflare D1** (um banco SQLite gerenciado pela Cloudflare). Não há `package.json`, build nem dependências de terceiros no navegador.
- **Onde ficam os dados:** no D1, na sua conta Cloudflare. No celular ficam apenas uma cópia para uso offline (cache do service worker), a preferência de tema e a data da última sincronização. Limpar o navegador não apaga nada do banco; publicar uma nova versão do site também não.
- **Segurança:** a API **não tem login próprio**. Toda a proteção depende do **Cloudflare Access** cobrindo o domínio de produção **e** os endereços de pré-visualização (`*.kit-do-tecnico.pages.dev`). Você informou que ativou o Access; eu não consegui confirmar. **Esta é a verificação mais importante da lista.**
- **Custo:** com o uso de uma pessoa, tudo cabe nos planos gratuitos (Workers Free, D1 Free, Zero Trust Free, subdomínio `pages.dev`). No plano gratuito, ao estourar um limite o serviço **para** até o dia seguinte em vez de cobrar. Você só passaria a pagar se assinasse o Workers Paid (US$ 5/mês), um domínio próprio ou passasse de 50 usuários no Access. O plano real da conta precisa ser conferido no painel.
- **Pontos fracos encontrados:**
  1. Uma pasta `public/.wrangler/` (cache do wrangler com a identificação da sua conta) está **dentro da pasta publicada** e provavelmente foi enviada ao site.
  2. Não há Git: não existe histórico de alterações do código.
  3. O `schema.sql` começa com `DROP TABLE`: rodar de novo apaga todos os dados. Não há sistema de migrações.
  4. Backup depende de você exportar manualmente; a recuperação automática do D1 (Time Travel) cobre só 7 dias no plano gratuito.
- **Três primeiras ações recomendadas:** (1) testar o Access em janela anônima, inclusive na URL de pré-visualização, e adicionar validação do token do Access na API; (2) remover `public/.wrangler`, criar `.gitignore` e colocar o projeto no Git; (3) trocar o `schema.sql` destrutivo por migrações e criar uma rotina de backup com `wrangler d1 export`.

---

## 1. Visão geral do site

O Kit do Técnico é uma aplicação de página única (SPA): o navegador carrega um único `index.html` e o JavaScript monta as telas (lista, detalhe, formulário, categorias, importação) sem recarregar a página. Os dados vêm de uma API REST em `/api/...` que roda na própria Cloudflare.

**O que o usuário consegue fazer:**

- Buscar por título, conteúdo, tags e categoria, com tolerância a acentos.
- Filtrar por tipo (comando, artigo, favoritos), categoria e "onde rodar" (PowerShell, CMD, Win+R, atalho).
- Copiar um comando com um toque (com vibração no Android).
- Ler artigos de solução de problemas com passos numerados, blocos de código copiáveis, links e comandos relacionados.
- Cadastrar, editar, favoritar e excluir itens; criar, renomear e excluir categorias.
- Exportar e importar backup em JSON.
- Instalar como app no celular e consultar offline.

**Tecnologias e serviços:**

| Camada | Tecnologia | Termo explicado |
|---|---|---|
| Interface | HTML/CSS/JS puros em `public/` | Sem React, Vue etc. O JS manipula o DOM direto. |
| PWA | `manifest.webmanifest` + `service-worker.js` | **PWA**: site que pode ser instalado como app. **Service worker**: script que roda em segundo plano no navegador e intercepta requisições, permitindo cache offline. |
| API | Cloudflare **Pages Functions** em `functions/` | Funções JavaScript que rodam nos servidores da Cloudflare quando alguém acessa `/api/...`. O nome do arquivo define a rota (roteamento por arquivo). |
| Banco | Cloudflare **D1** | Banco SQL baseado em SQLite, hospedado pela Cloudflare. O código acessa por um **binding** chamado `DB` (uma variável injetada pela Cloudflare; não há senha no código). |
| Hospedagem | Cloudflare **Pages** | Hospeda os arquivos estáticos e as Functions. Publicação por **Direct Upload** (envio direto pelo `wrangler`, sem Git). |
| Proteção | Cloudflare **Access** (Zero Trust) | Fica na frente do site e exige login (código enviado por e-mail) antes de qualquer requisição chegar ao site ou à API. |
| Ferramenta | **wrangler** (CLI da Cloudflare) | Programa de linha de comando para publicar, rodar localmente e consultar o D1. Executado via `npx`, sem instalação fixa. |

**Onde roda e para onde vão os dados:**

```
Celular / PC
  │  (1) login no Cloudflare Access (código por e-mail)          [Informado]
  ▼
kit-do-tecnico.pages.dev  ── arquivos de public/ (HTML, CSS, JS, ícones, fontes)
  │
  └── /api/*  →  Pages Functions (functions/)  →  D1 "kit-do-tecnico" (binding DB)
                                                   (fica na sua conta Cloudflare)
No aparelho: cache do service worker (cópia de /api/itens e /api/categorias)
             + localStorage (tema e data da última sincronização)
```

Não há nenhum serviço externo além da Cloudflare: as fontes (Inter) estão no próprio projeto e a Content Security Policy em `public/_headers` bloqueia scripts, estilos e conexões de outros domínios. **[Código]**

---

## 2. Funcionalidades implementadas

Arquivos principais: interface em `public/index.html` e `public/js/app.js` (≈66 KB, todo o comportamento da tela); estilos em `public/css/app.css`; API em `functions/api/`; regras compartilhadas da API em `functions/_lib/util.js`.

| Funcionalidade | Como usar | Como funciona | Onde está no código | Status |
|---|---|---|---|---|
| Carregar a biblioteca | Abrir o site | `carregar()` chama `GET /api/itens` e `GET /api/categorias` em paralelo, monta um índice de busca em memória e grava a data da sincronização no localStorage. | `app.js` → `carregar()`, `api()`; `functions/api/itens/index.js` (`onRequestGet`); `functions/api/categorias/index.js` | [Código] OK |
| Busca | Digitar na caixa de busca; `Ctrl+K` ou `/` no PC | Busca 100% no navegador. Remove acentos (`normalizar()`), divide em termos e dá pontos por título, tag, categoria, conteúdo e corpo. Todos os termos precisam aparecer em algum campo. | `app.js` → `pontuar()`, `itensVisiveis()`, `indexar()` | [Código] OK |
| Filtros e ordenação | Chips no topo; seletor "Relevância / Mais usados / Recentes / A–Z"; menu ☰ → Biblioteca, Favoritos, Recentes | Filtragem em memória. "Onde rodar" é deduzido: atalho pelo formato `Tecla + Tecla`; PowerShell/CMD/Win+R pelas tags `powershell`, `cmd`, `win+r`; sem tag, verbos PowerShell (`Get-`, `Set-`…) ou variáveis `$` indicam PowerShell. | `app.js` → `renderizarChips()`, `ondeRodar()`, `ehAtalho()`, `trocarSecao()` | [Código] OK |
| Copiar comando | Botão **Copiar** | Tenta `navigator.clipboard`; se falhar, usa `execCommand('copy')`. Vibra 20 ms, mostra "Copiado!" e chama `POST /api/uso/:id` para somar 1 ao contador. | `app.js` → `copiar()`, `copiarFallback()`, `registrarUso()`; `functions/api/uso/[id].js` | [Código] OK. Fallback do iPhone não testado em aparelho real (README §9). |
| Ver detalhe | Tocar no item | Celular: painel em tela cheia, empilhado no histórico (o botão Voltar do Android fecha o painel). PC (≥1024 px): painel lateral à direita. | `app.js` → `abrirDetalhe()`, `abrirPainel()`, `abrirLateral()` | [Código] OK |
| Artigos formatados | Campo "Solução" do artigo | Interpreta `1.` (passo), `-` (lista), blocos entre ``` (código com Copiar e Quebrar) e URLs (links). Tudo inserido com `textContent`, nunca `innerHTML`, o que impede injeção de HTML. | `app.js` → `textoFormatado()`, `blocoCodigo()`, `comLinks()` | [Código] OK |
| Links | Item do tipo comando cujo conteúdo é só uma URL | Vira botão **Abrir** (nova aba, `noopener`). Só aceita `http`/`https`. | `app.js` → `ehLink()`, `abrirLink()` | [Código] OK |
| Cadastrar / editar item | **+ Novo item** ou **Editar** | Formulário → `POST /api/itens` ou `PUT /api/itens/:id`. A API valida tipo, campos obrigatórios, tamanhos, tags (máx. 30), categoria existente e comandos relacionados (precisam existir e ser do tipo comando). Campos do outro tipo são limpos. | `app.js` → `abrirFormulario()`; `functions/api/itens/index.js`, `functions/api/itens/[id].js`; `util.js` → `validarItem()` | [Código] OK |
| Favoritar | Estrela | `PATCH /api/itens/:id` com `{ "favorito": true/false }`. | `app.js` → `alternarFavorito()`; `itens/[id].js` → `onRequestPatch` | [Código] OK |
| Excluir item | **Excluir** (pede confirmação) | `DELETE /api/itens/:id`. Se for comando, remove o ID dele dos "relacionados" dos artigos, tudo numa transação. **Não há lixeira.** | `app.js` → `excluirItem()`; `itens/[id].js` → `onRequestDelete`, `desvincular()` | [Código] OK |
| Contador de uso / Recentes | Automático | Soma 1 ao copiar, ao abrir um link e **ao abrir um artigo**. Abrir um comando sem copiar não conta. "Recentes" lista itens com `ultimo_uso`. | `app.js` → `registrarUso()`, `lerItem()` | [Código] OK (atenção: "uso" mistura leitura de artigo e cópia de comando) |
| Categorias | Menu ☰ → Gerenciar categorias | `POST` cria; `PUT` renomeia e atualiza os itens na mesma transação; `DELETE` só se a categoria estiver vazia. | `app.js` → `abrirCategorias()`; `functions/api/categorias/index.js`, `categorias/[id].js` | [Código] OK |
| Exportar backup | Menu ☰ → Exportar backup | `GET /api/backup` devolve JSON com categorias e itens (download `kit-do-tecnico-backup-AAAA-MM-DD.json`). Offline, exporta a cópia do aparelho com sufixo `-offline`. | `app.js` → `exportarBackup()`; `functions/api/backup.js` | [Código] OK |
| Importar backup | Menu ☰ → Importar backup | 1º `POST /api/backup` com `confirmar:false` → só valida e mostra prévia (criar/substituir/categorias novas). 2º com `confirmar:true` → aplica tudo numa transação. Mesmo ID = substitui; itens fora do arquivo não são apagados. Limites: 5 MB e 5.000 itens. | `app.js` → `lerBackupEscolhido()`, `mostrarResultadoImportacao()`; `backup.js` → `analisar()` | [Código] OK. Comportamento com centenas de itens em produção: [Pendente] |
| Modo offline | Abrir o app sem internet | Service worker devolve a última cópia de `/api/itens` e `/api/categorias` com o cabeçalho `X-Kit-Offline: 1`; o app esconde botões de gravação e mostra o aviso. Volta sozinho ao ficar online. | `public/service-worker.js`; `app.js` → `definirOffline()`, `exigirOnline()` | [Código] OK |
| Instalar como app | Android: menu ⋮ → Instalar app. iPhone: Compartilhar → Adicionar à Tela de Início | `manifest.webmanifest` com `crossorigin="use-credentials"` para o navegador enviar o cookie do Access ao buscar o manifesto. | `public/manifest.webmanifest`, `index.html` | [Pendente] em aparelho real |
| Tema | Botão de meia-lua no topo | Alterna "marinho"/"verde", salvo em `localStorage` (`kit-tema`). `tema.js` aplica antes da página aparecer. | `public/js/tema.js`; `app.js` → `alternarTema()` | [Código] OK |
| Login / permissões | Tela da Cloudflare antes do site | **Não existe no código.** Não há usuários, perfis nem senha na API. Quem passa pelo Access pode ler, alterar e apagar tudo. | — (configuração no painel Zero Trust) | [Informado] / [Pendente] |
| Sessão expirada | Automático | Com o Access, uma sessão vencida faz a API responder com redirecionamento; o app detecta (`redirect:'manual'`) e pede para recarregar. | `app.js` → `api()` | [Código]; efeito real [Pendente] |
| Proteção contra outro site gravando | Automático | Middleware recusa `POST/PUT/PATCH/DELETE` cujo cabeçalho `Origin` seja de outro domínio (proteção básica contra CSRF). Requisições sem `Origin` (ex.: `curl`) passam. | `functions/api/_middleware.js` | [Código] OK |
| Rota inexistente | — | Qualquer `/api/...` desconhecida devolve JSON 404. | `functions/api/[[rota]].js` | [Código] OK |
| Painel administrativo | — | Não existe. A administração é feita no próprio app (categorias, backup) e no painel da Cloudflare. | — | Não implementado |

### Fluxos reais, da tela ao resultado

**Cadastrar um comando**
1. Você toca em **+ Novo item**. Se estiver offline, `exigirOnline()` bloqueia e avisa.
2. Preenche o formulário e toca em **Salvar**. O app envia `POST /api/itens` com JSON.
3. O Access confere o cookie de login (antes de chegar ao código). **[Informado]**
4. `_middleware.js` confere a origem e se o binding `DB` existe.
5. `itens/index.js` lê o JSON (exige `Content-Type: application/json`, máx. 1 MB), roda `validarItem()`, confere a categoria e os relacionados no D1.
6. Gera um UUID, grava com `INSERT ... ON CONFLICT` e devolve o item salvo.
7. O app atualiza a lista em memória e mostra "Salvo". Se a API recusar, mostra os erros vindos em `detalhes`.

**Copiar um comando**
1. Toque em **Copiar** → texto vai para a área de transferência → vibração e "Copiado!".
2. Em segundo plano, `POST /api/uso/:id` soma 1 ao contador. Se falhar, o app ignora sem avisar (o contador é opcional).

**Importar backup**
1. Menu ☰ → Importar → escolhe o `.json`.
2. O app envia o arquivo inteiro com `confirmar:false`. A API valida tudo e responde a prévia sem gravar.
3. Você confirma → o app reenvia com `confirmar:true` → a API valida de novo e aplica categorias novas e itens num único `batch` do D1 (se um comando falhar, nada é aplicado).

### Situação de dados e arquivos auxiliares

- `seed.sql`: 8 categorias e 5 itens de exemplo. **[Código]**
- `importar/kit-importacao-completa.json`: backup pronto com 15 categorias e 97 itens (93 comandos, 4 artigos). Se ele já foi importado em produção: **[Pendente]** (consulta na seção 3).

---

## 3. Banco de dados e armazenamento

### Respostas diretas

- **O site usa banco de dados? Qual?** Sim: **Cloudflare D1**, nome `kit-do-tecnico`, ligado ao site pelo binding `DB` em `wrangler.toml`. D1 é SQLite rodando na Cloudflare. **[Código]**
- **Onde os dados ficam na prática e quem hospeda?** Nos servidores da Cloudflare, dentro da sua conta. Não há outro servidor. A região física do banco não está no código **[Pendente]**: aparece no painel do D1.
- **Quando alguém preenche um formulário, o que é salvo e onde?** O item inteiro (título, categoria, conteúdo, tags, favorito etc.) vai para a tabela `itens` do D1; categorias para a tabela `categorias`. Contagem de uso e favorito também ficam no D1.
- **Os dados ficam disponíveis em outro dispositivo?** Sim. Qualquer aparelho que passe pelo login do Access vê os mesmos dados.
- **E se eu limpar o navegador?** Perde apenas a cópia offline, o tema escolhido e a data da última sincronização. Ao abrir de novo com internet, tudo volta do D1.
- **E se eu publicar uma nova versão?** O D1 não é afetado. O deploy só troca os arquivos de `public/` e o código de `functions/`. **O único jeito de apagar o banco pelo projeto é rodar o `schema.sql` de novo** (ele começa com `DROP TABLE`).
- **Onde eu entro para consultar os dados?**
  - Painel: dash.cloudflare.com → **Storage & Databases → D1** → `kit-do-tecnico` → **Console** (aceita SQL). Os nomes de menu da Cloudflare mudam com frequência; se não bater, procure "D1" na busca do painel.
  - Terminal, na pasta do projeto: `npx wrangler d1 execute kit-do-tecnico --remote --command "SELECT tipo, COUNT(*) FROM itens GROUP BY tipo"`
- **Quem consegue ler, cadastrar, alterar ou excluir?**
  - Pelo site: **qualquer pessoa que passe pelo Access**, sem distinção de perfil. Todos podem tudo.
  - Pelo painel/terminal: qualquer pessoa com acesso à sua conta Cloudflare ou com o login do `wrangler` na sua máquina (`npx wrangler login` deixa uma credencial salva no seu perfil do Windows).

### Tabelas **[Código: `schema.sql`]**

**`categorias`**

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | TEXT (UUID) | Chave primária |
| `nome` | TEXT | Único, sem diferenciar maiúsculas (`COLLATE NOCASE`) |
| `ordem` | INTEGER | Ordem de exibição |
| `criado_em` | TEXT (ISO 8601) | |

**`itens`**

| Coluna | Usada em | Observação |
|---|---|---|
| `id` | todos | UUID, chave primária |
| `tipo` | todos | `comando` ou `artigo` (CHECK) |
| `titulo`, `categoria` | todos | `categoria` guarda o **nome** da categoria, não o ID |
| `conteudo`, `descricao`, `prerequisitos`, `requer_admin` | comando | `descricao` = "quando usar" |
| `sintoma`, `causa`, `solucao`, `observacoes` | artigo | |
| `relacionados` | artigo | Texto JSON com lista de IDs de comandos |
| `tags` | todos | Texto JSON com lista de textos |
| `favorito`, `usos`, `ultimo_uso` | todos | |
| `criado_em`, `atualizado_em` | todos | ISO 8601 em UTC |

Índices: `idx_itens_categoria`, `idx_itens_tipo`.

**Relações:** não há chave estrangeira. `itens.categoria` aponta para `categorias.nome` por texto. O código mantém a coerência: renomear categoria atualiza os itens na mesma transação; excluir categoria com itens é bloqueado. `relacionados` aponta para `itens.id` dentro de um JSON; excluir um comando ou transformá-lo em artigo remove o vínculo dos artigos.

| Conjunto de dados | Funções que usam |
|---|---|
| `itens` | Lista, busca, detalhe, formulário, favorito, contador de uso, backup |
| `categorias` | Chips de filtro, formulário (lista de categorias), gerenciar categorias, backup |

### Outros mecanismos de armazenamento

| Mecanismo | O que guarda | Onde | Consequência |
|---|---|---|---|
| D1 | Todos os dados | Cloudflare | Fonte única da verdade |
| Cache do service worker (`kit-estaticos-v6`) | HTML, CSS, JS, fontes, ícones | Navegador do aparelho | Permite abrir offline |
| Cache do service worker (`kit-api-v1`) | Última resposta de `/api/itens` e `/api/categorias` | Navegador do aparelho | Cópia de leitura offline. **Ponto de atenção:** os dados ficam salvos no aparelho, fora da proteção do Access. Se o celular for perdido desbloqueado, a biblioteca pode ser lida. |
| `localStorage` `kit-tema` | Tema escolhido | Navegador | Perde ao limpar o navegador |
| `localStorage` `kit-ultima-sincronizacao` | Data da última carga online | Navegador | Só para o aviso offline |
| Arquivo `.json` de backup | Cópia completa | Onde você salvar | Responsabilidade sua guardar |

### Backup e restauração hoje

1. **Manual pelo app:** Exportar/Importar backup (JSON). Importar **não apaga** itens que não estão no arquivo, então não serve para "voltar no tempo" se você criou itens errados depois. **[Código]**
2. **Time Travel do D1:** recurso automático da Cloudflare que permite restaurar o banco para um momento passado. A documentação oficial informa retenção de **7 dias no plano Free** e 30 dias no Workers Paid. Comandos: `npx wrangler d1 time-travel info kit-do-tecnico` e `npx wrangler d1 time-travel restore kit-do-tecnico --timestamp=...`. Restaurar substitui o banco inteiro. **[Pendente]**: nunca testado neste projeto.
3. **Exportação SQL:** `npx wrangler d1 export kit-do-tecnico --remote --output=backup.sql` gera um arquivo SQL com estrutura e dados. Não está automatizado.

**Consulta para saber se a importação completa foi feita:**
```
npx wrangler d1 execute kit-do-tecnico --remote --command "SELECT tipo, COUNT(*) AS total FROM itens GROUP BY tipo"
```
Se aparecerem ~93 comandos e ~4 artigos (ou mais), a importação foi aplicada.

---

## 4. Custos atuais e futuros

Fonte: documentação oficial da Cloudflare, consultada em **16/11/2026**. Valores em **dólar americano (USD)**, sem impostos. **Preço público ≠ cobrança da sua conta:** não tenho acesso ao seu painel, então o plano contratado e o consumo real estão marcados como [Pendente].

| Serviço | Para que serve | Plano identificado | Limite gratuito (preço público) | O que pode gerar cobrança | Onde conferir |
|---|---|---|---|---|---|
| Cloudflare Pages (arquivos estáticos) | Hospedar `public/` | [Informado] Free | Requisições a arquivos estáticos ilimitadas e gratuitas em qualquer plano; 500 builds/mês; 20.000 arquivos por site | Nada no uso atual. Builds só contam com integração Git (você publica por upload direto). | Painel → Workers & Pages → `kit-do-tecnico` |
| Pages Functions (a API) | Rodar `functions/` | [Pendente] (Workers Free ou Paid) | Cobradas como Workers: 100.000 requisições/dia no Free, somando Workers e Functions; zera à 00:00 UTC | No Free: **não cobra**, a API para de responder até o dia seguinte. No Paid: US$ 5/mês mínimo, com cota mensal incluída | Painel → Workers & Pages → Plans / Billing; métricas em Workers & Pages → projeto → Functions |
| Cloudflare D1 | Banco de dados | [Pendente] (vai junto do plano Workers) | Free: 5 milhões de linhas lidas/dia, 100 mil linhas gravadas/dia, 5 GB no total; 500 MB por banco; zera à 00:00 UTC | No Free: ao bater o limite, as consultas falham até o dia seguinte. No Paid: excedente por linha lida/gravada e GB armazenado | Painel → Storage & Databases → D1 → `kit-do-tecnico` → Metrics |
| Cloudflare Access / Zero Trust | Login antes do site | [Informado] Free | Plano Free para até 50 usuários | Passar de 50 usuários ou contratar o plano pago (US$ 7 por usuário/mês, conforme a página de preços) | Painel Zero Trust → Settings → Account / Billing (o nome do menu pode variar) |
| Domínio | Endereço do site | Subdomínio `kit-do-tecnico.pages.dev` [Informado] | Gratuito | Só se você registrar um domínio próprio | Painel → projeto → Custom domains (nenhum domínio próprio aparece no código) |
| Fontes Inter | Tipografia | Arquivos no projeto | Licença OFL (gratuita), em `public/fonts/LICENSE-Inter.txt` | Nada | — |

### Estimativa de consumo (com premissas)

Premissas: **1 usuário**, ~100 itens, ~30 aberturas do app por dia, ~50 cópias por dia, algumas edições.

- Cada abertura do app = 2 chamadas à API. A consulta de categorias conta itens por categoria com subconsulta e pode ler a tabela de itens várias vezes: estimo **até ~1.700 linhas lidas por abertura** no pior caso (15 categorias × ~100 itens + a lista). 30 aberturas ≈ 51.000 linhas/dia, cerca de **1%** do limite gratuito diário de leitura.
- 50 cópias ≈ 50 requisições e ~100 linhas gravadas por dia (o UPDATE e a leitura de volta).
- Total de requisições à API: algo na casa de **100 a 200 por dia**, contra 100.000 do plano gratuito.
- Armazenamento: ~100 itens de texto ocupam bem menos de 1 MB.

**Com o que foi possível verificar, o site pode funcionar sem cobrança recorrente? Em que situação eu começaria a pagar?**

Sim. Pelo código e pelos preços públicos, o uso pessoal cabe com folga nos planos gratuitos de Pages, Workers/Functions, D1 e Access, usando o subdomínio `pages.dev`. No plano gratuito do Workers/D1 o comportamento ao estourar o limite é **bloquear até 00:00 UTC (21h no horário de Brasília)**, não cobrar. Você começaria a pagar se: (a) assinasse o Workers Paid (mínimo US$ 5/mês) por qualquer motivo, inclusive para ter 30 dias de Time Travel; (b) comprasse um domínio próprio; (c) passasse de 50 usuários no Access; (d) ativasse algum produto pago no painel. O que **não consigo afirmar**: em que plano sua conta está hoje e se existe cartão cadastrado com algum serviço pago ativo. Confira em dash.cloudflare.com → **Manage Account → Billing** (faturas e assinaturas) e em **Workers & Pages → Plans**.

---

## 5. Como manter o projeto

### Estrutura de pastas

```
kit-do-tecnico-final/
├── wrangler.toml            nome do projeto, pasta publicada (./public), binding D1 "DB"
├── schema.sql               cria as tabelas — APAGA AS EXISTENTES (só para instalação inicial)
├── seed.sql                 8 categorias e 5 exemplos
├── README.md                guia de instalação, Access e checklist de testes
├── importar/                backup JSON com 97 itens para importar pelo app
├── functions/
│   ├── _lib/util.js         validação, conversão, SQL compartilhado (não é rota)
│   └── api/
│       ├── _middleware.js   roda antes de toda rota /api: origem, binding, erros
│       ├── [[rota]].js      404 em JSON para rotas inexistentes
│       ├── backup.js        GET/POST /api/backup
│       ├── uso/[id].js      POST /api/uso/:id
│       ├── itens/index.js   GET/POST /api/itens
│       ├── itens/[id].js    GET/PUT/PATCH/DELETE /api/itens/:id
│       ├── categorias/index.js   GET/POST /api/categorias
│       └── categorias/[id].js    PUT/DELETE /api/categorias/:id
├── public/                  TUDO aqui é publicado
│   ├── index.html, manifest.webmanifest, service-worker.js, _headers
│   ├── css/app.css, js/app.js, js/tema.js, fonts/, icons/
│   └── .wrangler/           ⚠️ cache do wrangler que não deveria estar aqui (ver seção 6)
├── .wrangler/               cache e arquivos temporários do wrangler (não publicar, não versionar)
└── docs/DOCUMENTACAO-DO-SITE.md   este documento
```

Nos nomes de arquivo, `[id]` significa "parte variável da URL" (`/api/itens/abc` → `params.id = "abc"`) e `[[rota]]` captura qualquer caminho restante.

### Variáveis de ambiente e configuração

- **Variáveis de ambiente:** nenhuma é usada pelo código.
- **Binding:** `DB` → banco D1 `kit-do-tecnico` (definido em `wrangler.toml`). Se o binding faltar, a API responde "Banco de dados não vinculado".
- **Segredos:** nenhum no projeto. A credencial do `wrangler login` fica no seu perfil do Windows, fora da pasta.
- **`compatibility_date = "2026-11-01"`:** fixa o comportamento do runtime da Cloudflare naquela data, para atualizações da plataforma não quebrarem o código.

### Rodar localmente

Pré-requisito: Node.js LTS (`node -v`). No PowerShell, dentro da pasta do projeto:

```powershell
# 1ª vez: criar o banco LOCAL (fica em .wrangler/state, separado da produção)
npx wrangler d1 execute kit-do-tecnico --local --file=./schema.sql
npx wrangler d1 execute kit-do-tecnico --local --file=./seed.sql

# Subir o site com API e D1 locais
npx wrangler pages dev
```

Abra o endereço mostrado (normalmente `http://localhost:8788`). Atenção: **localmente não há Access**, e o banco local é outro, diferente do de produção. A pasta `.wrangler/state` não existe hoje, então o banco local ainda precisa ser criado.

**Sempre rode os comandos na raiz do projeto**, não dentro de `public/`. A pasta `public/.wrangler` provavelmente surgiu de um comando rodado dentro de `public/`.

### Fazer uma alteração

1. **Visual/comportamento:** edite `public/js/app.js`, `public/css/app.css` ou `public/index.html`.
2. **API:** edite o arquivo da rota em `functions/api/...`. Regras de validação e limites de tamanho ficam em `functions/_lib/util.js` (`LIMITES`, `validarItem`).
3. **Banco (nova coluna etc.):** **não** rode o `schema.sql`. Crie um script com `ALTER TABLE` e teste primeiro com `--local`. Melhor ainda, adote migrações (seção 6).
4. Teste com `npx wrangler pages dev`.
5. Se mudou algo em `public/`, aumente a versão em `public/service-worker.js` (`kit-estaticos-v6` → `v7`). Observação: o service worker já busca a rede primeiro, então a versão nova costuma aparecer online mesmo sem essa troca; a troca garante que o cache antigo seja apagado. Mantenha a regra do README até testar.

### Publicar

```powershell
npx wrangler pages deploy
```

Usa `pages_build_output_dir = ./public` do `wrangler.toml` e envia também a pasta `functions/`. Cada deploy cria:
- uma URL de produção (`kit-do-tecnico.pages.dev`), se for o branch de produção;
- uma URL de pré-visualização única (`<hash>.kit-do-tecnico.pages.dev`), que **também** precisa estar protegida pelo Access.

**Voltar para a versão anterior:** painel → Workers & Pages → `kit-do-tecnico` → **Deployments** → deploy anterior → **Rollback**. Isso volta o código, **não** o banco.

### Onde ver erros

| O quê | Onde |
|---|---|
| Erros da tela | DevTools do navegador (F12 → Console e Network). No Android, `chrome://inspect` com o celular no USB. |
| Erros da API | `_middleware.js` grava `console.error('Erro na API: ...')`. Para ver ao vivo: `npx wrangler pages deployment tail --project-name kit-do-tecnico` ou painel → projeto → Deployments → deploy → **Functions** → Real-time logs. |
| Banco | Painel D1 → `kit-do-tecnico` → Metrics (consultas, linhas lidas/gravadas) e Console. |
| Access | Painel Zero Trust → Logs → Access (tentativas de login permitidas e negadas). No plano Free a retenção de logs é curta; confira no painel. |
| Configuração do deploy | Painel → projeto → Settings → **Bindings** (confirmar `DB` → `kit-do-tecnico`) e Settings → Functions → compatibility date. |

### Conferir a configuração do Access (passo a passo)

1. Painel Zero Trust → **Access → Applications**. Deve existir uma aplicação "Kit do Técnico" do tipo Self-hosted.
2. Em **Destinations / Application domain**, devem existir **dois** destinos: `kit-do-tecnico.pages.dev` e `*.kit-do-tecnico.pages.dev`.
3. Policy: Action **Allow**, Include → **Emails** → só o seu e-mail. Nada de "Everyone" ou domínio de e-mail genérico.
4. Login method: One-time PIN.
5. Teste: janela anônima em `https://kit-do-tecnico.pages.dev/api/itens` → deve aparecer a tela de login, **não** JSON. Repita com a URL de pré-visualização do último deploy (aparece no fim do `wrangler pages deploy` ou na aba Deployments).

---

## 6. Melhorias futuras (ordenadas por prioridade)

| # | Problema observado | Mudança sugerida | Benefício | Esforço | Custo |
|---|---|---|---|---|---|
| 1 | **A API confia 100% no Access.** Se a aplicação do Access tiver um erro de domínio, de policy, ou não cobrir as URLs de pré-visualização, qualquer pessoa com o link lê, altera e apaga tudo. Não verifiquei a configuração. | (a) Fazer os testes da seção 5 agora. (b) No `_middleware.js`, validar o cabeçalho `Cf-Access-Jwt-Assertion` (o token assinado que o Access envia ao site) contra as chaves públicas da sua equipe e o "AUD" da aplicação; recusar com 403 se faltar ou for inválido. A Cloudflare tem um plugin pronto para Pages (`@cloudflare/pages-plugin-cloudflare-access`), mas ele exigiria criar um `package.json`. | Defesa em profundidade: um erro no painel não expõe mais os dados. | Baixo (a); médio (b) | Nenhum |
| 2 | `public/.wrangler/cache/wrangler-account.json` (identificação da sua conta Cloudflare) está dentro da pasta publicada. Pela lista de arquivos ignorados que encontrei (de 2022, pode ter mudado), o wrangler não ignora `.wrangler`, então **provavelmente foi publicado**. | Apagar `public/.wrangler`, sempre rodar comandos na raiz e publicar de novo. Testar se `https://kit-do-tecnico.pages.dev/.wrangler/cache/wrangler-account.json` devolve 404. | Não expor dados da conta. Risco baixo (ID de conta não é senha e o site está atrás do Access), mas é lixo publicado. | Baixo | Nenhum |
| 3 | Sem Git: não há histórico de código nem como desfazer uma alteração ruim além do rollback de deploy. | `git init`, `.gitignore` com `.wrangler/`, `node_modules/` e `*.sql` de backup; repositório **privado** no GitHub. Pode continuar publicando com `wrangler pages deploy`. | Histórico, comparação de versões, backup do código. | Baixo | Nenhum (repositório privado é gratuito no GitHub; confira os termos atuais) |
| 4 | `schema.sql` começa com `DROP TABLE`. Rodar por engano apaga tudo. Não há forma segura de evoluir o banco. | Adotar migrações do wrangler: pasta `migrations/` com `0001_inicial.sql` (sem DROP), aplicar com `npx wrangler d1 migrations apply kit-do-tecnico --remote`. O wrangler registra quais já foram aplicadas. Renomear o `schema.sql` atual para algo como `schema-INSTALACAO-INICIAL-APAGA-TUDO.sql`. | Elimina o maior risco de perda de dados por erro operacional. | Baixo/médio | Nenhum |
| 5 | Backup depende de lembrar de exportar; Time Travel cobre 7 dias no Free; exclusão de item é imediata e sem lixeira. | Script `backup.ps1` que roda `wrangler d1 export --remote` com data no nome, salvando no OneDrive; agendar no Agendador de Tarefas do Windows (semanal). Opcional: "lixeira" com coluna `excluido_em` em vez de DELETE. | Recuperação além de 7 dias e proteção contra exclusão acidental. | Baixo (script); médio (lixeira) | Nenhum |
| 6 | Wrangler roda via `npx` sem versão fixa: cada execução pode baixar uma versão nova, com mudanças de comportamento. | Criar `package.json` com `wrangler` fixado como dependência de desenvolvimento e scripts `npm run dev`, `npm run deploy`, `npm run backup`. | Deploy previsível; comandos padronizados. | Baixo | Nenhum |
| 7 | A cópia offline (`kit-api-v1`) mantém os dados no aparelho sem proteção extra. | Aceitar o risco (os dados não têm informação de clientes, segundo o que você definiu) ou oferecer opção "não guardar offline". Manter bloqueio de tela no celular. | Clareza sobre onde os dados ficam. | Baixo | Nenhum |
| 8 | Contador de "uso" soma ao abrir artigo e ao copiar comando; "Mais usados" mistura leitura com cópia. | Decidir a regra (ex.: só cópias) ou separar em `copias` e `leituras`. | Ordenação "Mais usados" mais confiável. | Baixo | Nenhum |
| 9 | `itens.categoria` guarda o nome em vez do ID; a contagem de itens por categoria usa subconsulta com `COLLATE NOCASE`, que pode não usar o índice. | Para o volume atual, nada. Se passar de alguns milhares de itens: guardar `categoria_id` e usar `GROUP BY`. | Escalabilidade futura. | Médio | Nenhum |
| 10 | Importação grande em produção nunca foi testada; o plano Free tem limites por invocação (CPU de 10 ms, número de consultas ao D1). Não está claro como um `batch` grande é contado. | Testar importando o JSON de 97 itens (se ainda não foi feito) e um arquivo maior; se falhar, dividir a importação em lotes no frontend. | Evitar falha no momento de restaurar um backup. | Baixo (teste) | Nenhum |

### As três primeiras que eu faria

1. **#1: verificar o Access e validar o token na API.** É o único item em que uma falha significa seus dados abertos para a internet, e hoje ninguém confirmou que está certo. O teste custa 5 minutos.
2. **#2 + #3: limpar `public/.wrangler` e colocar o projeto no Git.** Juntas levam menos de uma hora, removem um arquivo que não deveria estar publicado e dão histórico a tudo o que vier depois.
3. **#4 + #5: migrações e backup agendado.** O maior risco operacional deste projeto é perder dados por um comando errado ou uma exclusão. Isso fecha o risco sem custo.

---

## 7. Pendências e como resolver

| Pendência | Como resolver |
|---|---|
| Access protege produção **e** pré-visualizações? | Janela anônima em `/api/itens` no domínio de produção e na URL `<hash>.kit-do-tecnico.pages.dev` do último deploy. Ambas devem pedir login. |
| Policy do Access restrita ao seu e-mail? | Zero Trust → Access → Applications → Kit do Técnico → Policies. |
| `public/.wrangler` foi publicado? | Logado, abrir `https://kit-do-tecnico.pages.dev/.wrangler/cache/wrangler-account.json`. Se abrir, remover a pasta e publicar de novo. |
| Plano da conta (Workers Free/Paid) e cobranças | dash.cloudflare.com → Manage Account → Billing; Workers & Pages → Plans. |
| Binding `DB` em produção aponta para o banco certo | Workers & Pages → kit-do-tecnico → Settings → Bindings. |
| Os 97 itens foram importados? | `npx wrangler d1 execute kit-do-tecnico --remote --command "SELECT tipo, COUNT(*) FROM itens GROUP BY tipo"` |
| Time Travel funciona para você | `npx wrangler d1 time-travel info kit-do-tecnico` (só consulta, não altera nada). |
| PWA instala e funciona offline em aparelho real | Checklist do `README.md`, seção 8, "Instalação e offline". |
| Região do banco D1 | Painel D1 → kit-do-tecnico → Overview. |

---

## Fontes (consultadas em 16/11/2026, preços em USD)

- Cloudflare D1 — Pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare D1 — Limits (Time Travel 7/30 dias, 500 MB por banco no Free): https://developers.cloudflare.com/d1/platform/limits
- Cloudflare D1 — FAQ (o que acontece ao exceder o limite no Free): https://developers.cloudflare.com/d1/reference/faq
- Pages Functions — Pricing: https://developers.cloudflare.com/pages/functions/pricing/
- Workers — Pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Pages — Limits: https://developers.cloudflare.com/pages/platform/limits
- Cloudflare Access — página do produto e preços: https://www.cloudflare.com/en-au/products/cloudflare-access
- Lista de arquivos ignorados pelo `wrangler pages` (artigo de terceiro, código de 2022): https://4xf.pages.dev/files-ignored-by-wrangler-pages-cli
