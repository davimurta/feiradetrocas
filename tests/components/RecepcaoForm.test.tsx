import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecepcaoForm } from '@/components/entrada/RecepcaoForm';
import type { ActionResult } from '@/app/actions/_result';
import type { ReceberItemActionResult } from '@/app/actions/entrada';
import type { ProdutoView } from '@/server/queries';

const semItens = vi.fn(async (): Promise<ActionResult<ProdutoView[]>> => ({ ok: true, data: [] }));
const semAluno = vi.fn(async (): Promise<ActionResult<null>> => ({ ok: true, data: null }));

function sucesso(over: Partial<ReceberItemActionResult> = {}): ReceberItemActionResult {
  return {
    item: { id: 'i1', codigo: 'ITM-AAAA1111', nome: 'Livro', categoria: 'Livros', valor: 10, quantidade: 1 },
    creditado: 10,
    saldoAtual: 10,
    transacaoId: 't1',
    novo: true,
    alunoNome: 'Ana',
    alunoCriado: false,
    ...over,
  };
}

describe('RecepcaoForm (recepção)', () => {
  it('cadastra e mostra feedback de sucesso', async () => {
    const user = userEvent.setup();
    const receber = vi.fn(async (): Promise<ActionResult<ReceberItemActionResult>> => ({ ok: true, data: sucesso() }));

    render(<RecepcaoForm unidadePadrao="barroca" receber={receber} buscarItens={semItens} buscarAluno={semAluno} />);

    await user.type(screen.getByLabelText('Matrícula do aluno:'), '20240099');
    await user.type(screen.getByLabelText('Nome do item:'), 'Livro');
    await user.type(screen.getByLabelText('Valor do Item:'), '10');
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(receber).toHaveBeenCalledWith({ matricula: '20240099', nome: 'Livro', categoria: 'Livros', valor: 10, unidade: 'barroca' });
    expect(await screen.findByRole('status')).toHaveTextContent(/Creditado/);
  });

  it('mostra mensagem específica quando a action retorna DomainError', async () => {
    const user = userEvent.setup();
    const receber = vi.fn(
      async (): Promise<ActionResult<ReceberItemActionResult>> => ({ ok: false, error: { code: 'VALOR_INVALIDO', message: 'x' } }),
    );

    render(<RecepcaoForm unidadePadrao="barroca" receber={receber} buscarItens={semItens} buscarAluno={semAluno} />);
    await user.type(screen.getByLabelText('Matrícula do aluno:'), '20240099');
    await user.type(screen.getByLabelText('Nome do item:'), 'Livro');
    await user.type(screen.getByLabelText('Valor do Item:'), '10');
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Valor inválido/i);
  });

  it('valida no client (sem matrícula não chama a action)', async () => {
    const user = userEvent.setup();
    const receber = vi.fn();
    render(<RecepcaoForm unidadePadrao="barroca" receber={receber} buscarItens={semItens} buscarAluno={semAluno} />);
    await user.type(screen.getByLabelText('Nome do item:'), 'Livro');
    await user.type(screen.getByLabelText('Valor do Item:'), '10');
    await user.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/matrícula/i);
    expect(receber).not.toHaveBeenCalled();
  });

  it('autocomplete: escolher sugestão preenche categoria e valor (stacking)', async () => {
    const user = userEvent.setup();
    const buscarItens = vi.fn(
      async (): Promise<ActionResult<ProdutoView[]>> => ({
        ok: true,
        data: [{ id: 'i9', codigo: 'ITM-X', nome: 'Camiseta', categoria: 'Roupas', valor: 7, quantidade: 2 }],
      }),
    );
    render(<RecepcaoForm unidadePadrao="barroca" receber={vi.fn()} buscarItens={buscarItens} buscarAluno={semAluno} />);

    await user.type(screen.getByLabelText('Nome do item:'), 'Cami');
    const sugestao = await screen.findByRole('button', { name: /Camiseta/ });
    await user.click(sugestao);

    expect(screen.getByLabelText('Valor do Item:')).toHaveValue(7);
    expect(screen.getByLabelText('Categoria:')).toHaveValue('Roupas');
  });
});
