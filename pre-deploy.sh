#!/bin/sh
# Comando de pre-deploy: aplica as migrations pendentes antes do app novo entrar no ar.
#
# Use exatamente isto no campo "Pre-Deploy Command" da plataforma:
#
#     /app/pre-deploy.sh
#
# Por que não `npx prisma migrate deploy`:
#   - `npx` baixaria a CLI da internet (pegando prisma@7, incompatível com estas
#     migrations) e tentaria escrever cache no HOME — o que dá EACCES rodando como o
#     usuário não-root `feira`;
#   - a CLI baixada não enxergaria `prisma/schema.prisma`, porque o `npx` roda a partir
#     de um diretório temporário.
# Aqui chamamos o binário que já veio na imagem, com o caminho do schema explícito.
set -e

PRISMA_CLI="${PRISMA_CLI:-/app/.prisma-cli/node_modules/prisma/build/index.js}"
SCHEMA="${PRISMA_SCHEMA:-/app/prisma/schema.prisma}"

if [ ! -f "$PRISMA_CLI" ]; then
  echo "pre-deploy: CLI do Prisma não encontrada em $PRISMA_CLI" >&2
  echo "pre-deploy: a imagem foi construída a partir do estágio 'runner' do Dockerfile?" >&2
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "pre-deploy: DATABASE_URL não definida." >&2
  exit 1
fi

echo "pre-deploy: aplicando migrations…"
exec node "$PRISMA_CLI" migrate deploy --schema "$SCHEMA"
