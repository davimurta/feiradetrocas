# Feira de Trocas V2 — Contexto do Projeto

Contexto rápido e completo para qualquer sessão futura (Claude Code ou dev humano). Baseado na análise do código-fonte atual, não em intenção. Divergências com os docs antigos (`README.md`, `PRODUCAO.md`) estão marcadas.

## Visão geral

Sistema de economia de "fichas" para uma feira de trocas escolar do COTEMIG. Alunos entregam itens na recepção (ganham fichas) e gastam fichas para comprar itens de outros alunos num stand (PDV). Papéis operacionais: recepção, stand e admin. O banco é a única fonte da verdade; toda mudança de saldo/estoque é atômica.

## Stack técnica

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 15 (App Router, Server Components + Server Actions), React 19 |
| Linguagem | TypeScript 5.7 (`@/*` → `src/*`) |
| ORM / banco | Prisma 6 + PostgreSQL (enums nativos) |
| Validação | Zod 3 |
| UI | CSS Modules + tokens em `globals.css`; `@phosphor-icons/react`; `recharts` (gráficos); `qrcode-generator` (QR, SVG server-side) |
| Planilhas | `exceljs` (server-only, externalizado em `next.config.mjs`); CSV gerado sem dependência |
| Testes | Vitest 3 (projetos: unit, components, integration, e2e) + Playwright (e2e-ui); happy-dom + Testing Library nos componentes |
| Runtime | Node 20.12+/22+ (usa `process.loadEnvFile`); Postgres de teste via Docker na porta 5433 |

## Domínio

Papéis (`enum Papel`): `participante`, `atendente_entrada`, `atendente_stand`, `admin`.
Unidades (`enum Unidade`): `barroca`, `floresta` (campi; telas operacionais filtram por unidade; saldo é global).

Entidades (`prisma/schema.prisma`):

| Model | Papel no domínio |
|---|---|
| `User` | conta; `saldo`, `papel`, `unidade`, `codigoCarteira`, flags `pendente`/`bloqueado` |
| `Item` | produto em produção/catálogo; stackado por `@@unique([nome, valor, unidade])`, `quantidade` |
| `ItemPendente` | item recebido na recepção, aguardando "push"; `status` pendente/producao |
| `Pedido` | compra que exige aprovação do comprador; `status` pendente/aprovado/recusado/cancelado |
| `Transacao` | auditoria de saldo (`tipo`: credito_entrada / debito_compra / ajuste_manual) |
| `Reporte` | denúncia do stand contra um comprador; admin decide bloqueio/zerar |

Identificadores (`src/lib/codigo.ts`): etiqueta de item `ITM-XXXXXXXX`; carteira gerada `CAR-XXXXXXXX`. Blocos de 8 chars, alfabeto sem caracteres ambíguos (sem I/L/O/0/1). Nota: no provisionamento atual (`src/domain/auth.ts`), `codigoCarteira` do aluno é o **prefixo do email/matrícula** (ex.: `20240001`), não um `CAR-`. Uso efetivo de `gerarCodigoCarteira` [A CONFIRMAR].

Convenções de identidade (`src/domain/auth.ts`): email de aluno = `<matricula>@aluno.cotemig.com.br`; carteira = prefixo do email; unidade pela matrícula (começa com `2` → `floresta`, senão `barroca`); email fora do padrão de matrícula nasce `pendente` (admin define papel/unidade).

Fluxos críticos:
1. **Recepção → pendente** (`registrarEntrada`, `src/domain/entrada.ts`): cria `ItemPendente` (status pendente). O aluno **ainda não é creditado** e o item não entra no catálogo. Cada recepção é uma linha própria (sem stacking aqui).
2. **Push para produção** (`colocarEmProducao`): em `$transaction` — compare-and-set `pendente→producao` (guarda contra crédito duplo), stacking no `Item` por `(nome,valor,unidade)` (increment ou create), credita saldo do aluno e grava `Transacao` credito_entrada. `pushTodosProducaoAction` faz em lote.
3. **Compra em duas pontas** (`src/domain/pedido.ts`): stand cria `Pedido` (`criarPedido`, `aprovadoAtendente=true`, `aprovadoComprador=false`, status pendente). O comprador aprova na carteira (`aprovarPedido`): em `$transaction`, marca aprovação + baixa estoque (`WHERE quantidade >= 1`) + debita saldo (`WHERE saldo >= valor`) + grava `Transacao` debito_compra + `status=aprovado`. Falha de estoque/saldo → `Pedido` vira `recusado` com `motivoRecusa`. Também `recusarPedido` (comprador) e `cancelarPedido` (atendente).
4. **Reporte** (`src/domain/reporte.ts`): stand reporta comprador; admin bloqueia conta ou zera saldo (`src/domain/admin.ts`, `ajustarSaldo` gera `Transacao` ajuste_manual).
5. **Alerta de discrepância de preço** (`src/lib/alertas/discrepancia.ts`): informativo, não bloqueia nada (ver Estado atual).

