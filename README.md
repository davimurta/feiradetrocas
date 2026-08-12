# Feira de Trocas: COTEMIG

Sistema de economia de **fichas** para a feira de trocas do COTEMIG. Alunos entregam itens
na recepção e ganham fichas; gastam essas fichas comprando itens de outros alunos no stand.

O banco é a **única fonte da verdade**: toda mudança de saldo ou estoque acontece dentro de
uma transação atômica, com guarda contra condição de corrida. Nada de planilha paralela.

```
Aluno entrega item → recepção cadastra → fila de pendentes → push
   ↓                                                          ↓
aluno é creditado em fichas                    item entra no catálogo
                                                              ↓
                          stand monta o pedido → aluno aprova na carteira → débito
```

## Rodar

### Com Docker (recomendado: só precisa de Docker instalado)

```bash
cp .env.example .env
openssl rand -hex 32            # cole o resultado em SESSION_SECRET no .env
docker compose --profile demo up -d --build
```

Abre em <http://localhost:3000>. O `--profile demo` popula dados de exemplo; sem ele o
ambiente sobe vazio. Passo a passo completo, portas, backup e como entregar o projeto para
outra pessoa: **[docs/DOCKER.md](docs/DOCKER.md)**.

### Local (Node 20.12+ ou 22+, e um Postgres)

```bash
cp .env.example .env            # ajuste DATABASE_URL para o seu Postgres e defina SESSION_SECRET
npm install
npx prisma migrate deploy
npm run db:seed                 # opcional: logins e itens de exemplo
npm run dev
```

**Logins de exemplo** (só existem se você rodou o seed):

| Papel | Email | Senha |
|---|---|---|
| admin | `admin@cotemig.com.br` | `admin123` |
| recepção (Barroca) | `entrada.barroca@cotemig.com.br` | `entrada123` |
| stand (Barroca) | `stand.barroca@cotemig.com.br` | `stand123` |
| recepção (Floresta) | `entrada.floresta@cotemig.com.br` | `entrada123` |
| stand (Floresta) | `stand.floresta@cotemig.com.br` | `stand123` |
| aluno (Barroca) | `10240001@aluno.cotemig.com.br` | `aluno123` |
| aluno (Floresta) | `20240002@aluno.cotemig.com.br` | `aluno123` |

> Estas senhas são públicas (estão neste repositório). **Nunca rode o seed contra
> produção**: seria um admin com senha conhecida. Em produção, crie a conta com
> `node prisma/criar-admin.mjs <email> <senha>`.

`SESSION_SECRET` é obrigatório em produção: sem ele o app lança erro no boot em vez de assinar
as sessões com o valor de fallback, que está neste repositório público e permitiria forjar o
cookie de qualquer conta.

## Como uma conta de aluno nasce

O login **não** cria conta. Existem dois caminhos, e os dois passam pelo colégio:

1. **Cadastro em [`/cadastro`](src/app/cadastro/page.tsx).** O aluno informa usuário e senha do
   portal do Cotemig, e o servidor confirma o vínculo com um `GET /v1/perfil`. A senha do
   portal é usada uma vez e descartada: não é armazenada, nem embaralhada, nem registrada em
   log. Confirmado o vínculo, ele escolhe a senha que vai usar na feira. Detalhes em
   [docs/AUTH-COTEMIG.md](docs/AUTH-COTEMIG.md).
2. **Pré-provisionamento pela recepção.** Ao receber um item de uma matrícula ainda sem conta,
   a recepção cria a conta para poder creditar. Essa conta fica sem senha até o próprio aluno
   reivindicá-la pelo cadastro, provando o vínculo. Não existe outro jeito de assumi-la.

Quem **não tem matrícula** (professores, funcionários, visitantes) entra por **código de
convite**. O admin gera o código na aba Convites, escolhendo a unidade, a validade e um teto
opcional de usos, e distribui para o grupo. O mesmo código serve para várias pessoas até
expirar, então não é preciso gerar um por visitante. Sem código, nenhuma conta nasce por esse
caminho, o que torna o cadastro imune a criação em massa.

Contas de equipe (`atendente_entrada`, `atendente_stand`, `admin`) não se auto-cadastram: são
criadas por um admin ou por `node prisma/criar-admin.mjs`.

## Proteção contra tentativa em massa

