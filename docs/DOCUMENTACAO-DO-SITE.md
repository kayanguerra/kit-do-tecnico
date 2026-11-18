# Kit do Técnico — Documentação técnica e operacional

> Gerada em 16/11/2026 e **atualizada em 18/11/2026** a partir do código em `C:\Projetos\kit-do-tecnico-final` (repositório privado no GitHub, branch `main`).
> Nenhum segredo, token ou valor de configuração foi copiado para este documento (o `database_id` do D1 foi omitido de propósito).

## Como ler as marcações

| Marcação | Significado |
|---|---|
| **[Código]** | Confirmado lendo os arquivos do projeto. |
| **[Testado]** | Conferido em 17 e 18/11/2026 com testes feitos por você no ambiente publicado (prints enviados). |
| **[Informado]** | Você me informou em conversas anteriores, mas eu **não** consegui verificar no ambiente publicado. |
| **[Pendente]** | Depende de conferência no painel da Cloudflare ou de um teste. A tabela de pendências (seção 7) diz como resolver. |

**Limite desta análise:** não consigo abrir `kit-do-tecnico.pages.dev` daqui (o acesso de rede da minha sessão bloqueia o domínio). O que diz respeito a produção foi conferido pelos testes que você fez em 17 e 18/11/2026 e está marcado como [Testado]; o resto continua [Informado] ou [Pendente].

---

## Resumo em 2 minutos

- **O que é:** uma biblioteca pessoal de comandos (PowerShell, CMD, Win+R), atalhos de teclado, links e artigos de solução de problemas, feita para consultar e copiar pelo celular durante atendimentos. Funciona como app instalável (PWA) e abre offline em modo somente leitura.
- **Como é feito:** HTML, CSS e JavaScript puros (sem framework) na pasta `public/`; uma API pequena em **Cloudflare Pages Functions** na pasta `functions/`; dados no **Cloudflare D1** (um banco SQLite gerenciado pela Cloudflare). Não há `package.json`, build nem dependências de terceiros no navegador.
- **Onde ficam os dados:** no D1, na sua conta Cloudflare. No celular ficam apenas uma cópia para uso offline (cache do service worker), a preferência de tema e a data da última sincronização. Limpar o navegador não apaga nada do banco; publicar uma nova versão do site também não.
- **Segurança:** três camadas. (1) O **Cloudflare Access** fica na frente do site e exige login por código no e-mail; cobre `kit-do-tecnico.pages.dev` e `*.kit-do-tecnico.pages.dev` e só aceita os e-mails da policy. (2) A **API confere o token assinado do Access** em toda requisição e responde 403 se ele faltar ou não conferir. (3) **Permissão de edição:** só os e-mails da variável secreta `EDITORES` gravam; os demais só leem. Cookie do login com **HTTP Only**. **[Testado]**
- **Quem acessa hoje [Testado em 18/11/2026]:** três e-mails no Access, dois deles editores. A lista não fica neste documento de propósito (seria uma lista de alvos): veja a policy do Access e a `EDITORES` no painel. Proteja essas caixas de e-mail com MFA, porque quem as controla entra no site.
- **Custo:** com o uso de uma pessoa, tudo cabe nos planos gratuitos (Workers Free, D1 Free, Zero Trust Free, subdomínio `pages.dev`). No plano gratuito, ao estourar um limite o serviço **para** até o dia seguinte em vez de cobrar. A conta está no **Zero Trust Free** [Testado]; o plano do Workers ainda precisa ser conferido no painel.
- **Visual:** segue o **Kayan Design System** (fundo preto, verde neon como única cor de destaque, Space Grotesk, Inter e JetBrains Mono servidas pelo próprio site), com temas escuro e claro.
- **O que foi resolvido em 17/11/2026:**
  1. Access conferido em produção e nas pré-visualizações; outro e-mail não recebe código. **[Testado]**
  2. `public/.wrangler` (identificação da conta) removido do site; o endereço agora cai na página inicial. **[Testado]**
  3. Projeto no Git, com `.gitignore`, e num repositório **privado** no GitHub.
  4. `schema.sql` destrutivo trocado por **migrações** (`migrations/`); a `0001` foi aplicada em produção.
  5. **Script de backup** (`scripts/backup.ps1`) gravando no OneDrive, pronto para rodar toda semana pelo Agendador de Tarefas.
  6. API valida o token do Access; cookie do login com HTTP Only.
  7. Visual novo publicado.
- **O que mudou em 18/11/2026:**
  1. Novo tipo **Script** (comando de várias linhas que se baixa como `.ps1`, `.bat` ou `.sh`), com a migração `0002`.
  2. **Permissões:** variável `EDITORES` e rota `/api/eu`; quem não é editor vê o site sem os botões de gravação.
  3. **Conta no menu:** e-mail logado, selo Editor/Somente leitura e botão **Sair** (que também apaga a cópia offline do aparelho).
  4. Filtros de categoria recolhidos com contagem, botão Redefinir, menu do celular reorganizado e botão voltar nos comandos relacionados.
  5. Correções: "nullnull" em itens com campos vazios e a quebra da tela inteira causada por uma função duplicada.
- **O que ainda vale fazer:** fixar a versão do wrangler (`package.json`), testar o Time Travel uma vez, olhar o `backup.log` todo mês, confirmar a tarefa agendada e a duração da sessão, e decidir sobre a lixeira. Detalhes nas seções 6 e 7.

