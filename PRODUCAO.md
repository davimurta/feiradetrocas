# Relatório: colocar em produção com dados reais

Estado atual: app funcional (login email/senha real, aprovação em duas pontas, unidades
Barroca/Floresta, painel admin). Falta só configuração de infraestrutura + OAuth do Google.
Este documento é o passo a passo.

---

## 1. Banco de dados real

Hoje o banco é um **Postgres local em Docker** (porta 5433): bom para desenvolver, não para
produção. Para dados reais:

1. **Provisionar um Postgres gerenciado** (qualquer um): Neon, Supabase, Railway, Render,
   AWS RDS, etc. Todos entregam uma _connection string_.
2. Definir as variáveis de ambiente no servidor/host de deploy:
   ```
   DATABASE_URL="postgresql://USUARIO:SENHA@HOST:5432/BANCO?sslmode=require"
   SESSION_SECRET="<valor aleatório forte>"   # gere com: openssl rand -hex 32
   NODE_ENV="production"
   ```
   O `SESSION_SECRET` assina o cookie de sessão; **troque** o valor de dev.
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
- **Banco gerenciado (produção):** use a connection string que o provedor fornece: ela já
  vem com host público + SSL.

### b) Outro sistema acessar o banco
- Use a mesma `DATABASE_URL` (com `?sslmode=require` em produção).
- **Segurança:** crie um usuário Postgres separado, com permissões mínimas, só para o acesso
  externo (não use o superusuário). Restrinja por IP (firewall / `pg_hba.conf` / allowlist do
  provedor). Nunca exponha a senha do admin do banco.

---

## 3. Login com Google (opcional, desligado por padrão)

O fluxo OAuth já está implementado, atrás de `GOOGLE_AUTH_ENABLED`, que vem `false`. Com a
flag desligada, nenhuma rota do Google aparece na interface e o callback recusa tudo.

O Google é **método secundário de login**, nunca de cadastro. A conta nasce só pelo vínculo
com o Cotemig, que é o que prova que a pessoa é aluno. Depois de autenticada, ela associa a
conta Google em `/conta` e passa a poder entrar pelos dois caminhos. Conta Google sem vínculo
prévio não entra e não cria nada, e o Google nunca concede papel elevado.

Para ligar, é preciso ter um domínio público com HTTPS: o Google exige redirect URI `https`,
com exceção de `localhost` em desenvolvimento.

1. **Google Cloud Console**, criar projeto.
2. **OAuth consent screen**. O colégio usa Google Workspace (confirmado pelos registros MX de
   `cotemig.com.br`), então "Internal" é a opção correta.
3. **Credentials → Create OAuth client ID → Web application.**
4. **Authorized redirect URIs:**
   - produção: `https://SEU_DOMINIO/api/auth/google/callback`
   - dev: `http://localhost:3000/api/auth/google/callback`
5. Preencher as variáveis de ambiente:
   ```
   GOOGLE_AUTH_ENABLED=true
   GOOGLE_CLIENT_ID="..."
   GOOGLE_CLIENT_SECRET="..."
   GOOGLE_REDIRECT_URI="https://SEU_DOMINIO/api/auth/google/callback"
   GOOGLE_HD="cotemig.com.br"
   ```

O que o fluxo faz, em `src/lib/google.ts` e nas rotas sob `src/app/api/auth/google/`:

- Authorization Code com **PKCE S256**, `state` aleatório comparado em tempo constante e
  `nonce` conferido dentro do ID token.
- Recusa se `email_verified` não for exatamente `true`.
- Manda `hd` na autorização **e revalida o domínio no servidor**, porque `hd` sozinho não é
  garantia. Aceita `cotemig.com.br` e `aluno.cotemig.com.br`: como o segundo é alias do
  primeiro no Workspace, a claim `hd` e o `email` podem voltar no domínio principal mesmo para
  aluno. A lista é ajustável por `GOOGLE_DOMINIOS`.
- Vínculo em modelo separado (`contas_externas`), com unique composto em
  (`provider`, `providerAccountId`).
- Os segredos ficam só no servidor, nunca em `NEXT_PUBLIC_*`.

> A assinatura do ID token não é verificada contra o JWKS, de propósito: o token chega pela
> troca server-to-server com o endpoint do Google, por TLS, e não passa pelo navegador. É a
> dispensa prevista na especificação OIDC (3.1.3.7). Se algum dia o ID token passar a chegar
> pelo cliente, essa verificação passa a ser obrigatória.

---

## 4. Outros pontos para produção (checklist)

- [ ] **Confirmar a regra real de matrícula** (1=Barroca, 2=Floresta) e o formato do email do
      aluno. Se for diferente, ajustar `ehMatricula` / `unidadeDeMatricula` em
      `src/domain/auth.ts` (um único lugar).
- [ ] **Trocar o seed de demonstração** pelos dados reais de staff. Remover os logins de teste.
- [ ] **HTTPS** no domínio de produção (o cookie de sessão já sai `secure` quando
      `NODE_ENV=production`).
- [ ] (Opcional) **Bloquear conta pendente também nas Server Actions**: hoje o bloqueio é no
      nível de página (guard). A UI já não deixa a conta pendente chegar nas ações, então é
      hardening, não obrigatório.
- [ ] (Opcional) **Tempo real**: a aprovação da compra usa _polling_ (stand a cada 2,5s,
      carteira a cada 4s). Funciona bem no evento; dá para trocar por SSE/websocket depois sem
      mexer no domínio.
- [ ] **Definir `PROXIES_CONFIAVEIS`** com o número de proxies à frente do app no host
      escolhido. Sem isso o limite por IP fica desligado, porque `x-forwarded-for` é forjável.
      O limite por identidade opera normalmente de qualquer jeito.
- [ ] **Escolher o custo do scrypt.** O padrão `SCRYPT_N=131072` custa cerca de 128 MB e 300 ms
      por verificação de senha. Num servidor modesto, com fila de login no pico do evento,
      considere 65536. Mudar o valor não invalida senha nenhuma.
- [ ] **Backups** do banco e um mínimo de monitoramento/logs.

---

## Resumo do "mínimo para ir ao ar"

1. Postgres gerenciado + `DATABASE_URL` + `SESSION_SECRET` + `prisma migrate deploy`.
2. Cadastrar o admin (seed ou manual) e liberar/cadastrar os atendentes por unidade.
3. Deploy do app com as env vars.
4. (Se quiser Google) criar as credenciais OAuth e ligar o provider: o resto da lógica já está pronto.
