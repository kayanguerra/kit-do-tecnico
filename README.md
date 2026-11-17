# Kit do Técnico

Biblioteca pessoal de comandos, atalhos e base de conhecimento para atendimentos.
Site estático no **Cloudflare Pages**, API em **Pages Functions** e dados no **Cloudflare D1**.

```
kit-do-tecnico/
├── wrangler.toml          configuração do projeto e vínculo com o D1
├── migrations/            estrutura do banco, em ordem (0001, 0002…)
├── scripts/backup.ps1     backup do D1 de produção em .sql
├── seed.sql               5 exemplos iniciais
├── functions/             API (/api/...)
└── public/                site (HTML, CSS, JS, PWA)
```

---

## 1. Antes de começar

Você precisa de:

- Uma conta gratuita na Cloudflare: https://dash.cloudflare.com/sign-up
- **Node.js** versão LTS instalado no computador: https://nodejs.org (instalação padrão, "Next" em tudo)

Para conferir se o Node instalou, abra o **PowerShell** e rode:

```powershell
node -v
```

Deve aparecer algo como `v22.x.x`.

---

## 2. Publicar (uma vez só)

Descompacte o zip numa pasta, por exemplo `C:\kit-do-tecnico`. Abra o PowerShell **dentro dessa pasta**:

```powershell
cd C:\kit-do-tecnico
```

### 2.1 Entrar na Cloudflare pelo terminal

```powershell
npx wrangler login
```

Vai abrir o navegador. Clique em **Allow**. Se perguntar se quer instalar o `wrangler`, responda `y`.

### 2.2 Criar o banco D1

```powershell
npx wrangler d1 create kit-do-tecnico
```

Na resposta aparece um `database_id` (um código longo com hífens). **Copie esse código** e cole no
`wrangler.toml`, no lugar de `00000000-0000-0000-0000-000000000000`. Salve o arquivo.

### 2.3 Criar as tabelas e os exemplos

```powershell
npx wrangler d1 migrations apply kit-do-tecnico --remote
npx wrangler d1 execute kit-do-tecnico --remote --file=./seed.sql
```

Se perguntar se quer continuar, responda `y`.

> O `seed.sql` é só para banco novo e vazio. As migrações podem ser rodadas sempre: o wrangler aplica
> apenas as que ainda não foram aplicadas. O arquivo `schema-INSTALACAO-INICIAL-APAGA-TUDO.sql` é
> histórico e **apaga todos os dados**: não use.

### 2.4 Publicar o site

```powershell
npx wrangler pages deploy
```

- Se perguntar se quer criar um projeto novo, escolha **Create a new project**, nome `kit-do-tecnico`,
  e branch de produção `main`.
- No final aparece o endereço, algo como `https://kit-do-tecnico.pages.dev`.
  (Se o nome já existir na Cloudflare, o endereço pode ganhar um sufixo. Use o que aparecer.)

Abra o endereço. Você deve ver os 5 exemplos.

> Se aparecer "Banco de dados não vinculado", o `database_id` do `wrangler.toml` está errado ou o
> arquivo não foi salvo antes do deploy. Corrija e rode `npx wrangler pages deploy` de novo.

---

## 3. Proteger com Cloudflare Access (obrigatório)

**Sem isso, qualquer pessoa com o link pode ver, alterar e apagar seus dados.** A API não tem senha
própria; quem protege tudo é o Access. Ele é gratuito para poucos usuários.

1. No painel da Cloudflare, abra **Zero Trust** (na primeira vez, ele pede para escolher um nome de
   equipe e o plano **Free**; pode pedir cartão para validar, mas o plano Free não cobra).
2. Ative o login por código no e-mail: **Settings → Authentication → Login methods → Add new →
   One-time PIN**. (Em algumas versões do painel esse menu fica em **Integrations → Identity providers**.)
3. Vá em **Access → Applications → Add an application → Self-hosted**.
4. Nome: `Kit do Técnico`. Em **Application domain / Destinations**, adicione **dois** destinos:
   - Subdomínio vazio, domínio `kit-do-tecnico.pages.dev`
   - Subdomínio `*`, domínio `kit-do-tecnico.pages.dev` (protege também os endereços de pré-visualização,
     tipo `a1b2c3d4.kit-do-tecnico.pages.dev`, que a Cloudflare cria a cada deploy)
5. Em **Session duration**, escolha algo como **1 month** (para não pedir código toda hora no celular).
6. Crie uma **Policy**: Action **Allow**, regra **Include → Emails → o seu e-mail**.
7. Em login methods da aplicação, deixe marcado **One-time PIN**. Salve.

**Teste:** abra o site numa janela anônima. Deve aparecer a tela da Cloudflare pedindo e-mail.
Digite seu e-mail, receba o código, entre. Depois tente com outro e-mail: o acesso deve ser negado.