> **⚠️ Regra de publicação — sempre, sem exceção, mesmo para mudança de uma linha:**
> 1. Branch separado: `git checkout -b nome-da-mudanca`
> 2. Testar na pré-visualização: `npx wrangler pages deploy --branch teste` e abrir `https://teste.kit-do-tecnico.pages.dev`
> 3. Só então produção: `git checkout main`, `git merge nome-da-mudanca`, `git push`, `npx wrangler pages deploy --branch main`
>
> Em 18/11/2026 uma correção pequena publicada direto em produção quebrou a tela inteira. Detalhes em "Lições aprendidas", seção 5.

---

## 1. Visão geral do site

O Kit do Técnico é uma aplicação de página única (SPA): o navegador carrega um único `index.html` e o JavaScript monta as telas (lista, detalhe, formulário, categorias, importação) sem recarregar a página. Os dados vêm de uma API REST em `/api/...` que roda na própria Cloudflare.

**O que o usuário consegue fazer:**

- Buscar por título, conteúdo, tags e categoria, com tolerância a acentos.
- Filtrar por tipo (comando, script, artigo, favoritos), categoria e "onde rodar" (PowerShell, CMD, Win+R, atalho).
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
| Hospedagem | Cloudflare **Pages** | Hospeda os arquivos estáticos e as Functions. Publicação por **Direct Upload** (envio direto pelo `wrangler`). O código fica no Git/GitHub, mas o GitHub **não** publica sozinho. |
| Proteção | Cloudflare **Access** (Zero Trust) + validação do token na API | O Access fica na frente do site e exige login (código enviado por e-mail). A API confere o **JWT** (token assinado) que o Access envia no cabeçalho `Cf-Access-Jwt-Assertion`. |
| Visual | **Kayan Design System** | Design system pessoal: tokens de cor, tipografia e componentes. Referência: https://claude.ai/artifact/6j9J5HrTFuTKpwcVSKY37c |
| Código | **Git** + GitHub (privado) | Histórico de todas as alterações; branch `main` = o que está em produção. |
| Ferramenta | **wrangler** (CLI da Cloudflare) | Programa de linha de comando para publicar, rodar localmente e consultar o D1. Executado via `npx`, sem instalação fixa. |

**Onde roda e para onde vão os dados:**

```
Celular / PC
  │  (1) login no Cloudflare Access (código por e-mail)          [Testado]
  ▼
kit-do-tecnico.pages.dev  ── arquivos de public/ (HTML, CSS, JS, ícones, fontes)
  │
  └── /api/*  →  Pages Functions (functions/)  →  D1 "kit-do-tecnico" (binding DB)
                (2) _middleware.js confere o token do Access antes de tudo
                (3) gravações só para e-mails em EDITORES
                                                   (fica na sua conta Cloudflare)
No aparelho: cache do service worker (cópia de /api/itens e /api/categorias)
             + localStorage (tema e data da última sincronização)
```

Não há nenhum serviço externo além da Cloudflare: as fontes (Inter, Space Grotesk e JetBrains Mono) estão no próprio projeto e a Content Security Policy em `public/_headers` bloqueia scripts, estilos e conexões de outros domínios. **[Código]**

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
| Tema | Botão de meia-lua no topo | Alterna "escuro"/"claro" (Kayan Design System), salvo em `localStorage` (`kit-tema`). `tema.js` aplica antes da página aparecer; valores antigos ("marinho", "verde") viram "escuro". | `public/js/tema.js`; `app.js` → `alternarTema()`; cores em `app.css` (`:root` e `[data-tema="claro"]`) | [Código] OK |
| Login | Tela da Cloudflare antes do site | O login é do Access (código no e-mail). Só entra quem está na policy da aplicação. Não há senha na API. | Painel Zero Trust → Access controls → Applications → Kit do Técnico | [Testado] |
| Permissão de edição | Automático | Quem está em `EDITORES` lê e grava; quem não está só lê. A API recusa `POST/PUT/PATCH/DELETE` com 403 "Seu acesso é somente leitura." (exceto `POST /api/uso/:id`, o contador). Sem a variável, **ninguém edita** (falha fechada). O site consulta `GET /api/eu` e, para leitores, esconde Novo item, Editar, Excluir, favoritos, Gerenciar categorias e Importar (classe `somente-leitor` no `<body>`). | `functions/api/_middleware.js` → `podeEditar()`; `functions/api/eu.js`; `app.js` → `definirPermissao()` | [Código] + [Testado] |
| Conta no menu e Sair | Menu ☰, rodapé | Mostra o e-mail logado e o selo **Editor** ou **Somente leitura**. **Sair** apaga a cópia offline (`kit-api-v1`) e a data de sincronização, limpa a lista e abre `/cdn-cgi/access/logout`. O tema fica. | `index.html` → `#gaveta-conta`; `app.js` → `mostrarConta()`, `sair()` | [Código] + [Testado] |
| Scripts | Tipo **Script** no formulário e no filtro | Comando com `script = 1`: várias linhas, botão **Baixar** com extensão pela regra "onde rodar" (PowerShell → `.ps1`, CMD → `.bat` com quebras de linha do Windows, `#!` na 1ª linha → `.sh`, senão `.txt`). Artigos podem relacionar scripts. | `app.js` → `tipoDe()`, `extensaoScript()`, `nomeArquivo()`; `util.js` → `validarItem()`; `migrations/0002_scripts.sql` | [Código] |
| Filtros de categoria | Computador: faixa "Categorias" com botão **+N**; celular: painel de filtros | Categorias recolhidas em uma linha, com contagem de itens. **Redefinir** limpa Tipo, Onde roda e Categoria (mantém seção, busca e ordenação). No celular, atalhos de "Onde roda" também no menu. | `app.js` → `renderizarChips()`, `ajustarCategorias()`, `filtrosAtivos()` | [Código] |
| Voltar nos relacionados | Painel da direita (computador) | Ao abrir um comando a partir de "Comandos relacionados", aparece **voltar** para o item anterior. | `app.js` → `detalheLateral.anteriores` | [Código] |
| Validação do token do Access | Automático | Antes de qualquer rota `/api`, confere assinatura (chaves públicas da equipe em `/cdn-cgi/access/certs`, guardadas por 1 h), aplicação (`aud`), emissor (`iss`) e validade (`exp`/`nbf`). Sem token ou token inválido: **403**. Sem `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`: **500** (falha fechada, nunca libera). Em `localhost` a checagem é pulada. | `functions/_lib/access.js` → `validarAccess()`; `functions/api/_middleware.js`; `[vars]` no `wrangler.toml` | [Código] + [Testado] |
| Sessão expirada | Automático | Com o Access, uma sessão vencida faz a API responder com redirecionamento; o app detecta (`redirect:'manual'`) e pede para recarregar. | `app.js` → `api()` | [Código]; efeito real [Pendente] |
| Proteção contra outro site gravando | Automático | Middleware recusa `POST/PUT/PATCH/DELETE` cujo cabeçalho `Origin` seja de outro domínio (proteção básica contra CSRF). Requisições sem `Origin` (ex.: `curl`) passam. | `functions/api/_middleware.js` | [Código] OK |
| Rota inexistente | — | Qualquer `/api/...` desconhecida devolve JSON 404. | `functions/api/[[rota]].js` | [Código] OK |
| Painel administrativo | — | Não existe. A administração é feita no próprio app (categorias, backup) e no painel da Cloudflare. | — | Não implementado |

