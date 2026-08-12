import { it, expect } from 'vitest';
import { Papel } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { criarReporte, definirBloqueio } from '@/domain/reporte';
import { criarPedido } from '@/domain/pedido';
import { entrarComSenha } from '@/domain/auth';
import { hashSenha } from '@/lib/password';
import { listarReportes } from '@/server/queries';
import { describeDb } from '../helpers/db';
import { criarUsuario, criarItem, criarAtendente } from '../helpers/factories';

describeDb('Reportes / bloqueio (integração, Postgres real)', () => {
  it('criarReporte registra a denúncia contra o comprador do pedido', async () => {
    const atendente = await criarAtendente(Papel.atendente_stand, 'barroca');
    const comprador = await criarUsuario({ saldo: 100, nome: 'Ana' });
    const item = await criarItem({ valor: 10, quantidade: 2 });
    const pedido = await criarPedido(prisma, { itemId: item.id, compradorId: comprador.id, atendenteId: atendente.id, unidade: 'barroca' });

    const rep = await criarReporte(prisma, { pedidoId: pedido.pedidoId, reportanteId: atendente.id, motivo: 'furto', descricao: 'não pagou' });
    expect(rep.reportadoNome).toBe('Ana');

    const lista = await listarReportes();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({
      motivo: 'furto',
      reportadoMatricula: comprador.codigoCarteira,
      reportadoNome: 'Ana',
      reportadoBloqueado: false,
    });
  });

  it('definirBloqueio impede o login por senha da conta bloqueada', async () => {
    process.env.SCRYPT_N = '16384';
    const u = await criarUsuario({
      email: 'bloq@aluno.cotemig.com.br',
      senhaHash: await hashSenha('segredo'),
      provider: 'password',
    });

    await definirBloqueio(prisma, { userId: u.id, bloqueado: true });
    await expect(entrarComSenha(prisma, { email: 'bloq@aluno.cotemig.com.br', senha: 'segredo' })).rejects.toMatchObject({ code: 'CONTA_BLOQUEADA' });

    await definirBloqueio(prisma, { userId: u.id, bloqueado: false });
    const logado = await entrarComSenha(prisma, { email: 'bloq@aluno.cotemig.com.br', senha: 'segredo' });
    expect(logado.id).toBe(u.id);
  });

  it('bloquear derruba as sessões abertas da conta', async () => {
    const u = await criarUsuario({ email: 'derruba@aluno.cotemig.com.br' });
    expect(u.sessionVersion).toBe(0);

    await definirBloqueio(prisma, { userId: u.id, bloqueado: true });
    const bloqueado = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(bloqueado.sessionVersion).toBe(1);
  });
});