**Teste da API:** numa janela anônima (sem login), abra `https://kit-do-tecnico.pages.dev/api/itens`.
Deve aparecer a tela de login, **não** a lista em JSON. Se aparecer o JSON, o Access não está cobrindo
o domínio: revise o passo 4.

Os nomes dos menus da Cloudflare mudam com frequência. Se algum não bater, a referência é:
https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/

---

## 4. Instalar no celular

- **Android (Chrome):** abra o site, faça login, menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").
- **iPhone (Safari):** abra o site, faça login, botão Compartilhar → **Adicionar à Tela de Início**.

Abra o app instalado **uma vez com internet** para ele guardar os dados. Depois disso ele abre sem internet,
em modo somente leitura.

---

## 5. Atualizar o site depois

1. Se mudou algo em `public/` (HTML, CSS, JS), abra `public/service-worker.js` e aumente a versão:
   `kit-estaticos-v1` → `kit-estaticos-v2`. **Sem isso o celular continua mostrando a versão antiga.**
2. Rode `npx wrangler pages deploy`.
3. No celular, feche e abra o app duas vezes (a primeira baixa a versão nova, a segunda usa).

Para mudar o banco (novas colunas etc.):

```powershell
npx wrangler d1 migrations create kit-do-tecnico descricao_da_mudanca   # cria migrations/000N_...sql
# escreva o ALTER TABLE no arquivo criado
npx wrangler d1 migrations apply kit-do-tecnico --local                 # testa no banco local
powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1          # backup antes de mexer em produção
npx wrangler d1 migrations apply kit-do-tecnico --remote
```

Nunca edite uma migração que já foi aplicada; crie uma nova.

---

## 6. Backup

Menu ☰ → **Exportar backup** gera um arquivo `.json`. Faça isso de vez em quando e guarde fora do
celular (OneDrive, e-mail para você mesmo).

Menu ☰ → **Importar backup** mostra quantos itens serão criados e quantos substituídos antes de aplicar.
Itens que não estão no arquivo não são apagados.

**Backup do banco inteiro (recomendado, semanal):**

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1
```

Salva em `OneDrive\Kayan\Backups-Kit-do-Tecnico` (ou em Documentos, sem OneDrive), mantém os 12 mais recentes
de cada tipo e registra cada execução em `backup.log` na mesma pasta:

- `kit-do-tecnico-AAAA-MM-DD_HHMM.json`: sempre. Mesmo formato do Exportar backup do site; restaura
  pelo site em Menu ☰ → Importar backup.
- `kit-do-tecnico-AAAA-MM-DD_HHMM.sql`: só quando a rede permite o download do `wrangler d1 export`
  (algumas redes corporativas bloqueiam). Restaura um banco **vazio** com
  `npx wrangler d1 execute kit-do-tecnico --remote --file=ARQUIVO.sql`.
Para o backup rodar sozinho toda segunda às 9h (só com você logado no Windows), rode uma vez no PowerShell:

```powershell
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\Projetos\kit-do-tecnico-final\scripts\backup.ps1"' -WorkingDirectory 'C:\Projetos\kit-do-tecnico-final'
$gatilho = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9am
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable
Register-ScheduledTask -TaskName 'Kit do Tecnico - Backup D1' -Action $acao -Trigger $gatilho -Settings $config
```

Confira o `backup.log` uma vez por mês: se o login do wrangler vencer, o backup falha.

Para voltar o banco de produção a um momento dos últimos 7 dias, use o Time Travel do D1:
`npx wrangler d1 time-travel info kit-do-tecnico`.

---

## 7. Formato da solução nos artigos

| Você escreve                       | Aparece como                         |
|------------------------------------|--------------------------------------|
| `1. Faça isso`                     | passo numerado                       |
| `- item`                           | lista com marcador                   |
| uma linha só com ```` ``` ````, o código, e outra linha ```` ``` ```` | bloco de código com botão Copiar |
| `https://...`                      | link clicável                        |

Atalhos são reconhecidos sozinhos quando o conteúdo tem o formato `Tecla + Tecla`
(ex.: `Ctrl + Shift + T`, `Win + Shift + S`) e são exibidos com as teclas destacadas.

---

## 8. Lista de verificação depois do deploy

Marque cada item. Se algum falhar, anote o que apareceu na tela.

### No computador

- [ ] Janela anônima pede login do Cloudflare Access antes de mostrar o site.
- [ ] Janela anônima em `/api/itens` também pede login (não mostra o JSON).
- [ ] Login com seu e-mail funciona; outro e-mail é recusado.
- [ ] A página mostra os 5 exemplos.

### No celular (com internet)