### Fluxos reais, da tela ao resultado

**Cadastrar um comando**
1. Você toca em **+ Novo item**. Se estiver offline, `exigirOnline()` bloqueia e avisa.
2. Preenche o formulário e toca em **Salvar**. O app envia `POST /api/itens` com JSON.
3. O Access confere o cookie de login (antes de chegar ao código). **[Testado]**
4. `_middleware.js` confere o token do Access, se o e-mail está em `EDITORES` (senão 403), a origem e se o binding `DB` existe.
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
- `importar/kit-importacao-completa.json`: backup pronto com 15 categorias e 97 itens (93 comandos, 4 artigos). Já importado: produção tinha **108 itens** em 17/11/2026. **[Testado]**

---

## 3. Banco de dados e armazenamento

### Respostas diretas

- **O site usa banco de dados? Qual?** Sim: **Cloudflare D1**, nome `kit-do-tecnico`, ligado ao site pelo binding `DB` em `wrangler.toml`. D1 é SQLite rodando na Cloudflare. **[Código]**
- **Onde os dados ficam na prática e quem hospeda?** Nos servidores da Cloudflare, dentro da sua conta. Não há outro servidor. A região física do banco não está no código **[Pendente]**: aparece no painel do D1.
- **Quando alguém preenche um formulário, o que é salvo e onde?** O item inteiro (título, categoria, conteúdo, tags, favorito etc.) vai para a tabela `itens` do D1; categorias para a tabela `categorias`. Contagem de uso e favorito também ficam no D1.
- **Os dados ficam disponíveis em outro dispositivo?** Sim. Qualquer aparelho que passe pelo login do Access vê os mesmos dados.
- **E se eu limpar o navegador?** Perde apenas a cópia offline, o tema escolhido e a data da última sincronização. Ao abrir de novo com internet, tudo volta do D1.
- **E se eu publicar uma nova versão?** O D1 não é afetado. O deploy só troca os arquivos de `public/` e o código de `functions/`. A estrutura do banco agora muda só por **migrações** (`migrations/`), que nunca apagam tabelas. O antigo `schema.sql` foi renomeado para `schema-INSTALACAO-INICIAL-APAGA-TUDO.sql` e **não deve ser usado**: ele apaga todas as tabelas.
- **Onde eu entro para consultar os dados?**
  - Painel: dash.cloudflare.com → **Storage & Databases → D1** → `kit-do-tecnico` → **Console** (aceita SQL). Os nomes de menu da Cloudflare mudam com frequência; se não bater, procure "D1" na busca do painel.
  - Terminal, na pasta do projeto: `npx wrangler d1 execute kit-do-tecnico --remote --command "SELECT tipo, COUNT(*) FROM itens GROUP BY tipo"`
- **Quem consegue ler, cadastrar, alterar ou excluir?**
  - Pelo site: **ler** — qualquer pessoa que passe pelo Access; **cadastrar, alterar, excluir, importar** — só quem está em `EDITORES`. Leitores também conseguem **exportar o backup inteiro** e ficam com a cópia offline no aparelho.
  - Pelo painel/terminal: qualquer pessoa com acesso à sua conta Cloudflare ou com o login do `wrangler` na sua máquina (`npx wrangler login` deixa uma credencial salva no seu perfil do Windows).

