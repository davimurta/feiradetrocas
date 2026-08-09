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

# -- Runtime -----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs feira

COPY --from=builder --chown=feira:nodejs /app/public ./public
COPY --from=builder --chown=feira:nodejs /app/.next/standalone ./
COPY --from=builder --chown=feira:nodejs /app/.next/static ./.next/static

USER feira
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