Rate limiting no próprio Postgres, sem Redis, com incremento atômico em um único
`INSERT ... ON CONFLICT` para não perder contagem sob corrida.

A chave é a **identidade**, não o IP. No dia da feira quase todo mundo sai pelo mesmo IP
público da rede do colégio, e limitar por volume de requisições por IP derrubaria o evento
inteiro. O limite por IP existe, conta só falhas, tem teto alto e vem **desligado** até
`PROXIES_CONFIAVEIS` estar preenchido, porque sem saber quantos proxies existem à frente o
`x-forwarded-for` é forjável.

Padrões: 5 falhas de login por conta em 15 minutos, bloqueio de 5 minutos dobrando a cada
falha extra até o teto de 1 hora. O cadastro é mais duro (3 falhas, bloqueio de 15 minutos)
porque cada tentativa ali bate na API do colégio e pode bloquear a conta do aluno no portal.
Tudo configurável por variável de ambiente.

A resposta de login é idêntica para conta existente e inexistente, e o custo do scrypt é pago
nos dois casos para não vazar a diferença pelo tempo. O admin vê as tentativas e desbloqueia
contas manualmente na aba **Acessos**.

## Papéis e telas

| Rota | Quem acessa | O que faz |
|---|---|---|
| [`/login`](src/app/login/page.tsx) | público | Entrar por email e senha de conta já existente |
| [`/cadastro`](src/app/cadastro/page.tsx) | público | Criar conta: vínculo com o Cotemig ou código de convite |
| [`/conta`](src/app/conta/page.tsx) | logado | Vínculo do aluno e login com Google (atrás da flag) |
| [`/`](src/app/page.tsx) | logado | Só redireciona para a tela inicial do papel |
| [`/carteira`](src/app/carteira/page.tsx) | logado | Saldo, QR pessoal, histórico e aprovação de compras |
| [`/entrada`](src/app/entrada/page.tsx) | recepção / admin | Cadastro de itens e fila de pendentes |
| [`/stand`](src/app/stand/page.tsx) | stand / admin | Caixa: monta o pedido pelo catálogo |
| [`/admin`](src/app/admin/page.tsx) | admin | Métricas, usuários, itens, reportes, convites, acessos e exportação |
| [`/pendente`](src/app/pendente/page.tsx) | conta pendente | Espera o admin definir papel e unidade |

Duas **unidades** (campi): `barroca` e `floresta`. As telas operacionais filtram por
unidade; o saldo do aluno é global: ele ganha fichas num campus e gasta no outro.

## Os fluxos

**1. Recepção → fila de pendentes.** O item recebido vira um `ItemPendente`. O aluno
**ainda não é creditado** e o item não aparece no catálogo. Isso dá à recepção uma janela
para corrigir preço, categoria ou quantidade antes de valer fichas.

**2. Push para produção.** Numa transação: marca o pendente como produzido (compare-and-set,
para não creditar duas vezes), soma ao estoque do item equivalente (mesmo nome + valor +
unidade), credita o aluno e grava a transação de auditoria. Dá para produzir um item, uma
seleção ou a fila inteira.

**3. Compra em duas pontas.** O stand monta o `Pedido`; nada é debitado ainda. O pedido
aparece em tela cheia na carteira do comprador, que **aceita ou recusa**. Só na aceitação
o estoque baixa e o saldo é debitado, tudo numa transação. Se faltar saldo ou estoque
nesse instante, o pedido vira `recusado` com o motivo registrado.

**4. Reporte.** O stand pode reportar um comprador (recusa indevida, por exemplo). O admin
decide entre bloquear a conta ou zerar o saldo.

**5. Alerta de discrepância de preço.** Compara o preço de cada item com a mediana da sua
categoria (mediana + MAD, robustos a outliers). É **informativo**: sinaliza para a recepção
e para o admin, nunca bloqueia o cadastro.

## Painel do admin

- **Métricas** com filtro de período (hoje, 24h, 7/30 dias, tudo, intervalo personalizado)
  e granularidade por hora ou por dia: volume de transações no tempo, ranking de itens
  trocados, fichas emitidas/gastas/em circulação, atividade por atendente, pedidos por
  status, estoque × vendas por categoria, distribuição de saldo, reportes e discrepâncias.
  Cada gráfico tem uma tabela equivalente, para leitura sem depender de cor.