### Tabelas **[Código: `migrations/0001_esquema_inicial.sql` + `0002_scripts.sql`]**

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
| `script` | comando | `1` = Script (migração `0002`); `0` nos demais |
| `sintoma`, `causa`, `solucao`, `observacoes` | artigo | |
| `relacionados` | artigo | Texto JSON com lista de IDs de comandos |
| `tags` | todos | Texto JSON com lista de textos |
| `favorito`, `usos`, `ultimo_uso` | todos | |
| `criado_em`, `atualizado_em` | todos | ISO 8601 em UTC |

Índices: `idx_itens_categoria`, `idx_itens_tipo`.

**`d1_migrations`** (criada pelo wrangler): registra quais migrações já foram aplicadas. Não mexa nela à mão.

**Relações:** não há chave estrangeira. `itens.categoria` aponta para `categorias.nome` por texto. O código mantém a coerência: renomear categoria atualiza os itens na mesma transação; excluir categoria com itens é bloqueado. `relacionados` aponta para `itens.id` dentro de um JSON; excluir um comando ou transformá-lo em artigo remove o vínculo dos artigos.

| Conjunto de dados | Funções que usam |
|---|---|
| `itens` | Lista, busca, detalhe, formulário, favorito, contador de uso, backup |
| `categorias` | Chips de filtro, formulário (lista de categorias), gerenciar categorias, backup |

### Outros mecanismos de armazenamento

| Mecanismo | O que guarda | Onde | Consequência |
|---|---|---|---|
| D1 | Todos os dados | Cloudflare | Fonte única da verdade |
| Cache do service worker (`kit-estaticos-v15`) | HTML, CSS, JS, fontes, ícones | Navegador do aparelho | Permite abrir offline |
| Cache do service worker (`kit-api-v1`) | Última resposta de `/api/itens` e `/api/categorias` | Navegador do aparelho | Cópia de leitura offline. **Ponto de atenção:** os dados ficam salvos no aparelho, fora da proteção do Access. Se o celular for perdido desbloqueado, a biblioteca pode ser lida. |
| `localStorage` `kit-tema` | Tema escolhido | Navegador | Perde ao limpar o navegador |
| `localStorage` `kit-ultima-sincronizacao` | Data da última carga online | Navegador | Só para o aviso offline |
| Arquivo `.json` de backup | Cópia completa | Onde você salvar | Responsabilidade sua guardar |
| Backup automático | `.json` (sempre) e `.sql` (quando a rede permite) | `OneDrive - Braga IT\Kayan\Backups-Kit-do-Tecnico` | 12 mais recentes de cada tipo + `backup.log` |

### Backup e restauração hoje

1. **Backup pelo script** (`scripts/backup.ps1`). Agendado no Agendador de Tarefas do Windows, roda toda segunda às 9h, só com você logado; para conferir se a tarefa existe, procure "Kit do Tecnico - Backup D1" no Agendador:
   - **`.json` sempre:** lê o banco pela API do wrangler e grava no formato do "Exportar backup" do site. Restaura pelo site em Menu ☰ → Importar backup.
   - **`.sql` quando a rede deixa:** `wrangler d1 export`. Na rede da empresa o download do export é **bloqueado** (`fetch failed`), então só sai fora dela. É o único formato que recria o banco do zero, com a estrutura junto.
   - Mantém os 12 mais recentes de cada tipo e registra cada execução em `backup.log`. Se o login do wrangler vencer, o backup falha: confira o log uma vez por mês.
   - Rodar na mão: `powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1` (na raiz do projeto, PowerShell normal).
