# Rodar a Feira de Trocas com Docker

Tudo o que a outra pessoa precisa é **Docker Desktop** (ou Docker Engine + plugin
`compose`). Nada de Node, Postgres ou Prisma instalados na máquina.

## Subir pela primeira vez

1. Clone o repositório e entre na pasta.
2. Crie o `.env` a partir do exemplo:
   ```bash
   cp .env.example .env
   ```
3. Gere um `SESSION_SECRET` real e coloque no `.env` (é obrigatório — o compose recusa
   subir sem ele):
   ```bash
   openssl rand -hex 32
   ```
4. Suba a stack:
   ```bash
   docker compose up -d --build
   ```
5. Abra <http://localhost:3000>.

O primeiro `--build` demora alguns minutos (baixa as imagens base e compila o Next).
Nas vezes seguintes o cache do Docker deixa isso rápido.

### Com dados de demonstração

Para receber um ambiente já povoado (logins e itens de exemplo), troque o passo 4 por:

```bash
docker compose --profile demo up -d --build
```

Isso roda o `prisma/seed.mjs`. Os logins criados aparecem no log:

```bash
docker compose logs seed
```

O padrão é **sem** seed — um ambiente que vai virar produção não deve nascer com contas
de teste dentro.

## Criar o primeiro admin (ambiente sem seed)

```bash
docker compose run --rm migrate node prisma/criar-admin.mjs admin@cotemig.com.br umaSenhaForte
```

O serviço `migrate` é reaproveitado aqui porque é a imagem que tem o Prisma completo.
Ele sobe, roda o script e some (`--rm`).

## Comandos do dia a dia

| O que | Comando |
|---|---|
| Subir | `docker compose up -d --build` |
| Subir com demo | `docker compose --profile demo up -d --build` |
| Ver os logs do app | `docker compose logs -f app` |
| Parar (mantém os dados) | `docker compose down` |
| Parar e **apagar o banco** | `docker compose down -v` |
| Parar tudo, incluindo o `seed` | `docker compose --profile demo down` |
| Estado dos serviços | `docker compose ps` |
| Abrir o psql | `docker compose exec db psql -U postgres -d feira` |

Os mesmos comandos existem como atalhos npm: `npm run docker:up`, `docker:demo`,
`docker:down`, `docker:logs`, `docker:admin`.

Detalhe do compose: `docker compose down` **não** remove o container do `seed`, porque ele
está num profile. Para limpar tudo, use `docker compose --profile demo down`.

## Deploy numa plataforma (Railway, Fly, Render)

**Pre-Deploy Command — use exatamente isto:**

```
/app/pre-deploy.sh
```

Ele aplica as migrations pendentes usando a CLI do Prisma que **já vem dentro da imagem**,
na versão exata do `package-lock.json`, com o caminho do schema explícito.

### Por que não `npx prisma migrate deploy`

Esse comando falhava por três motivos empilhados:

1. `npx` baixava a CLI do registry e pegava a `latest` — prisma@7, que rejeita
   `url = env("DATABASE_URL")` no datasource (`P1012`, quer `prisma.config.ts`) e é um
   major acima do `@prisma/client` 6.x que gerou estas migrations;
2. `npx` grava cache no HOME e o container roda como o usuário não-root `feira` →
   `npm error EACCES`;
3. a CLI baixada rodava de um diretório temporário e não achava `prisma/schema.prisma`
   (`Could not find Prisma Schema`).

Rodar como root resolveria só o item 2 — os outros dois continuariam. A correção foi na
imagem: o `runner` carrega `prisma/` (schema + migrations) e uma árvore isolada com a CLI
**6.x** em `/app/.prisma-cli`, e `CHECKPOINT_DISABLE=1` evita ida à rede no deploy. O
container segue não-root.

Além disso existe um atalho em `/app/node_modules/.bin/prisma` apontando para essa CLI.
O `npx` procura o binário local antes de ir ao registry, então **`npx prisma migrate
deploy` também funciona** — usa a 6.19.3 da imagem e não baixa nada. É rede de segurança:
prefira `/app/pre-deploy.sh`, que é explícito e passa o `--schema`.

Variáveis que a plataforma precisa ter:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a URL do Postgres gerenciado da plataforma |
| `SESSION_SECRET` | 32 bytes aleatórios (`openssl rand -hex 32`) |
| `TZ_EVENTO` | `America/Sao_Paulo` (opcional) |

Depois do primeiro deploy, crie o admin apontando para o banco de produção a partir da
sua máquina:

```bash
env DATABASE_URL="<URL pública do Postgres>" node prisma/criar-admin.mjs admin@cotemig.com.br <senha>
```

O serviço `migrate` do `docker-compose.yml` roda **o mesmo script e a mesma imagem** que a
plataforma usa. Se o pre-deploy for quebrar em produção, quebra num `docker compose up`
local primeiro.

## O que está rodando

