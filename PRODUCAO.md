# Relatório — colocar em produção com dados reais

Estado atual: app funcional (login email/senha real, aprovação em duas pontas, unidades
Barroca/Floresta, painel admin). Falta só configuração de infraestrutura + OAuth do Google.
Este documento é o passo a passo.

---

## 1. Banco de dados real

Hoje o banco é um **Postgres local em Docker** (porta 5433) — bom para desenvolver, não para
produção. Para dados reais:

1. **Provisionar um Postgres gerenciado** (qualquer um): Neon, Supabase, Railway, Render,
   AWS RDS, etc. Todos entregam uma _connection string_.
2. Definir as variáveis de ambiente no servidor/host de deploy:
   ```
   DATABASE_URL="postgresql://USUARIO:SENHA@HOST:5432/BANCO?sslmode=require"
   SESSION_SECRET="<valor aleatório forte>"   # gere com: openssl rand -hex 32
   NODE_ENV="production"
   ```
   O `SESSION_SECRET` assina o cookie de sessão — **troque** o valor de dev.
   Em produção o cookie já sai como `secure` (só trafega em HTTPS).
3. Aplicar as migrations no banco novo:
   ```
   npx prisma migrate deploy
   ```
4. **Criar os usuários de staff** (admin + atendentes por unidade). Duas formas:
   - Editar `prisma/seed.mjs` com os emails/senhas reais e rodar `node --env-file=.env prisma/seed.mjs`; ou
   - Criar só o **admin** e usar o painel `/admin` para cadastrar/liberar o resto.
   Os **alunos se cadastram sozinhos** no primeiro login (a conta é criada na hora).
5. **Deploy do app** (Vercel, Render, uma VM com Node, etc.) com as env vars acima.
   Build: `npm run build` → `npm start`.

> **Se for deployar em serverless (ex.: Vercel):** funções serverless abrem muitas conexões
> e estouram o Postgres. Use um _pooler_: o "pooled connection" do Neon/Supabase, PgBouncer,
> ou Prisma Accelerate. O padrão é `DATABASE_URL` = string _pooled_ + `DIRECT_URL` = string
> direta (para as migrations), e adicionar `directUrl = env("DIRECT_URL")` no `datasource` do
> `prisma/schema.prisma`. Em servidor Node comum (não serverless) **não precisa** disso.

---

## 2. Acessar o banco "por fora"

### a) Ver/editar os dados com um cliente de banco
Ferramentas: TablePlus, DBeaver, pgAdmin, ou `psql`.

- **Banco local (Docker atual):** host `localhost`, porta `5433`, usuário `postgres`, senha
  `postgres`, banco `feira`:
  ```
  psql "postgresql://postgres:postgres@localhost:5433/feira"
  ```
- **De outro computador na mesma rede:** o container já expõe a porta (`-p 5433:5432`);
  conecte em `IP_DA_MAQUINA:5433` (e libere a porta 5433 no firewall da máquina).
- **Banco gerenciado (produção):** use a connection string que o provedor fornece — ela já
  vem com host público + SSL.

### b) Outro sistema acessar o banco
- Use a mesma `DATABASE_URL` (com `?sslmode=require` em produção).
- **Segurança:** crie um usuário Postgres separado, com permissões mínimas, só para o acesso
  externo (não use o superusuário). Restrinja por IP (firewall / `pg_hba.conf` / allowlist do
  provedor). Nunca exponha a senha do admin do banco.

---

## 3. Login com Google (OAuth real)

Hoje o botão do Google é **simulado** (provisiona pelo email informado). A lógica de domínio
`entrarComGoogle({ email, nome })` em `src/domain/auth.ts` **já existe e já provisiona/vincula
a conta** — só falta a camada de OAuth que entrega o email/nome verificados pelo Google.

Passos:

1. **Google Cloud Console** → criar projeto.
2. **OAuth consent screen** → configurar (se o colégio tiver Google Workspace, use "Internal";
   senão "External"). Publicar.
3. **Credentials → Create OAuth client ID → Web application.**
4. **Authorized redirect URIs:**
   - produção: `https://SEU_DOMINIO/api/auth/callback/google`
   - dev: `http://localhost:3000/api/auth/callback/google`
5. Copiar **Client ID** e **Client secret** para env vars:
   ```
   GOOGLE_CLIENT_ID="..."
   GOOGLE_CLIENT_SECRET="..."
   ```
6. **Implementar o fluxo OAuth.** Duas opções:
   - **Auth.js (NextAuth)** — adiciona 1 dependência mas resolve o OAuth. Configura o provider
     Google e, no callback, chama `entrarComGoogle({ email, nome })` (nosso domínio) para
     provisionar/vincular, reaproveitando as regras de unidade e de conta pendente.
   - **Manual (sem dependência)** — uma rota `/api/auth/google` redireciona para o Google, e
     `/api/auth/callback/google` troca o `code` por token, lê o perfil, chama `entrarComGoogle`
     + `setSession`. Mais código, zero dependência.
7. (Opcional) Restringir ao domínio do colégio: parâmetro `hd=cotemig.com.br` e validar o
   email retornado no callback.

> **Atenção à regra de unidade:** um login por Google normalmente traz um email que **não é
> matrícula** → pela regra atual a conta cai como **pendente** e o admin libera em `/admin`.
> Se os alunos entrarem com o email institucional `matricula@aluno.cotemig.com.br`, a regra de
> matrícula (1=Barroca / 2=Floresta) já resolve automaticamente, sem passar por pendente.

---

## 4. Outros pontos para produção (checklist)

- [ ] **Confirmar a regra real de matrícula** (1=Barroca, 2=Floresta) e o formato do email do
      aluno. Se for diferente, ajustar `ehMatricula` / `unidadeDeMatricula` em
      `src/domain/auth.ts` (um único lugar).
- [ ] **Trocar o seed de demonstração** pelos dados reais de staff. Remover os logins de teste.
- [ ] **HTTPS** no domínio de produção (o cookie de sessão já sai `secure` quando
      `NODE_ENV=production`).
- [ ] (Opcional) **Bloquear conta pendente também nas Server Actions** — hoje o bloqueio é no
      nível de página (guard). A UI já não deixa a conta pendente chegar nas ações, então é
      hardening, não obrigatório.
- [ ] (Opcional) **Tempo real** — a aprovação da compra usa _polling_ (stand a cada 2,5s,
      carteira a cada 4s). Funciona bem no evento; dá para trocar por SSE/websocket depois sem
      mexer no domínio.
- [ ] (Opcional) **Integração com a API do colégio** (mencionada na Fase 1) para validar
      matrículas/identidade contra o sistema da escola.
- [ ] **Backups** do banco e um mínimo de monitoramento/logs.

---

## Resumo do "mínimo para ir ao ar"

1. Postgres gerenciado + `DATABASE_URL` + `SESSION_SECRET` + `prisma migrate deploy`.
2. Cadastrar o admin (seed ou manual) e liberar/cadastrar os atendentes por unidade.
3. Deploy do app com as env vars.
4. (Se quiser Google) criar as credenciais OAuth e ligar o provider — o resto da lógica já está pronto.