2. **Manual pelo app:** Exportar/Importar backup (JSON). Importar **não apaga** itens que não estão no arquivo, então não serve para "voltar no tempo" se você criou itens errados depois. **[Código]**
3. **Time Travel do D1:** recurso automático da Cloudflare que permite restaurar o banco para um momento passado. A documentação oficial informa retenção de **7 dias no plano Free** e 30 dias no Workers Paid. Comandos: `npx wrangler d1 time-travel info kit-do-tecnico` e `npx wrangler d1 time-travel restore kit-do-tecnico --timestamp=...`. Restaurar substitui o banco inteiro. **[Pendente]**: nunca testado neste projeto.
4. **Restaurar um `.sql`** só num banco **vazio**: `npx wrangler d1 execute kit-do-tecnico --remote --file=ARQUIVO.sql`.

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
| Cloudflare Access / Zero Trust | Login antes do site | [Testado] Zero Trust Free | Plano Free para até 50 usuários | Passar de 50 usuários ou contratar o plano pago (US$ 7 por usuário/mês, conforme a página de preços) | Painel Zero Trust → Settings → Account / Billing (o nome do menu pode variar) |
| Domínio | Endereço do site | Subdomínio `kit-do-tecnico.pages.dev` [Informado] | Gratuito | Só se você registrar um domínio próprio | Painel → projeto → Custom domains (nenhum domínio próprio aparece no código) |
| Fontes Inter, Space Grotesk, JetBrains Mono | Tipografia | Arquivos no projeto | Licença OFL (gratuita), em `public/fonts/LICENSE-*.txt` | Nada | — |
| GitHub | Guardar o código | Repositório privado | Gratuito | Nada no uso atual | github.com → Settings → Billing |

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
kit-do-tecnico-final/          (repositório Git; branch main = produção)
├── wrangler.toml            projeto, pasta publicada (./public), binding D1 "DB", [vars] do Access
├── .gitignore               deixa de fora .wrangler/, node_modules/, .env e backups exportados
├── migrations/
│   ├── 0001_esquema_inicial.sql   estrutura do banco (sem DROP)
│   └── 0002_scripts.sql           coluna script (tipo Script)
├── scripts/
│   └── backup.ps1           backup do D1 de produção (.json e .sql) no OneDrive
├── schema-INSTALACAO-INICIAL-APAGA-TUDO.sql   histórico — NÃO USE (apaga tudo)
├── seed.sql                 8 categorias e 5 exemplos (só para banco novo e vazio)
├── README.md                guia de instalação, Access, migrações, backup e checklist de testes
├── importar/                backup JSON com 97 itens para importar pelo app
├── functions/
│   ├── _lib/util.js         validação, conversão, SQL compartilhado (não é rota)
│   ├── _lib/access.js       validação do token do Cloudflare Access (não é rota)
│   └── api/
│       ├── _middleware.js   roda antes de toda rota /api: token do Access, permissão (EDITORES), origem, binding, erros
│       ├── eu.js            GET /api/eu: e-mail logado e se pode editar
│       ├── [[rota]].js      404 em JSON para rotas inexistentes
│       ├── backup.js        GET/POST /api/backup
│       ├── uso/[id].js      POST /api/uso/:id
│       ├── itens/index.js   GET/POST /api/itens
│       ├── itens/[id].js    GET/PUT/PATCH/DELETE /api/itens/:id
│       ├── categorias/index.js   GET/POST /api/categorias
│       └── categorias/[id].js    PUT/DELETE /api/categorias/:id
├── public/                  TUDO aqui é publicado
│   ├── index.html, manifest.webmanifest, service-worker.js, _headers
│   ├── css/app.css          tokens e componentes do Kayan Design System
│   ├── js/app.js, js/tema.js
│   ├── fonts/               Inter, Space Grotesk, JetBrains Mono (+ licenças OFL)
│   └── icons/               ícone ">_" do app
├── .wrangler/               cache e banco local do wrangler (ignorado pelo Git, não publicar)
└── docs/DOCUMENTACAO-DO-SITE.md   este documento
```

Nos nomes de arquivo, `[id]` significa "parte variável da URL" (`/api/itens/abc` → `params.id = "abc"`) e `[[rota]]` captura qualquer caminho restante.

### Variáveis de ambiente e configuração

- **`[vars]` no `wrangler.toml`** (não são segredos):
  - `ACCESS_TEAM_DOMAIN = "https://muddy-wildflower-6d6c.cloudflareaccess.com"` — domínio da sua equipe no Zero Trust.
  - `ACCESS_AUD` — o "Application Audience (AUD) Tag" da aplicação Kit do Técnico. **Se a aplicação do Access for recriada, o AUD muda** e a API passa a responder 403 até você atualizar este valor e publicar de novo. Para descobrir o AUD: logado no site, F12 → Console → leia o campo `aud` do cookie `CF_Authorization` (só funciona com HTTP Only desligado), ou procure no painel da aplicação.
- **Secret `EDITORES`** (não fica no código): e-mails que podem gravar, separados por vírgula, **sem aspas e sem espaço**. Existe **separada** em produção e em pré-visualização. Formato: `email1@dominio.com,email2@dominio.com`. O valor atual não fica neste documento; o painel não mostra (é secreto), então ao mudar digite a lista completa. Como mudar: seção "Gerenciar logins e permissões".
- **Binding:** `DB` → banco D1 `kit-do-tecnico`. Se o binding faltar, a API responde "Banco de dados não vinculado".
- **Segredos:** nenhum no projeto. A credencial do `wrangler login` fica no seu perfil do Windows, fora da pasta.
- **`compatibility_date = "2026-11-01"`:** fixa o comportamento do runtime da Cloudflare naquela data, para atualizações da plataforma não quebrarem o código.

### Rodar localmente

Pré-requisito: Node.js LTS (`node -v`). No PowerShell, **na raiz do projeto** (o prompt tem que mostrar `PS C:\Projetos\kit-do-tecnico-final>`):

```powershell
# 1ª vez: criar o banco LOCAL (fica em .wrangler/state, separado da produção)
npx wrangler d1 migrations apply kit-do-tecnico --local
npx wrangler d1 execute kit-do-tecnico --local --file=./seed.sql

# Subir o site com API e D1 locais
npx wrangler pages dev
```

Abra o endereço mostrado (normalmente `http://localhost:8788`). Localmente não há Access, e a validação do token é pulada só em `localhost`. O banco local é outro, diferente do de produção.

### Fazer uma alteração

