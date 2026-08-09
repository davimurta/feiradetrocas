# Imagem de produção da Feira de Trocas.
#
# Base é `slim` (Debian), não `alpine`: o schema do Prisma declara o engine
# `debian-openssl-3.0.x`. Em Alpine (musl) o Prisma precisaria de outro binário e o app
# quebraria em runtime com "Query engine library for current platform not found".
#
# O estágio `builder` fica com as dependências completas (inclui a CLI do Prisma) e é
# reaproveitado pelo compose para rodar `migrate deploy` e o seed. O `runner` leva só o
# output `standalone` do Next — imagem pequena e sem devDependencies.

FROM node:22-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# openssl: exigido pelo engine do Prisma.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# -- Dependências ------------------------------------------------------------
# `prisma/` entra antes do `npm ci` porque o postinstall roda `prisma generate`.
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# -- Build (também é a imagem usada para migrations e seed) ------------------
FROM deps AS builder
COPY . .
# DATABASE_URL de fachada: o build não conecta no banco, mas o Prisma exige a variável.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV SESSION_SECRET="build-only"
RUN npm run build

# -- CLI do Prisma isolada (para o pre-deploy da plataforma) -----------------
# Árvore própria, num prefixo separado: copiar só `node_modules/prisma` do builder não
# funciona (a CLI puxa dependências transitivas como `effect`), e despejar o
# `node_modules` inteiro do builder no runtime jogaria fora o ganho do `standalone` e
# poderia conflitar com as versões que o Next já empacotou.
# A versão sai do package-lock.json — a mesma que gerou estas migrations, nunca a `latest`.
FROM base AS prisma-cli
WORKDIR /cli
COPY package-lock.json ./
RUN VERSAO="$(node -p "require('./package-lock.json').packages['node_modules/prisma'].version")" \
  && echo "CLI do Prisma: ${VERSAO}" \
  && npm init -y > /dev/null \
  && npm install --no-audit --no-fund "prisma@${VERSAO}"

# Poda só BINÁRIO: engines e wasm dos bancos que este projeto não usa (MySQL, SQLite,
# SQL Server, CockroachDB) e o query engine — quem consulta é o @prisma/client do app,
# não a CLI. Sobra o schema engine, que é o que `migrate deploy` precisa.
#
# Pacotes JS ficam todos. Tentei remover `typescript` e `fast-check` (28 MB) e a CLI
# quebrou com `Cannot find module 'fast-check'`: o `effect`, dependência do
# `@prisma/config`, carrega esse módulo no require da própria index. Economia pequena,
# risco de quebrar o deploy — não compensa.
RUN cd /cli/node_modules \
  && rm -f @prisma/engines/libquery_engine-* prisma/libquery_engine-* \
  && rm -f prisma/build/query_engine_bg.{mysql,sqlite,sqlserver,cockroachdb}.* \
  && rm -f prisma/build/query_compiler_bg.{mysql,sqlite,sqlserver,cockroachdb}.* \
  && du -sh /cli/node_modules

# -- Runtime -----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --create-home --shell /bin/bash feira \
  && mkdir -p /home/feira/.npm \
  && chown -R feira:nodejs /home/feira

COPY --from=builder --chown=feira:nodejs /app/public ./public
COPY --from=builder --chown=feira:nodejs /app/.next/standalone ./
COPY --from=builder --chown=feira:nodejs /app/.next/static ./.next/static

# Migrations DENTRO da imagem de runtime.
#
# Plataformas de deploy (Railway, Fly, Render) rodam o "pre-deploy command" dentro DESTA
# imagem, não do builder. O output `standalone` do Next não traz nem a CLI do Prisma nem
# a pasta `prisma/`, então `npx prisma migrate deploy` falhava duas vezes: baixava uma
# CLI nova da internet (prisma@7, incompatível com estas migrations) e depois não achava
# o schema. Copiando CLI + engines + schema do builder, o comando roda offline, na versão
# exata do projeto, e sem npm no meio — o que também elimina o EACCES de `npx` tentando
# escrever cache no HOME do usuário não-root.
COPY --from=builder --chown=feira:nodejs /app/prisma ./prisma
COPY --from=prisma-cli --chown=feira:nodejs /cli/node_modules ./.prisma-cli/node_modules
COPY --chown=feira:nodejs pre-deploy.sh ./pre-deploy.sh
RUN chmod +x /app/pre-deploy.sh

# Rede de segurança para quem digitar `npx prisma ...` no pre-deploy da plataforma.
# O npx procura `./node_modules/.bin/<cmd>` ANTES de baixar do registry: com este atalho
# ele usa a CLI 6.x que já está na imagem em vez de instalar a `latest` (prisma@7, que
# rejeita `url` no datasource com P1012) e sem escrever cache no HOME (EACCES).
RUN mkdir -p /app/node_modules/.bin \
  && printf '#!/bin/sh\nexec node /app/.prisma-cli/node_modules/prisma/build/index.js "$@"\n' \
     > /app/node_modules/.bin/prisma \
  && chmod +x /app/node_modules/.bin/prisma \
  && chown -h feira:nodejs /app/node_modules/.bin/prisma

ENV NPM_CONFIG_CACHE=/home/feira/.npm
# Sem "check de versão nova" da CLI: é rede desnecessária no meio do deploy.
ENV CHECKPOINT_DISABLE=1
ENV PRISMA_HIDE_UPDATE_MESSAGE=1

USER feira
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
