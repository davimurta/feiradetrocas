// Cria (ou promove) uma conta de ADMIN. Seguro para produção: mexe só nessa conta,
// não cria dados de demonstração.
//
// Uso:  node prisma/criar-admin.mjs <email> <senha>
// Ex.:  node prisma/criar-admin.mjs admin@cotemig.com.br umaSenhaForte
//
// Contra o banco do Railway (rode na sua máquina com a URL PÚBLICA do Postgres):
//   env DATABASE_URL="<DATABASE_PUBLIC_URL do Railway>" node prisma/criar-admin.mjs admin@... senha
import { PrismaClient } from '@prisma/client';
import { scryptSync, randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

// Mesmo formato do src/lib/password.ts: "scrypt$N$r$p$salt$hash", keylen 64.
const N = Number(process.env.SCRYPT_N) || 131072;
const R = 8;
const P = 1;

function hashSenha(senha) {
  const salt = randomBytes(16).toString('hex');
  const maxmem = 128 * N * R * 2 + 1024 * 1024;
  const chave = scryptSync(senha, salt, 64, { N, r: R, p: P, maxmem }).toString('hex');
  return `scrypt$${N}$${R}$${P}$${salt}$${chave}`;
}

const email = (process.argv[2] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const senha = process.argv[3] || process.env.ADMIN_SENHA || '';

if (!email || !email.includes('@') || senha.length < 4) {
  console.error('Uso: node prisma/criar-admin.mjs <email> <senha (min 4)>');
  process.exit(1);
}

const carteira = email.split('@')[0];

const user = await prisma.user.upsert({
  where: { email },
  // Se a conta já existe (ex.: o admin já logou uma vez), só promove e redefine a senha.
  update: { papel: 'admin', pendente: false, senhaHash: hashSenha(senha), provider: 'password' },
  // Se não existe, cria já como admin liberado.
  create: {
    email,
    nome: 'Administrador',
    papel: 'admin',
    unidade: 'barroca',
    pendente: false,
    saldo: 0,
    provider: 'password',
    senhaHash: hashSenha(senha),
    codigoCarteira: carteira,
  },
});

console.log(`✔ Admin pronto: ${user.email} (papel=${user.papel}, pendente=${user.pendente})`);
await prisma.$disconnect();