1. **Sempre, em qualquer mudança:** crie um branch (`git checkout -b nome-da-mudanca`). Antes de criar uma função nova, procure o nome no código (`Select-String -Path public\js\app.js -Pattern 'function nome'`).
2. **Visual/comportamento:** edite `public/js/app.js`, `public/css/app.css` ou `public/index.html`. Cores e fontes ficam nos tokens do topo do `app.css`; siga o Kayan Design System.
3. **API:** edite o arquivo da rota em `functions/api/...`. Regras de validação e limites ficam em `functions/_lib/util.js` (`LIMITES`, `validarItem`).
4. **Banco (nova coluna etc.):**
   ```powershell
   npx wrangler d1 migrations create kit-do-tecnico descricao_da_mudanca
   # escreva o ALTER TABLE no arquivo criado em migrations/
   npx wrangler d1 migrations apply kit-do-tecnico --local
   powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1
   npx wrangler d1 migrations apply kit-do-tecnico --remote
   ```
   Nunca edite uma migração já aplicada; crie uma nova.
5. Teste com `npx wrangler pages dev`.
6. Se mudou algo em `public/`, aumente a versão em `public/service-worker.js` (hoje `kit-estaticos-v15`).
7. Salve no Git: `git add -A`, `git commit -m "o que mudou"`, `git push`.

### Publicar

**Regra fixa:** nada vai direto para produção. Primeiro numa pré-visualização (produção não muda):

```powershell
npx wrangler pages deploy --branch teste
```

Abra `https://teste.kit-do-tecnico.pages.dev` (pede login do Access) e confira. Se estiver bom, publique em produção a partir do `main`:

```powershell
git checkout main
git merge nome-da-mudanca
git push
npx wrangler pages deploy --branch main
```

Use sempre `--branch main` para produção: sem ele, o wrangler publica no branch do Git em que você está, e se for outro branch o deploy vai para uma pré-visualização sem você perceber.

Usa `pages_build_output_dir = ./public` e envia também a pasta `functions/`. Cada deploy cria uma URL de pré-visualização única (`<hash>.kit-do-tecnico.pages.dev`), coberta pelo Access. **[Testado]**

**Voltar para a versão anterior:** painel → Workers & Pages → `kit-do-tecnico` → **Deployments** → deploy anterior → **Rollback**. Isso volta o código, **não** o banco. Pelo Git: `git revert <commit>` e publicar de novo.

No celular com o app instalado, feche e abra o app duas vezes depois de um deploy de visual.

### Onde ver erros

| O quê | Onde |
|---|---|
| Erros da tela | DevTools do navegador (F12 → Console e Network). No Android, `chrome://inspect` com o celular no USB. |
| Erros da API | `_middleware.js` grava `console.error('Erro na API: ...')` e `console.error('Access: ...')` (falha ao validar o token ou obter as chaves). Para ver ao vivo: `npx wrangler pages deployment tail --project-name kit-do-tecnico` ou painel → projeto → Deployments → deploy → **Functions** → Real-time logs. |
| Banco | Painel D1 → `kit-do-tecnico` → Metrics (consultas, linhas lidas/gravadas) e Console. |
| Access | Painel Zero Trust → Logs → Access (tentativas de login permitidas e negadas). No plano Free a retenção de logs é curta; confira no painel. |
| Configuração do deploy | Painel → projeto → Settings → **Bindings** (confirmar `DB` → `kit-do-tecnico`) e Settings → Functions → compatibility date. |
| Site responde "Acesso negado" (403) logado | O token do Access não confere: aplicação recriada (AUD novo) ou domínio da equipe mudou. Atualize `[vars]` no `wrangler.toml` e publique. |
| Backup | `backup.log` na pasta do OneDrive. |
| Todo mundo aparece como "Somente leitura" | `EDITORES` ausente, com aspas/espaço no valor, criada só em outro ambiente (production × preview) ou sem deploy depois da mudança. Abra `/api/eu` no mesmo endereço para ver o e-mail e o `podeEditar`. |
| Tela com "[object HTMLDivElement]" ou "null" | Erro de JavaScript na montagem da tela (foi o caso de 18/11). Volte a versão pelo Rollback e corrija em branch. Depois do deploy, Ctrl+Shift+R. |

### Conferir a configuração do Access (passo a passo)

Situação em 17/11/2026 **[Testado]**: aplicação self-hosted "Kit do Técnico" com os destinos `kit-do-tecnico.pages.dev` e `*.kit-do-tecnico.pages.dev`; policy com três e-mails (ver Resumo); login por código no e-mail; cookie **HTTP Only** ligado; Binding Cookie e Enforce cookie path desligados; Eager redirect cookie ligado. Duração da sessão: estava em 730 h (30 dias); confira se ficou em 24 h ou 1 semana.

1. Painel Cloudflare One → **Access controls → Applications → Kit do Técnico → Configure**.
2. **Destinations:** os dois destinos acima. Não apague nenhum: apagar um deixa o site ou as pré-visualizações abertos.
3. **Policies:** Action **Allow**, Include → **Emails** → só os e-mails autorizados. Nada de "Everyone" ou domínio de e-mail genérico.
4. **Additional settings → Cookie settings:** HTTP Only ligado.
5. **Details → Session Duration:** 24 h ou 1 semana.
6. Teste depois de qualquer mudança: janela anônima em `https://kit-do-tecnico.pages.dev/api/itens` e na URL de pré-visualização do último deploy. As duas têm que mostrar a tela de login, **não** JSON. Tente também com outro e-mail seu: o código não pode chegar.
7. Teste do HTTP Only: logado, F12 → Console → `document.cookie`. O `CF_Authorization` não pode aparecer.

### Gerenciar logins e permissões

Duas camadas, cada uma num lugar:

