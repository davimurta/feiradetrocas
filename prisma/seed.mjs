// Seed de desenvolvimento/demo. Idempotente (upsert por chaves únicas).
// Rodar:  npm run db:seed          (usa .env)
// Reset determinístico (e2e): SEED_RESET=1 node --env-file=.env.test prisma/seed.mjs
import { PrismaClient } from '@prisma/client';
import { scryptSync, randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

// Mesmo formato de hash do src/lib/password.ts: "scrypt$N$r$p$salt$hash", keylen 64.
const N = Number(process.env.SCRYPT_N) || 131072;
const R = 8;
const P = 1;

function hashSenha(senha) {
  const salt = randomBytes(16).toString('hex');
  const maxmem = 128 * N * R * 2 + 1024 * 1024;
  const derived = scryptSync(senha, salt, 64, { N, r: R, p: P, maxmem }).toString('hex');
  return `scrypt$${N}$${R}$${P}$${salt}$${derived}`;
}

const carteira = (email) => email.split('@')[0].toLowerCase();

// Regra: matrícula começa com 1 → Barroca; começa com 2 → Floresta.
const usuarios = [
  { email: 'admin@cotemig.com.br', nome: 'Admin Geral', papel: 'admin', unidade: 'barroca', senha: 'admin123', saldo: 0 },
  { email: 'entrada.barroca@cotemig.com.br', nome: 'Recepção Barroca', papel: 'atendente_entrada', unidade: 'barroca', senha: 'entrada123', saldo: 0 },
  { email: 'stand.barroca@cotemig.com.br', nome: 'Stand Barroca', papel: 'atendente_stand', unidade: 'barroca', senha: 'stand123', saldo: 0 },
  { email: 'entrada.floresta@cotemig.com.br', nome: 'Recepção Floresta', papel: 'atendente_entrada', unidade: 'floresta', senha: 'entrada123', saldo: 0 },
  { email: 'stand.floresta@cotemig.com.br', nome: 'Stand Floresta', papel: 'atendente_stand', unidade: 'floresta', senha: 'stand123', saldo: 0 },
  { email: '10240001@aluno.cotemig.com.br', nome: 'Ana Aluna', papel: 'participante', unidade: 'barroca', senha: 'aluno123', saldo: 0 },
  { email: '20240002@aluno.cotemig.com.br', nome: 'Bruno Aluno', papel: 'participante', unidade: 'floresta', senha: 'aluno123', saldo: 50 },
  // Email fora do padrão de matrícula → conta pendente até o admin liberar.
  { email: 'joao.google@gmail.com', nome: 'João (Google)', papel: 'participante', unidade: 'barroca', senha: 'google123', saldo: 0, pendente: true },
];

const itens = [
  { codigo: 'ITM-SEED0001', nome: 'Livro de Matemática', categoria: 'Livros', valor: 2, quantidade: 6, unidade: 'barroca' },
  { codigo: 'ITM-SEED0002', nome: 'Camiseta do time', categoria: 'Roupas', valor: 3, quantidade: 4, unidade: 'barroca' },
  { codigo: 'ITM-SEED0003', nome: 'Quebra-cabeça 500 peças', categoria: 'Brinquedos', valor: 2, quantidade: 6, unidade: 'floresta' },
  { codigo: 'ITM-SEED0004', nome: 'Fone de ouvido', categoria: 'Eletrônicos', valor: 5, quantidade: 3, unidade: 'floresta' },
];

async function main() {
  if (process.env.SEED_RESET === '1') {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "pedidos", "transacoes", "items", "users" RESTART IDENTITY CASCADE',
    );
  }

  for (const u of usuarios) {
    const data = {
      email: u.email,
      nome: u.nome,
      papel: u.papel,
      unidade: u.unidade,
      saldo: u.saldo,
      pendente: u.pendente ?? false,
      senhaHash: hashSenha(u.senha),
      provider: 'password',
      codigoCarteira: carteira(u.email),
    };
    await prisma.user.upsert({
      where: { email: u.email },
      update: { nome: u.nome, papel: u.papel, unidade: u.unidade, pendente: u.pendente ?? false, senhaHash: data.senhaHash, provider: 'password' },
      create: data,
    });
  }

  for (const it of itens) {
    await prisma.item.upsert({
      where: { codigo: it.codigo },
      update: { quantidade: it.quantidade, unidade: it.unidade },
      create: it,
    });
  }

  console.log('Seed OK.');
  console.log('Logins (email / senha / unidade):');
  for (const u of usuarios) console.log(`  ${u.papel.padEnd(18)} ${u.email}  /  ${u.senha}  [${u.unidade}]`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