- [ ] **Cadastrar:** botão **+ Novo item** → título `Teste de ping`, categoria Redes, conteúdo `ping 8.8.8.8 -t`, tag `rede` → **Salvar**. Aparece "Salvo".
- [ ] **Validação:** tente salvar um item vazio. Aparecem as mensagens nos campos obrigatórios.
- [ ] **Alterar o título:** abra o item → **Editar** → título `Ping contínuo` → **Salvar**.
- [ ] **Buscar:** digite `ping cont` na busca. O item aparece.
- [ ] **Buscar por tag:** digite `impressora`. Aparece "Reiniciar o spooler de impressão".
- [ ] **Copiar:** abra o item → **Copiar**. O botão mostra **Copiado!** e (no Android) o celular vibra de leve.
- [ ] **Colar:** cole no WhatsApp ou num bloco de notas. O texto é exatamente o comando.
- [ ] **Atalho:** abra "Reabrir a última aba fechada". As teclas aparecem destacadas.
- [ ] **Artigo:** abra "Impressora não imprime". Passos numerados, bloco de código com Copiar, link e o comando relacionado clicável.
- [ ] **Comando longo:** no bloco de código do artigo, a linha comprida rola para o lado sem quebrar a página; o botão **Quebrar** quebra as linhas.
- [ ] **Persistência:** recarregue a página (ou feche e abra). O item `Ping contínuo` continua lá.
- [ ] **Favorito:** toque na estrela de um item. Ele aparece no chip **Favoritos**.
- [ ] **Categoria:** Menu ☰ → Gerenciar categorias → crie `Active Directory`, renomeie para `AD`.
- [ ] **Excluir:** exclua `Ping contínuo`. Pede confirmação e some da lista.
- [ ] **Voltar:** com um item aberto, o botão Voltar do Android (ou o gesto do iPhone) fecha o item, não sai do site.
- [ ] **Teclado:** ao tocar na busca ou num campo, o iPhone **não** dá zoom.
- [ ] **Áreas seguras:** no iPhone com notch, nada fica escondido atrás do relógio ou da barra inferior.

### Instalação e offline

- [ ] Instale na tela inicial (seção 4). O ícone aparece e o app abre sem a barra do navegador.
- [ ] Com o app aberto e internet ligada, espere carregar a lista.
- [ ] Ative o **modo avião** e feche o app por completo.
- [ ] Abra o app de novo. Ele abre, mostra os itens e o aviso **"Sem conexão. Modo somente leitura…"**.
- [ ] Offline, a busca e o **Copiar** funcionam; o botão **+ Novo item** e o **Editar** somem.
- [ ] Desligue o modo avião. O aviso some sozinho e os botões voltam.

### Backup

- [ ] Menu ☰ → **Exportar backup**. O arquivo `.json` é baixado.
- [ ] Menu ☰ → **Importar backup** com esse mesmo arquivo. A prévia mostra "0 criados" e "N substituídos". Cancele.

---

## 9. O que foi e o que não foi verificado

**Testado localmente** (no `wrangler pages dev`, com D1 local e Chrome headless simulando celular de 360 px e desktop):
todas as rotas da API, cadastro, edição, busca com acento, filtros, copiar com área de transferência,
contador de uso, artigo formatado, vínculos, categorias, importação/exportação, bloqueio de HTML nos dados,
modo offline com service worker, atalhos `/`, `Ctrl` + `K` e `Esc`.

**Não testado** (só dá para verificar depois do deploy, no seu aparelho):

- O D1 e as Functions **na Cloudflare de verdade** (o local simula, mas não é idêntico).
- O **Cloudflare Access** em qualquer parte: login, expiração da sessão e o efeito dele sobre o app instalado.
  Quando a sessão expira, o app deve mostrar "Sua sessão expirou. Recarregue a página…"; recarregar leva ao login.
- **iPhone/Safari e Android reais:** vibração, instalação na tela inicial, comportamento do PWA no iOS,
  cópia com o fallback `execCommand`, áreas seguras.
- O manifesto foi marcado com `crossorigin="use-credentials"` para funcionar atrás do Access; se a opção
  **Instalar app** não aparecer no Android, esse é o primeiro ponto a investigar.
- Limite de itens por importação no D1 de produção (centenas de itens devem funcionar; milhares, não confirmado).

---

## 10. Problemas comuns

| Sintoma                                   | Causa provável / o que fazer |
|-------------------------------------------|------------------------------|
| "Banco de dados não vinculado"            | `database_id` errado no `wrangler.toml`. Corrija e faça deploy de novo. |
| Lista vazia, sem erro                     | O `seed.sql` não foi aplicado com `--remote`. Rode o passo 2.3 (só o seed). |
| "Sua sessão expirou"                      | O login do Access venceu. Recarregue a página e entre de novo. |
| Celular mostra versão antiga              | Faltou aumentar a versão no `service-worker.js` (seção 5). |
| Não chega o código por e-mail             | One-time PIN não ativado (passo 3.2) ou e-mail na caixa de spam. |
| `npx` não é reconhecido                   | Node.js não instalado ou PowerShell aberto antes da instalação. Feche e abra de novo. |