| Pergunta | Onde se decide | Lugar no painel |
|---|---|---|
| **Quem entra** no site | Policy do Cloudflare Access (Include → Emails) | Zero Trust → Access controls → Applications → Kit do Técnico → Access policies |
| **Quem edita** | Secret `EDITORES` do Pages | dash.cloudflare.com → Compute → Workers & Pages → kit-do-tecnico → Settings → Variables and secrets |

| Situação | O que fazer |
|---|---|
| Colega só consulta | Adicionar o e-mail na policy do Access |
| Colega também edita | Adicionar no Access **e** em `EDITORES` (lista completa, nos dois ambientes) e publicar |
| Tirar a edição | Tirar de `EDITORES` (nos dois ambientes) e publicar; continua lendo |
| Tirar tudo | Tirar do Access, tirar de `EDITORES` e revogar a sessão da pessoa no painel (Users) |

Mudar a `EDITORES` pelo terminal (o comando **substitui a lista inteira**; sem `--env` ele usa produção):

```powershell
cd C:\Projetos\kit-do-tecnico-final
npx wrangler pages secret put EDITORES --project-name kit-do-tecnico --env production
npx wrangler pages secret put EDITORES --project-name kit-do-tecnico --env preview
npx wrangler pages secret list --project-name kit-do-tecnico --env production
npx wrangler pages deploy --branch main
```

Conferir: `https://kit-do-tecnico.pages.dev/api/eu` → `"podeEditar": true` para editores. No site, o menu ☰ mostra o e-mail e o selo.

Sair do login: botão **Sair** no menu. Se o Access entrar sem pedir código depois, a sessão da equipe ainda está ativa: `https://muddy-wildflower-6d6c.cloudflareaccess.com/cdn-cgi/access/logout`. Para testar outro e-mail sem sair, use janela anônima.

### Lições aprendidas (18/11/2026)

| O que aconteceu | Causa | Regra daqui pra frente |
|---|---|---|
| Ninguém conseguia editar | A permissão `EDITORES` entrou num commit chamado "Menu mobile reorganizado…", sem aviso e sem a variável criada | Uma mudança por commit, mensagem dizendo o que muda; mudança de permissão ou banco vem com o passo de configuração no README |
| Todos continuavam leitores depois de criar a variável | Variável só em um ambiente / valor errado / deploy no branch errado | `EDITORES` sempre nos dois ambientes, sem aspas; deploy de produção com `--branch main` |
| Tela inteira virou "[object HTMLDivElement]" | Função nova com o mesmo nome de uma existente (`anexar`) substituiu a original; foi publicada sem teste | Fluxo branch → `--branch teste` → `--branch main`, sempre; procurar o nome no código antes de criar função |

---

## 6. Melhorias futuras (ordenadas por prioridade)

### Concluídas em 17/11/2026

| # | Item | Como ficou |
|---|---|---|
| 1 | API confiava 100% no Access | Access testado (produção, pré-visualização, outro e-mail) e token validado na API (`_lib/access.js`). Cookie HTTP Only. |
| 2 | `public/.wrangler` publicado | Pasta apagada, site republicado; o endereço cai na página inicial. |
| 3 | Sem Git | Git com `.gitignore` e repositório privado no GitHub. |
| 4 | `schema.sql` destrutivo | Migrações em `migrations/`; `0001` aplicada em produção; o arquivo antigo foi renomeado com aviso. |
| 5 | Backup manual | `scripts/backup.ps1` no OneDrive (.json sempre, .sql quando a rede deixa), para agendamento semanal. |
| — | Visual | Kayan Design System aplicado; temas escuro e claro; fontes locais. |

### Concluídas em 18/11/2026

| Item | Como ficou |
|---|---|
| Permissão por e-mail | `EDITORES` + `/api/eu`; leitores sem botões de gravação. |
| Sair de verdade | Botão Sair apaga a cópia offline e faz logout do Access. |
| Tipo Script | Migração `0002` aplicada; download como arquivo. |

### Pendentes

| # | Problema | Mudança sugerida | Benefício | Esforço | Custo |
|---|---|---|---|---|---|
| 6 | Wrangler roda via `npx` sem versão fixa: cada execução pode baixar uma versão nova. | `package.json` com `wrangler` fixado e scripts `npm run dev`, `npm run deploy`, `npm run backup`. | Deploy e backup previsíveis. | Baixo | Nenhum |
| 7 | Time Travel nunca testado; backup agendado falha em silêncio se o login do wrangler vencer. | Rodar `npx wrangler d1 time-travel info kit-do-tecnico` uma vez; olhar o `backup.log` todo mês; ter pelo menos um `.sql` gerado fora da rede da empresa. | Saber que a restauração funciona antes de precisar. | Baixo | Nenhum |
| 8 | Exclusão de item é imediata e sem lixeira. | Coluna `excluido_em` (nova migração, `0003`) e tela de lixeira, ou confiar no backup semanal. | Desfazer exclusão acidental. | Médio | Nenhum |
| 9 | A cópia offline (`kit-api-v1`) mantém os dados no aparelho sem proteção extra. | Aceitar o risco (sem dados de clientes) e manter bloqueio de tela no celular, ou opção "não guardar offline". | Clareza sobre onde os dados ficam. | Baixo | Nenhum |
| 10 | Contador de "uso" soma ao abrir artigo e ao copiar comando. | Decidir a regra (ex.: só cópias) ou separar em `copias` e `leituras`. | "Mais usados" mais confiável. | Baixo | Nenhum |
| 11 | `itens.categoria` guarda o nome em vez do ID; contagem por categoria usa subconsulta. | Nada no volume atual. Acima de alguns milhares de itens: `categoria_id` e `GROUP BY`. | Escalabilidade futura. | Médio | Nenhum |
| 12 | Importação grande em produção pouco testada (limites de CPU por invocação no Free). | Testar um arquivo maior; se falhar, importar em lotes. | Restauração sem surpresa. | Baixo | Nenhum |

