# Feira de Trocas — COTEMIG

Sistema de economia de **fichas** de uma feira de trocas escolar do COTEMIG.

> **Estado atual = Fase 3** (auth real, catálogo, itens stackados). Ela **substitui** partes
> das Fases 1 e 2 descritas mais abaixo (auth mockada, item único com status, dev switcher).
> O modelo/atomicidade continuam os mesmos; o que mudou está em **[Fase 3](#fase-3--auth-catálogo-e-stacking-atual)**.
> Pule direto para lá se quiser o estado atual.

---

## (Histórico) Fase 1: Backend & Modelagem

Sistema de economia de **fichas** de uma feira de trocas escolar (Cotemig).
Participantes trazem itens (ganham fichas na triagem) e gastam fichas para comprar itens
de outros participantes. Esta fase entrega **só o backend**: schema, regras de negócio,
Server Actions e testes. **Sem UI.**

A V1 dependia de planilha externa e fazia updates de saldo não-atômicos (risco de race
condition). A V2 resolve isso: **o banco é a única fonte da verdade** e **toda mudança de
saldo passa por transação atômica**.

Stack: **Next.js (App Router) + Prisma + PostgreSQL**. Testes em **Vitest**. Validação em **Zod**.

---

## Arquitetura em camadas

```
Server Action ("use server")   ← src/app/actions/*   (papel + validação Zod, resultado tipado)
        │
        ▼
Função de domínio (pura*)       ← src/domain/*        (regra de negócio + transação atômica)
        │
        ▼
Prisma Client                   ← src/lib/prisma.ts   (singleton)
```

\* "pura" no sentido de **testável em isolamento**: recebe o `PrismaClient` por parâmetro
(injeção de dependência), então dá para passar um mock no unitário e o singleton real na
Server Action — sem reescrever nada.

| Arquivo | Papel |
|---|---|
| [prisma/schema.prisma](prisma/schema.prisma) | Modelagem (`User`, `Item`, `Transacao`, enums, índices) |
| [src/domain/entrada.ts](src/domain/entrada.ts) | `avaliarEntrada` — triagem: credita ficha + cria item |
| [src/domain/venda.ts](src/domain/venda.ts) | `processarVenda` — checkout atômico (**ponto crítico**) |
| [src/app/actions/entrada.ts](src/app/actions/entrada.ts) | Server Action de triagem (`atendente_entrada`) |
| [src/app/actions/venda.ts](src/app/actions/venda.ts) | Server Action de venda (`atendente_stand`) |
| [src/lib/auth.ts](src/lib/auth.ts) | `getCurrentUser()` **mockado** + `assertPapel()` |
| [src/lib/errors.ts](src/lib/errors.ts) | `DomainError` com `code` estável |
| [src/lib/codigo.ts](src/lib/codigo.ts) | Geração dos códigos de etiqueta/carteira |

---

## O ponto crítico: atomicidade da venda

`processarVenda` ([src/domain/venda.ts](src/domain/venda.ts)) roda tudo dentro de um
`prisma.$transaction`: **debitar o comprador + marcar o item vendido + gravar auditoria**
acontecem juntos ou nada acontece. Nunca existe saldo debitado sem item, nem item vendido
sem débito.

As duas mutações usam **`updateMany` com `WHERE`-guard** (compare-and-set atômico), em vez
de ler-e-depois-escrever:

- Item: `UPDATE ... WHERE status = 'disponivel'` → **0 linhas = corrida perdida / já vendido**
- Saldo: `UPDATE ... WHERE saldo >= preço` → **0 linhas = saldo insuficiente**

Sob `READ COMMITTED` (padrão do Postgres), quando duas vendas disputam o mesmo item, a
segunda **bloqueia no lock da linha** até a primeira commitar, **re-avalia o `WHERE`** contra
a versão já atualizada e atualiza 0 linhas — é rejeitada sem corromper estado. Não é preciso
`SELECT ... FOR UPDATE` nem isolamento `Serializable`. Os locks são sempre na ordem
**item → comprador**, o que evita deadlock entre vendas concorrentes.

Esse comportamento é **testado de verdade** contra Postgres real — ver os testes de corrida
em [tests/integration/venda.integration.test.ts](tests/integration/venda.integration.test.ts).

---

## Rodando

### Pré-requisitos
- Node 20.12+ / 22+ (usa `process.loadEnvFile`; validado no Node 24)
- Docker (para o Postgres de dev e de teste)

### Setup
```bash
npm install
npm run db:test:up          # sobe o Postgres de teste (docker, porta 5433)
npx prisma migrate deploy   # aplica as migrations
npm run prisma:generate     # (rodado automaticamente pelo migrate)
```

O `.env` já aponta para `postgresql://postgres:postgres@localhost:5433/feira`. Ajuste se
precisar. Nunca commite credenciais reais (o `.env` está no `.gitignore`).

---

## Testes — três camadas, rodáveis separadamente

Todo backend desta fase vem com testes em **três níveis**:

| Camada | Comando | Banco? | Cobre |
|---|---|---|---|
| **Unitário** | `npm run test:unit` | ❌ Prisma mockado | ramos de decisão de `avaliarEntrada`/`processarVenda`, rápido, sem infra |
| **Integração** | `npm run test:integration` | ✅ Postgres real | fluxo real no schema migrado + **cenários de concorrência** (2 vendas simultâneas) |
| **E2E** | `npm run test:e2e` | ✅ Postgres real | fluxo ponta a ponta **via Server Action** (papel, validação, resultado tipado) |
| _todos_ | `npm run test:all` | parcial | roda as três |

`npm test` = só os unitários (rápidos, sem infra) — ideal para o loop de dev e para CI barato.

### Integração e E2E precisam do Postgres de teste

```bash
npm run db:test:up          # sobe o container (postgres:16-alpine, dados em tmpfs = efêmeros)
npm run test:integration
npm run test:e2e
npm run db:test:down         # derruba e limpa
```

O container usa `tmpfs` (dados só em memória) — mais rápido e sem sujar disco. As migrations
são aplicadas automaticamente antes dos testes (`globalSetup`), e cada teste começa com o
banco limpo (`TRUNCATE` no `beforeEach`). Sem `.env.test`/banco no ar, os testes de banco se
**auto-pulam** em vez de quebrar.

> **Por que Postgres de verdade nos testes de integração, e não SQLite in-memory?**
> Duas razões que são o objetivo do exercício: (1) o schema usa **enums nativos do Postgres**,
> que o SQLite não suporta; (2) SQLite serializa **toda** a escrita num lock global, então a
> corrida de concorrência que precisamos provar (dois atendentes vendendo o mesmo item)
> **não seria realmente exercitada**. Um `postgres:16-alpine` em `tmpfs` é leve o bastante para
> CI e ainda testa a semântica real de lock por linha. Os unitários (a maioria) continuam
> sem infra nenhuma.

---

## Auth (mockada nesta fase)

Não há auth real ainda. [`getCurrentUser()`](src/lib/auth.ts) resolve a identidade de um
override de teste ou da env `MOCK_CURRENT_USER_ID`, mas **já lê o usuário/papel do banco pelo
mesmo caminho** que a versão real usará. As Server Actions consomem só o contrato
`AuthUser | null` — trocar a fonte da identidade **não exige mexer na regra de negócio**.

O ponto de integração está marcado com
`// TODO: integrar com a API do colégio quando o acesso/credenciais estiverem disponíveis`.

---

## Restrições respeitadas

- ✅ Sem UI (só schema, domínio, actions, testes).
- ✅ Toda mudança de saldo passa por `prisma.$transaction` (nunca dois `update` soltos).
- ✅ Nenhum commit/push — mudanças ficam só no working directory.
- ✅ Dependências mínimas: `next`, `react`, `@prisma/client`, `zod` (runtime); `prisma`,
  `vitest`, `typescript` (dev). Mocks e geração de código usam só o runtime do Node.

---

# Fase 2 — Front / UI

UI mobile-first construída **sobre o backend da Fase 1**, sem alterar schema, domínio ou as
Server Actions existentes (só consumindo-os + adições). Sem framework de componentes: só o
design system em CSS.

## Telas

| Rota | Papel | O que faz |
|---|---|---|
| [`/`](src/app/page.tsx) | qualquer logado | Carteira: saldo em destaque + QR pessoal (`codigoCarteira`) grande |
| [`/historico`](src/app/historico/page.tsx) | qualquer logado | Extrato de créditos/débitos, mais recente primeiro |
| [`/entrada`](src/app/entrada/page.tsx) | atendente_entrada / admin | Triagem em wizard: identificar/registrar participante → avaliar item → **etiqueta `ITM-` com QR** |
| [`/stand`](src/app/stand/page.tsx) | atendente_stand / admin | PDV: escanear item → escanear carteira → confirmar venda (feedback específico por `DomainError`) |
| [`/admin`](src/app/admin/page.tsx) | admin | Métricas (itens por status, fichas em circulação, nº de transações) + transações recentes |

## Design system

Fonte da verdade: **[src/app/globals.css](src/app/globals.css)** — tokens em CSS custom
properties: rampa de verde (`#40AA0B` = `--green-500`), neutros "paper", e as cores de
status do item (`recebido` âmbar / `disponivel` verde / `vendido` terracota). Fontes via
`next/font` em [layout.tsx](src/app/layout.tsx): **Space Grotesk** (display), **Inter**
(corpo), **Space Mono** (valores/códigos, com `tabular-nums` — efeito "carteira de verdade").

## Scan de QR

- **Leitura**: Web API **`BarcodeDetector`** quando o navegador suporta — **zero
  dependência**. A digitação manual (`ITM-`/`CAR-`) fica **sempre visível** como fallback.
  Ver [CodeScanner](src/components/CodeScanner.tsx).
- **Geração** do QR pessoal/etiqueta: **`qrcode-generator`** (única dependência nova da
  Fase 2). Escolhida por ser pura-JS, **zero dependências transitivas** e minúscula; a Web
  API não gera QR. Renderizada como um único `<path>` SVG no servidor
  ([QRCode](src/components/QRCode.tsx)) → sem JS no client.

## Auth continua mockada (dev switcher)

Sem login real. A barra **DEV** no topo troca o "usuário logado" gravando um cookie que o
`getCurrentUser()` lê. Isso foi a **única alteração aditiva** num arquivo da Fase 1
([auth.ts](src/lib/auth.ts)): a ordem de resolução virou `override de teste → cookie →
env MOCK_CURRENT_USER_ID`. O contrato `AuthUser` e a checagem de papel não mudaram; o `TODO`
da API do colégio segue no mesmo ponto.

## Adições ao backend (aditivas — nada existente foi alterado)

- [src/server/queries.ts](src/server/queries.ts) — leituras server-only das telas (carteira,
  extrato, métricas admin, lookups por código).
- Server Actions novas: [lookups.ts](src/app/actions/lookups.ts) (buscar item/carteira no
  stand), [participante.ts](src/app/actions/participante.ts) (registrar/buscar participante),
  [dev-session.ts](src/app/actions/dev-session.ts) (cookie do dev switcher).
- [src/domain/participante.ts](src/domain/participante.ts) — `registrarParticipante` (cria
  User participante com código de carteira único).

## Rodar o app

```bash
npm run db:test:up          # Postgres local (também serve de banco de dev aqui)
npx prisma migrate deploy
npm run db:seed             # cria staff + participantes de exemplo (idempotente)
npm run dev                 # http://localhost:3000  → troque de papel na barra DEV
```

## Testes da Fase 2

| Camada | Comando | Infra | Cobre |
|---|---|---|---|
| **Componente** | `npm run test:components` | ❌ happy-dom | forms de triagem e venda; **mensagens de `DomainError` renderizadas** |
| **E2E de UI** | `npm run test:ui` | ✅ Postgres + Chromium | fluxo clicável: triagem → venda → saldo do comprador atualiza |

`npm test` agora roda **unit + componentes** (rápido, sem infra). O E2E de UI (Playwright)
sobe o app contra o banco de teste (`feira_test`, build+start em `:3210`) e faz um seed
determinístico antes. Requer o browser: `npx playwright install chromium` (uma vez).

> **Por que Playwright aqui (e não na Fase 1)?** Agora testamos *através da UI de fato*.
> Mantido no mínimo: **um** caminho crítico ponta a ponta — os cenários de erro de domínio
> já vivem nos testes de integração (Fase 1) e de componente (Fase 2), sem duplicação.

---

# Fase 3 — Auth, catálogo e stacking (atual)

Reorientação do produto: login real, catálogo, itens com estoque e visual COTEMIG.

## O que mudou em relação às fases anteriores

- **Auth real** (substitui o mock): login por **email/senha** e por **Google**. O primeiro
  acesso **cria a conta** automaticamente. Sessão via **cookie assinado (HMAC)**; senha com
  **scrypt** (ambos do Node, sem lib de auth). A **carteira = prefixo do email** (a matrícula):
  `20240001@aluno.cotemig.com.br` → carteira `20240001`.
  > **Google sem OAuth real:** este ambiente não tem credenciais Google, então o botão
  > provisiona/entra pelo email informado (a identidade que o Google devolveria). O código
  > está estruturado para plugar OAuth de verdade depois — ver `src/domain/auth.ts`.
- **Itens stackados** (substitui item único + status): o mesmo produto (mesmo **nome + valor**)
  não vira vários registros — incrementa a **`quantidade`** (`@@unique([nome, valor])`).
  Disponível = `quantidade > 0`. O código único do item continua (identificação/QR).
- **Recepção com autocomplete**: ao digitar o **nome do item**, busca itens existentes e, ao
  escolher, **preenche categoria e valor** (para stackar). Identifica o aluno por
  **matrícula ou email** (cria a conta pré-provisionada se ainda não existir).
- **Stand por catálogo** (substitui digitar código): o atendente **escolhe do catálogo** (com
  busca) e identifica o comprador pela carteira (QR/matrícula) — nunca digita o código do item.
- **Participante** ganha **catálogo** (browse) e **carteira** (saldo + QR + histórico).

## Telas

| Rota | Papel | Tela |
|---|---|---|
| [`/login`](src/app/login/page.tsx) | público | Login (Google ou email/senha) |
| [`/`](src/app/page.tsx) | logado | Catálogo "Produtos Disponíveis" (busca ao vivo) |
| [`/carteira`](src/app/carteira/page.tsx) | logado | Saldo, QR pessoal e histórico |
| [`/entrada`](src/app/entrada/page.tsx) | atendente_entrada / admin | Central de Atendimento — cadastro de itens |
| [`/stand`](src/app/stand/page.tsx) | atendente_stand / admin | Caixa por catálogo |
| [`/admin`](src/app/admin/page.tsx) | admin | Métricas + transações recentes |

Design system (fonte da verdade): **[src/app/globals.css](src/app/globals.css)** — verde COTEMIG,
cards verde-claro, botões verde-escuro, valores/códigos em Space Mono tabular.

## Rodar

```bash
npm run db:test:up          # Postgres local (porta 5433)
npx prisma migrate deploy   # aplica as migrations
npm run db:seed             # cria logins de exemplo + itens
npm run dev                 # http://localhost:3000  → /login
```

**Logins de exemplo** (email / senha): `admin@cotemig.com.br / admin123`,
`entrada@cotemig.com.br / entrada123`, `stand@cotemig.com.br / stand123`,
`20240001@aluno.cotemig.com.br / aluno123`, `20240002@aluno.cotemig.com.br / aluno123`.
Qualquer email novo cria conta de aluno no primeiro login.

Defina `SESSION_SECRET` no `.env` (assina o cookie de sessão).

## Testes (todas as camadas continuam passando)

`npm test` (unit + componentes, sem infra) · `npm run test:integration` · `npm run test:e2e`
(Server Actions) · `npm run test:ui` (Playwright: **login → recepção → venda → saldo na carteira**).

| Camada | Cobre |
|---|---|
| Unit | `receberItem` (stacking, crédito), `processarVenda` (baixa de estoque) |
| Integração | fluxo real + **concorrência** (última unidade / mesmo saldo) + **auth** (provisionar, senha, Google, reivindicar conta) |
| Componente | recepção (autocomplete/prefill + erros) e stand (catálogo + erros) |
| E2E de UI | caminho crítico com **login real** ponta a ponta |

## Decisões tomadas nesta fase (não especificadas)

- **Sessão/senha próprias** (HMAC + scrypt do Node) em vez de NextAuth — mantém o projeto
  leve e sem OAuth impossível de configurar aqui.
- **Contas pré-provisionadas**: a recepção pode creditar um aluno que ainda não logou; no
  primeiro login por senha ele "reivindica" a conta (define a senha).
- **Papéis**: contas novas nascem `participante`. Atendentes/admin vêm do seed (email+senha).
- **`quantidade` por cadastro = 1** (o mockup não tem campo de quantidade); stackar é repetir
  o cadastro. O domínio aceita `quantidade` >1 se um dia a UI precisar.
- **Matrícula → email** `@aluno.cotemig.com.br` quando a recepção recebe só a matrícula.