Divergência: `README.md`/`PRODUCAO.md` descrevem checkout direto via `processarVenda`/`src/domain/venda.ts` — isso **não existe mais**; o checkout é o fluxo `Pedido` acima. `src/app/actions/venda.ts` existe, mas orquestra `criarPedido`/`cancelarPedido`/`reportar`.

## Arquitetura

Camadas (com o porquê registrado):

- **Server Action (`'use server'`, `src/app/actions/*`)** — cada action: `getCurrentUser()` + `assertPapel(...)`, `schema.parse(input)` (Zod), retorna `ActionResult<T>` via `ok`/`fail` (`_result.ts`). Escolha por Server Actions em vez de REST: contrato tipado ponta a ponta e papel/validação centralizados sem camada HTTP manual.
- **Domínio (`src/domain/*`)** — recebe `PrismaClient`/`tx` por parâmetro (injeção de dependência) para ser testável em isolamento (mock no unit, singleton real na action). Contém a regra e a `$transaction`.
- **Prisma singleton** (`src/lib/prisma.ts`).
- **Leituras server-only** (`src/server/queries.ts`) — queries + tipos `*View` consumidos pelas páginas.
- **Métricas** (`src/server/metricas.ts`) — agregações do painel do admin. Tudo somado no Postgres (`groupBy` + SQL cru com `generate_series`/`date_trunc`); o client só desenha. Janela e granularidade saem de `src/lib/filtroMetricas.ts`, o mesmo parser usado pela Server Action e pela exportação, para gráfico e planilha nunca divergirem de período. Dois cuidados registrados: `created_at` é `timestamp(3)` **sem** fuso, gravado em UTC — o balde local exige `AT TIME ZONE 'UTC' AT TIME ZONE <tz>`, porque um `AT TIME ZONE` sozinho inverte a conversão e desloca a "hora do pico"; e a unidade de uma transação é `item.unidade` com fallback `user.unidade`, senão `ajuste_manual` (que não tem item) sumiria num INNER JOIN e os totais parariam de fechar entre KPI e gráfico.
- **Exportação** (`src/server/export.ts` + `src/lib/planilha.ts`) — datasets brutos paginados por cursor e serialização `.xlsx`/`.csv`. Entregue por Route Handler (`src/app/admin/export/route.ts`), não por Server Action: action serializaria o binário dentro do payload RSC.
- **Sincronização da carteira** (`src/app/actions/carteira.ts`, `sincronizarCarteiraAction`) — saldo + histórico + pedidos pendentes numa ida só. Existe porque o crédito de fichas nasce fora da tela do aluno (quem dá o push é a recepção): sem isso a carteira aberta só via o saldo novo depois de um F5. O polling de 4 s pausa com a aba em segundo plano e sincroniza no retorno do foco; uma aprovação em voo bloqueia a escrita do polling (`emAcao`) para o saldo não "voltar".
- **Wrapper de cliente** (`src/lib/acao.ts`, `chamar()`) — converte falha de rede (fetch abortado/aba suspensa) em `{ ok:false, error:{ code:'REDE' } }`; nunca rejeita. Todo chamado de action no client passa por ele.

Concorrência/atomicidade (ponto crítico): mutações usam `updateMany` + `WHERE`-guard (compare-and-set) em vez de ler-e-escrever. Sob `READ COMMITTED`, a corrida perdida atualiza 0 linhas e é rejeitada sem corromper estado; ordem de lock item→comprador evita deadlock. Não usa `SELECT FOR UPDATE` nem `Serializable`. Testado contra Postgres real (`tests/integration/*`).

