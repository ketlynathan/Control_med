# Fluxo — Controle de Caixa (com backend)

Frontend estático (`index.html`) + backend em **Vercel Functions** (Node.js, pasta `api/`) + banco **Postgres**. Os dados agora ficam num banco de verdade, com login por conta e sincronização entre dispositivos — deixou de depender só do `localStorage` do navegador.

## Estrutura

```
fluxo-caixa/
├── index.html              ← frontend (tela de login + app)
├── api/
│   ├── auth/register.js    ← POST /api/auth/register
│   ├── auth/login.js       ← POST /api/auth/login
│   ├── state.js            ← GET/PUT /api/state (dados do caixa)
│   ├── extract-entry.js    ← POST /api/extract-entry ("Colar nota" com IA)
│   └── _lib/
│       ├── db.js           ← conexão com Postgres
│       └── auth.js         ← hash de senha + JWT
├── schema.sql               ← rode uma vez no seu banco
├── package.json             ← dependências (pg, bcryptjs, jsonwebtoken)
└── .env.example              ← modelo das variáveis de ambiente
```

Como funciona: cada negócio cria uma conta (e-mail + senha). O app guarda um token de sessão (JWT) no dispositivo e sincroniza automaticamente (~1s depois de qualquer alteração) o estado inteiro do caixa com a tabela `business_state` no Postgres. Se a internet cair, os dados continuam salvos localmente e tentam sincronizar na próxima alteração.

---

## Credenciais e serviços que você precisa criar

Nada disso eu posso gerar por você — são contas/segredos que só você deve ter. Aqui está exatamente o que buscar:

### 1. Uma conta Vercel
- Crie em [vercel.com/signup](https://vercel.com/signup) (pode entrar com GitHub).
- Não precisa de nenhuma "chave de API" da Vercel para este projeto — o deploy é feito importando o repositório ou via CLI (`vercel login` abre o navegador para autenticar).

### 2. Um banco Postgres — escolha um provedor
Qualquer um serve, pois o backend usa apenas uma `DATABASE_URL` padrão. Sugestões (todas têm plano gratuito):

| Provedor | Onde criar | O que copiar |
|---|---|---|
| **Neon** (recomendado, integra direto com a Vercel) | [neon.tech](https://neon.tech) → New Project | "Connection string" (formato `postgres://usuario:senha@host/banco?sslmode=require`) |
| **Vercel Postgres** (Storage → Postgres, dentro do próprio painel Vercel) | Painel do seu projeto na Vercel → aba **Storage** → Create Database | A Vercel já injeta a variável automaticamente, mas o nome pode vir como `POSTGRES_URL` — copie o valor para `DATABASE_URL` (veja nota abaixo) |
| **Supabase** | [supabase.com](https://supabase.com) → New Project | Em Project Settings → Database → "Connection string" (URI) |

Depois de criar o banco, **rode o arquivo `schema.sql`** uma vez (todo provedor acima tem um "SQL Editor" no painel — cole o conteúdo do arquivo e execute).

### 3. Variáveis de ambiente para colocar na Vercel
Vá em **Project Settings → Environment Variables** no seu projeto na Vercel e adicione:

| Nome | Valor | Onde conseguir |
|---|---|---|
| `DATABASE_URL` | a connection string do Postgres | do provedor escolhido acima |
| `JWT_SECRET` | uma string aleatória longa | gere você mesmo, ex.: rode `openssl rand -base64 48` no terminal, ou use um gerador de senhas de 40+ caracteres. **Guarde em local seguro — quem tiver essa string consegue forjar sessões de login.** |
| `ANTHROPIC_API_KEY` | sua chave da API da Anthropic (opcional, só para o botão "Colar nota") | [console.anthropic.com](https://console.anthropic.com) → Settings → API Keys — veja a seção 4 abaixo |

> Nota sobre Vercel Postgres: se você criar o banco pela aba Storage da própria Vercel, ela injeta automaticamente variáveis como `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, etc. Este backend foi escrito para ler `DATABASE_URL` (nome mais portátil, funciona com qualquer provedor). Se usar o Postgres da própria Vercel, adicione manualmente uma variável `DATABASE_URL` com o mesmo valor de `POSTGRES_URL` (não-pooling, ou `POSTGRES_URL_NON_POOLING`, se disponível).

Nenhuma outra credencial é necessária para o login e a sincronização — não há chaves de e-mail, SMS, ou serviços de terceiros nessa parte.

### 4. (Opcional, mas recomendado) Chave da API da Anthropic — para o botão "Colar nota"
Essa é a função para lançar compras rápido: você bate a foto da nota com o app de IA/OCR do seu próprio celular (Google Lens, Notas do iPhone, etc.), copia o texto que ele transcreveu, cola no botão **🧾 Colar nota** do app, e a IA preenche sozinha valor, data, categoria e forma de pagamento — você só confere e salva.

- Crie uma conta em [console.anthropic.com](https://console.anthropic.com) (é separada da sua assinatura do Claude.ai, se você tiver uma — aqui você paga por uso).
- Em **Settings → Billing**, adicione um cartão/crédito (a Anthropic dá alguns créditos de teste, mas para uso continuado é preciso configurar pagamento).
- Em **Settings → API Keys**, crie uma chave.
- Adicione essa chave como variável de ambiente `ANTHROPIC_API_KEY` na Vercel.

Sem essa chave configurada, o resto do app funciona normalmente — só o botão "Colar nota" mostra um erro dizendo que a IA não está configurada.

O modelo usado (Claude Haiku) é o mais rápido e barato da Anthropic, adequado a essa tarefa de extrair alguns campos de um texto curto — consulte [a página de preços](https://www.anthropic.com/pricing) para valores atualizados; o custo por nota colada é uma fração de centavo.

---

## Passo a passo completo do zero

1. **Crie o banco** (Neon, Supabase ou Vercel Postgres) e copie a `DATABASE_URL`.
2. **Rode `schema.sql`** no SQL Editor do provedor.
3. **Suba este projeto para um repositório Git** (GitHub, por exemplo).
4. **Importe o repositório na Vercel** em [vercel.com/new](https://vercel.com/new).
5. Antes de clicar em Deploy (ou logo depois, em Project Settings), **adicione as variáveis de ambiente** `DATABASE_URL` e `JWT_SECRET`.
6. Deploy. A Vercel detecta `index.html` como site estático e os arquivos em `api/` como funções serverless automaticamente — não precisa configurar build command nem output directory.
7. Acesse a URL gerada, clique em **Criar conta**, informe e-mail/senha, e comece a usar. Repita o login em qualquer outro dispositivo com o mesmo e-mail/senha para ver os mesmos dados.

### Testando localmente antes de publicar (opcional)
```bash
npm install
vercel dev   # roda o site + as funções da pasta api/ localmente
```
Crie um arquivo `.env` local (baseado em `.env.example`) com sua `DATABASE_URL` e `JWT_SECRET` para o `vercel dev` funcionar.

---

## Limitações importantes desta arquitetura (leia antes de confiar 100% nela)

- **Anexos (fotos/PDF de notas fiscais) e tamanho de payload.** As funções serverless da Vercel recusam corpos de requisição acima de ~4,5MB. O backend bloqueia o envio (erro 413) se o estado sincronizado passar de 4MB — o que pode acontecer rápido se houver vários anexos em base64. Os dados continuam salvos no navegador local mesmo se a sincronização falhar por esse motivo, mas eles não vão para o servidor/outros dispositivos. Para resolver de verdade, o próximo passo seria mover anexos para um storage de arquivos (ex.: Vercel Blob ou S3) e guardar só a URL no banco — posso implementar isso se os anexos forem importantes para o seu uso.
- **Sincronização "last write wins".** Se duas pessoas editarem o caixa ao mesmo tempo em dispositivos diferentes offline, o último a sincronizar sobrescreve o outro. Para uso com um único caixa por vez isso não costuma ser problema; para múltiplos caixas simultâneos ativos, o ideal seria evoluir para tabelas relacionais por lançamento (não um blob JSON único), com escrita incremental.
- **Sessão via JWT de 30 dias.** Não há ainda recuperação de senha por e-mail nem verificação de e-mail — é autenticação simples por e-mail/senha. Se isso for para uso comercial real, recomendo adicionar recuperação de senha antes de distribuir para colaboradores.
- **`JWT_SECRET` é a chave-mestra de autenticação.** Nunca a exponha publicamente (não vai no código, só na Vercel como variável de ambiente).
- **"Colar nota" exige login** (mesma proteção do resto do app) para que ninguém de fora consiga gastar créditos da sua chave da Anthropic. Ainda assim, qualquer colaborador que tenha login no seu Fluxo pode usar o botão — se isso for um problema, dá para restringir por papel do colaborador no futuro.
- **A IA só lê o texto que você cola**, não a imagem em si — ela não confere se o texto bate com a foto real, então continue conferindo os valores antes de salvar, especialmente se a confiança apontada for "baixa".

Fora esses pontos — que são decisões de arquitetura e roadmap, não bugs — testei o backend (registro, login com senha errada, login correto, leitura/escrita de estado, e rejeição de payload grande) com um banco simulado antes de entregar, e todos os cenários passaram.