- **Exportação** em `.xlsx` (abas Resumo, Transações, Saldos, Itens, Status) ou `.csv` por
  dataset, respeitando o filtro da tela.
- **Usuários**, **itens** e **reportes** editáveis na própria linha.

Toda agregação acontece no Postgres. O navegador só desenha o que chega pronto.

## Stack

| Camada | Escolha |
|---|---|
| Framework | Next.js 15 (App Router, Server Components + Server Actions), React 19 |
| Linguagem | TypeScript 5.7 |
| Banco | PostgreSQL via Prisma 6 |
| Validação | Zod |
| UI | CSS Modules + tokens em `globals.css`, Phosphor Icons, Recharts |
| Planilhas | exceljs (só no servidor) |
| Testes | Vitest (unit, componentes, integração, e2e) + Playwright |

## Arquitetura

```
Server Action ("use server")   src/app/actions/*   autenticação + papel + validação Zod
        ↓
Domínio                        src/domain/*        regra de negócio + transação atômica
        ↓
Prisma Client                  src/lib/prisma.ts   singleton
```

- **Server Actions em vez de REST**: contrato tipado ponta a ponta, sem camada HTTP escrita
  à mão. Toda action faz `getCurrentUser()` + `assertPapel(...)`, valida a entrada com Zod e
  devolve `ActionResult<T>` (`ok` / `fail`), nunca uma exceção solta.
- **Domínio recebe o `PrismaClient` por parâmetro**, o que permite testá-lo com um mock no
  unitário e com o banco real na integração.
- **Leituras** ficam em `src/server/queries.ts` e `src/server/metricas.ts`, separadas das
  escritas.
- **Concorrência**: as mutações usam `updateMany` com `WHERE` de guarda (compare-and-set) em
  vez de ler-e-escrever. Sob `READ COMMITTED`, quem perde a corrida atualiza zero linhas e é
  rejeitado, sem corromper estado. A ordem de lock item → comprador evita deadlock. Isso é
  testado contra um Postgres de verdade, com promessas concorrentes disputando a última
  unidade e o último saldo.
- **Auth próprio**, sem NextAuth: cookie assinado com HMAC-SHA256 e senha com scrypt, ambos
  da biblioteca padrão do Node. O cookie carrega `userId` e `sessionVersion`, nunca o papel:
  papel, bloqueio e pendência são lidos do banco a cada requisição, e incrementar
  `sessionVersion` derruba na hora todos os cookies daquela conta.

Pastas: `src/app` (rotas e actions), `src/domain` (regra), `src/lib` (infra), `src/server`
(leituras), `src/components` (kit `ui/` + uma pasta por feature). Nomenclatura em português,
igual ao domínio.

## Testes

```bash
npm test                  # unit + componentes (não precisa de banco)
npm run test:integration  # domínio contra Postgres real
npm run test:e2e          # Server Actions contra Postgres real
npm run test:ui           # Playwright, navegador de verdade
npm run typecheck
```

Os testes de banco usam um Postgres em container (`npm run db:test:up`, porta 5433, dados em
memória) e se **auto-pulam** se não houver `.env.test`, então rodar a suíte sem infra não quebra.

| Camada | O que cobre |
|---|---|
| Unit | regras de domínio com Prisma mockado |
| Componentes | telas com Testing Library (happy-dom) |
| Integração | fluxo real + **concorrência** + auth, contra Postgres |
| E2E | Server Actions ponta a ponta, com papéis |
| E2E de UI | caminho crítico no navegador: login → recepção → venda → saldo |

## Documentação

| Arquivo | Assunto |
|---|---|
| [docs/CONTEXT.md](docs/CONTEXT.md) | Estado real do código, decisões e débitos técnicos: leia antes de mexer |
| [docs/DOCKER.md](docs/DOCKER.md) | Subir com Docker, deploy, backup e entrega para terceiros |
| [PRODUCAO.md](PRODUCAO.md) | Notas de produção |

## Comandos úteis

```bash
npm run db:test:up / db:test:down     # Postgres de teste
npm run db:seed                       # dados de exemplo (nunca em produção)
node prisma/criar-admin.mjs <email> <senha>   # cria ou promove um admin
npm run docker:up / docker:logs / docker:down
```