Auth próprio (sem NextAuth), pela leveza e por não haver OAuth configurável no ambiente:
- Sessão: cookie `feira_session` assinado com HMAC-SHA256 (`src/lib/session.ts`), httpOnly, 7 dias; segredo em `SESSION_SECRET` (default inseguro se ausente).
- Senha: scrypt do Node (`src/lib/password.ts`).
- `getCurrentUser` (`src/lib/auth.ts`) resolve override de teste → cookie de sessão. `assertPapel` valida autenticado + não bloqueado + papel. `requireUser` (`src/lib/guard.ts`) protege páginas server e redireciona (`/login`, `/pendente`, ou rota inicial do papel).
- Provisionamento (`src/domain/auth.ts`): `entrarComSenha` (cria conta ou "reivindica" conta pré-provisionada definindo a senha), `entrarComGoogle` (sem OAuth real — provisiona pelo email informado), `garantirAluno` (pré-provisão pela recepção para creditar aluno que ainda não logou).

Sanitização de entrada de texto: `src/lib/sanitize.ts` (remove controles/zero-width/bidi + limite de tamanho), acoplada aos componentes de campo.

## Convenções de código

- Pastas: `src/app` (rotas + `actions`), `src/domain` (regra), `src/lib` (infra/util), `src/server` (queries de leitura), `src/components` (kit `ui/` + pastas por feature: `admin/`, `entrada/`, `stand/`, `carteira/`, `alertas/`). Testes em `tests/{unit,components,integration,e2e,e2e-ui,helpers}`.
- Nomenclatura em português (funções, variáveis, códigos de `DomainError` em UPPER_SNAKE com `code` estável — `src/lib/errors.ts`).
- CSS: um `*.module.css` co-localizado por componente; `src/app/globals.css` guarda apenas tokens (`:root`), reset, tipografia base e utilitários compartilhados. Kit de UI reexportado por `src/components/ui/index.ts`.
- Padrão de action: `try { auth+assertPapel; schema.parse; return ok(await dominio(...)) } catch (err) { return fail(err) }`. `fail` mapeia `DomainError`→`{code,message}`, `ZodError`→`VALIDACAO`, e relança o resto.
- Testes (`vitest.config.ts`): `unit` (Prisma mockado, `tests/unit/_mock-db.ts`), `components` (happy-dom + Testing Library + user-event), `integration` e `e2e` (Postgres real, `globalSetup` aplica migrations, `TRUNCATE` no `beforeEach`, `singleFork` em série), `e2e-ui` (Playwright). Testes de banco se auto-pulam sem `.env.test`. Helpers/factories em `tests/helpers/`.

## Estado atual

Implementado e coberto por testes:

| Área | Domínio/UI | Testes |
|---|---|---|
| Auth (senha/claim, google-provision, pré-provisão) | `domain/auth.ts`, `LoginForm` | `integration/auth`, `components/LoginForm` |
| Recepção + push/stacking | `domain/entrada.ts`, `RecepcaoForm`, `ItensPendentes`, `EntradaConsole` | `unit/entrada`, `integration/entrada`, componentes |
| Fila da recepção (busca, ordenação, seleção múltipla, edição inline) | `ItensPendentes` + `pushTodosProducaoAction({ ids })` | `components/ItensPendentes`, `components/EntradaConsole`, `e2e/fluxo` |
| Carteira que se atualiza sozinha (crédito nasce na recepção) | `actions/carteira.ts`, `Carteira` | `components/Carteira`, `e2e/fluxo` |
| Compra em duas pontas | `domain/pedido.ts`, `StandVenda`, `carteira/AprovacaoOverlay` | `unit/pedido`, `integration/pedido`, `components/StandVenda` |
| Reporte + bloqueio/zerar | `domain/reporte.ts`, `domain/admin.ts`, `AdminReportes` | `unit/reporte`, `integration/reporte`, `integration/admin` |
| Admin (itens, usuários, saldo) | `AdminConsole`/`AdminItens`/`AdminUsuarios` | `unit/admin`, `integration/admin`, componentes |
| Painel de métricas (filtro de período/granularidade, 8 gráficos, KPIs) | `server/metricas.ts`, `AdminMetricas`/`AdminCharts`/`paleta.ts` | `unit/metricas`, `integration/admin`, `components/AdminMetricas` |
| Exportação .xlsx/.csv (transações, saldos, itens, status, resumo) | `server/export.ts`, `lib/planilha.ts`, `app/admin/export/route.ts` | `unit/metricas`, `integration/export` |
| Alerta de discrepância de preço | `lib/alertas/discrepancia.ts`, `AlertasDiscrepancia` (Entrada + Admin) | `unit/discrepancia`, `components/AlertasDiscrepancia` |
| Fluxo ponta a ponta | login → recepção → venda → saldo | `tests/e2e-ui/fluxo.spec.ts` |