---

## 7. Pendências e como resolver

| Pendência | Situação | Como resolver |
|---|---|---|
| Access protege produção **e** pré-visualizações? | **Resolvida** [Testado] | — |
| Policy do Access restrita aos e-mails autorizados? | **Resolvida** [Testado] | Conferir a lista sempre que incluir ou tirar alguém. |
| `public/.wrangler` foi publicado? | **Resolvida** [Testado] | — |
| Os 97 itens foram importados? | **Resolvida** (108 itens em produção) | — |
| `EDITORES` em produção e pré-visualização | **Resolvida** [Testado] | — |
| Migração `0002_scripts.sql` em produção | **Resolvida** (cadastro do item "Teste" funcionou) | — |
| O e-mail somente leitura precisa mesmo entrar? | Decidir | Se não precisa, tirar da policy do Access. Hoje ele lê e exporta a biblioteca inteira. |
| MFA nas contas de e-mail com acesso, na Cloudflare e no GitHub | Fazer | Quem controla um desses e-mails entra no site; quem entra na Cloudflare muda tudo sem passar pelo site. |
| Item "Teste" criado no teste de 18/11 | Limpar | Excluir pelo site. |
| Tarefa agendada do backup criada | Confirmar | Agendador de Tarefas → "Kit do Tecnico - Backup D1". Comando de criação no `README.md`, seção 6 (Backup). |
| Duração da sessão do Access abaixo de 30 dias | Aberta | Access controls → Applications → Kit do Técnico → Details → Session Duration. |
| Plano do Workers (Free/Paid) e cobranças | Aberta | dash.cloudflare.com → Manage Account → Billing; Workers & Pages → Plans. Zero Trust já confirmado como Free. |
| Binding `DB` em produção aponta para o banco certo | Implícita (o site lê e grava normalmente) | Workers & Pages → kit-do-tecnico → Settings → Bindings. |
| Time Travel funciona para você | Aberta | `npx wrangler d1 time-travel info kit-do-tecnico` (só consulta). |
| PWA instala e funciona offline em aparelho real | Aberta | Checklist do `README.md`, seção 8, "Instalação e offline". |
| Região do banco D1 | Aberta | Painel D1 → kit-do-tecnico → Overview. |

---

## Histórico de alterações (Git, branch `main`)

| Commit | Data | O que mudou |
|---|---|---|
| `dcddac4` | 17/11 | Versão inicial no Git; `public/.wrangler` removido; `.gitignore` |
| `7351121` | 17/11 | Migração `0001`; `schema.sql` renomeado com aviso; `scripts/backup.ps1` |
| `c69ab22` | 17/11 | Pasta do backup no OneDrive |
| `3306f9e` | 17/11 | API valida o token do Access |
| `8964c02` | 17/11 | Visual do Kayan Design System |
| `b476074`, `1bc8dd9` | 17/11 | Ajustes de CSS e `app.js`; documentação |
| `218a978` | 17/11 | Voltar nos comandos relacionados |
| `23a2a7a` | 17/11 | Categorias recolhidas com contagem |
| `2ef88bd` | 17/11 | Tipo Script (migração `0002`) |
| `518e51f` | 18/11 | Menu mobile, Redefinir **e permissão `EDITORES` + `/api/eu`** |
| `8cfd0e5`, `fe85d7f`, `631bd2d` | 18/11 | Conta no menu: e-mail, selo e Sair |
| `198ccf5`, `fe47369` | 18/11 | Correção do "nullnull" e da quebra por função duplicada |

Para ver tudo: `git log --oneline`.

---

## Fontes (consultadas em 16, 17 e 18/11/2026, preços em USD)

- Cloudflare D1 — Pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare D1 — Limits (Time Travel 7/30 dias, 500 MB por banco no Free): https://developers.cloudflare.com/d1/platform/limits
- Cloudflare D1 — FAQ (o que acontece ao exceder o limite no Free): https://developers.cloudflare.com/d1/reference/faq
- Pages Functions — Pricing: https://developers.cloudflare.com/pages/functions/pricing/
- Workers — Pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Pages — Limits: https://developers.cloudflare.com/pages/platform/limits
- Cloudflare Access — página do produto e preços: https://www.cloudflare.com/en-au/products/cloudflare-access
- Lista de arquivos ignorados pelo `wrangler pages` (artigo de terceiro, código de 2022): https://4xf.pages.dev/files-ignored-by-wrangler-pages-cli
- Cloudflare D1 — Migrations: https://developers.cloudflare.com/d1/reference/migrations/
- Wrangler — comandos `pages secret` (opção `--env production|preview`, padrão production): https://www.mintlify.com/cloudflare/workers-sdk/commands/pages