| Serviço | Papel |
|---|---|
| `db` | Postgres 16, dados no volume `db-data` (sobrevivem a `down`, morrem com `down -v`) |
| `migrate` | Roda `prisma migrate deploy` e sai. O `app` só sobe depois que ele termina bem |
| `app` | O Next em modo produção (`output: standalone`), porta 3000 |
| `seed` | Só com `--profile demo`. Popula dados de exemplo |

O `app` depende de `migrate` com `service_completed_successfully`: se uma migration
falhar, o app **não sobe** em vez de subir contra um schema velho.

## Portas

| Porta no host | Serviço | Como mudar |
|---|---|---|
| 3000 | app | `APP_PORT=3100` no `.env` |
| 5434 | Postgres | `POSTGRES_PORT=5435` no `.env` |

O Postgres não usa 5432 porque quase toda máquina de dev já tem um Postgres local ali; e
não usa 5433 porque essa é a do banco de testes (`docker-compose.test.yml`).

Se aparecer `address already in use` ao subir, é isso: mude a porta no `.env` e suba de novo.

## Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `SESSION_SECRET` | **sim** | Assina o cookie de sessão (HMAC-SHA256). Sem ela o compose se recusa a subir |
| `APP_PORT` | não | Porta do app no host (padrão 3000) |
| `POSTGRES_PORT` | não | Porta do Postgres no host (padrão 5434) |
| `TZ_EVENTO` | não | Fuso dos gráficos do admin (padrão `America/Sao_Paulo`) |
| `DATABASE_URL_EXTERNO` | não | Aponta a stack para um Postgres gerenciado em vez do container |

**`DATABASE_URL` não vale para o Docker.** A do seu `.env` aponta para `localhost`, que
dentro de um container é o próprio container — o `migrate` morreria com `P1001: Can't
reach database server`. Dentro do compose a URL é fixa (`@db:5432`). Para usar um banco
externo (Railway, Neon, RDS), use `DATABASE_URL_EXTERNO`:

```bash
DATABASE_URL_EXTERNO="postgresql://user:senha@host:5432/banco?schema=public"
```

## Entregar para outra pessoa

**Caminho 1 — ela roda o build (recomendado).** Mande o repositório. Ela precisa só de
Docker e dos passos de "Subir pela primeira vez". É a forma mais simples: nada de
registry, e ela sempre compila o código que está no clone dela.

**Caminho 2 — mandar a imagem pronta**, quando a outra máquina não deve compilar:

```bash
# na sua máquina
docker compose build app
docker save feiradetrocas-app:latest | gzip > feira-app.tar.gz
```

Ela recebe o `feira-app.tar.gz` junto com o `docker-compose.yml` e o `.env.example`, e roda:

```bash
gunzip -c feira-app.tar.gz | docker load
docker compose up -d          # sem --build: usa a imagem carregada
```

**Caminho 3 — registry**, se houver um (GHCR, Docker Hub):

```bash
docker tag feiradetrocas-app:latest ghcr.io/<org>/feira-app:1.0.0
docker push ghcr.io/<org>/feira-app:1.0.0
```

Do outro lado, troque o bloco `build:` do serviço `app` por
`image: ghcr.io/<org>/feira-app:1.0.0`.

### Nunca mande junto

- O arquivo `.env` (tem o `SESSION_SECRET` e a senha do banco). Mande o `.env.example`;
  cada ambiente gera o próprio segredo.
- O volume `db-data` / um dump com dados reais de alunos, se for só para a pessoa testar.

Trocar o `SESSION_SECRET` invalida todas as sessões abertas — é o comportamento esperado
ao migrar de ambiente.

## Backup do banco

```bash
# salvar
docker compose exec -T db pg_dump -U postgres feira | gzip > backup-$(date +%F).sql.gz

# restaurar
gunzip -c backup-2026-08-08.sql.gz | docker compose exec -T db psql -U postgres -d feira
```

Vale rodar o backup no fim de cada dia de feira: `down -v` apaga o volume sem perguntar.

## Notas de implementação

- A imagem base é `node:22-slim` (Debian), **não** Alpine: o `schema.prisma` declara o
  engine `debian-openssl-3.0.x`. Em Alpine (musl) o Prisma pediria outro binário e o app
  quebraria em runtime com "Query engine library for current platform not found".
- O `next.config.mjs` usa `output: 'standalone'`, então a imagem de runtime leva só o
  servidor e as dependências realmente usadas — sem `node_modules` completo nem
  devDependencies.
- `exceljs` está em `serverExternalPackages`: fica fora do bundle e é carregado pelo Node
  em runtime, na rota de exportação.
- O estágio `builder` é reaproveitado pelos serviços `migrate` e `seed` porque é o único
  que tem a CLI do Prisma. Nada disso vai para a imagem final do `app`.
- Os testes continuam usando o `docker-compose.test.yml` (Postgres em `tmpfs`, porta
  5433). Os dois compose convivem sem conflito.