Migrations (4): `init`, `pendente_conta`, `producao_reportes_descricao_bloqueio`, `indices_metricas` (índices em `transacoes(created_at)`, `transacoes(tipo, created_at)`, `transacoes(atendente_id, created_at)`, `pedidos(atendente_id, status)`, `itens_pendentes(atendente_id, created_at)` — sem eles as agregações por hora e por atendente fazem seq scan).

Em progresso / não commitado: o histórico git tem só 2 commits e ~87 arquivos no working directory estão modificados/não rastreados (refactor de front-end em CSS Modules + redesign + a feature de discrepância). Nada disso está commitado. Para a discrepância, `unit`+`components` passam e `tsc` está limpo; `integration`/`e2e`/`build` não foram rodados nessa mudança (exigem banco/servidor).

## Débitos técnicos / próximos passos conhecidos

- `README.md` e `PRODUCAO.md` estão **desatualizados**: citam `processarVenda`/`domain/venda.ts`, rota `/historico`, `lookups.ts`, `participante.ts` e uma barra "DEV switcher" que não correspondem ao código atual. Atualizá-los ou marcá-los como histórico [A CONFIRMAR].
- Login com Google não é OAuth real (provisiona pelo email). Existe intenção de plugar OAuth (`src/domain/auth.ts`). O botão de Google foi removido do `LoginForm` no working directory — decisão definitiva [A CONFIRMAR].
- `preco == 0`: a validação Zod da recepção/edição exige valor positivo, então zero não entra pelo fluxo normal; o alerta `preco_zero` é rede de segurança para dados vindos por outra via (seed/import/DB). Permitir cadastro com 0 [A CONFIRMAR].
- `tests/e2e-ui/fluxo.spec.ts` espera `heading "Venda aprovada"` no stand, mas o redesign renomeou para "Venda concluída" (e é uma `div`, não um heading) — o teste do fluxo Floresta falha por isso, independente do painel de métricas. Decidir entre atualizar o seletor ou promover o texto a heading (a segunda opção também melhora a acessibilidade) [A CONFIRMAR].
- `listarItensAdmin`/`listarUsuariosAdmin` continuam sem paginação: `/admin` carrega catálogo e base de usuários inteiros no primeiro render. Não é agregação no client (a leitura é server-side), mas o payload cresce linearmente com o evento.
- `getCurrentUser` mantém override mockado (`__setMockUserId`) para testes.
- `SESSION_SECRET`: o fallback embutido agora **só existe fora de produção** — com `NODE_ENV=production` e a variável ausente, `src/lib/session.ts` lança erro. O repositório é público, então o valor default é conhecido: sem essa guarda, dava para forjar o cookie `feira_session` (`userId.hmac`) de qualquer conta, inclusive admin.
- Repositório público: `prisma/seed.mjs` e o `README.md` trazem senhas de demonstração (`admin123`, `stand123`…). São dados de exemplo e podem continuar públicos, mas **nunca rodar o seed contra produção** — seria conta de admin com senha conhecida. O `seed` do compose está atrás do profile `demo` por isso.
- `.env.test` é versionado de propósito (credenciais de um Postgres local em `localhost:5433` + segredo de teste). Não é vazamento, mas esse `SESSION_SECRET` jamais deve ser reaproveitado fora dos testes.
- Sem TODO/FIXME reais no `src` além do apontado. Sem `docs/*.md` de planejamento além de `README.md` e `PRODUCAO.md` (ambos na raiz).

## Docker

`Dockerfile` (multi-stage, base `node:22-slim` para casar com o engine `debian-openssl-3.0.x` do Prisma) + `docker-compose.yml` (db → migrate → app, com `seed` no profile `demo`). O `app` só sobe após o `migrate` terminar com sucesso, então o schema nunca fica atrás do código. `next.config.mjs` usa `output: 'standalone'`. Armadilha registrada: o compose **ignora** o `DATABASE_URL` do `.env` (aponta para `localhost`, que no container é o próprio container) — a URL interna é fixa em `@db:5432` e um banco externo entra por `DATABASE_URL_EXTERNO`. Passo a passo e entrega para terceiros em `docs/DOCKER.md`.

## Comandos úteis

`npm test` (unit+components, sem infra) · `npm run test:integration` · `npm run test:e2e` · `npm run test:ui` (Playwright) · `npm run typecheck` · `npm run db:test:up`/`db:test:down` · `npm run db:seed` (logins/itens de exemplo — ver `prisma/seed.mjs`; `prisma/criar-admin.mjs` cria admin).
