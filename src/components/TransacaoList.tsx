import { cx } from '@/lib/cx';
import { formatarDataHora, ROTULO_TRANSACAO, sinalTransacao } from '@/lib/formato';
import { EmptyCard } from '@/components/ui';
import styles from './TransacaoList.module.css';

export interface TransacaoItem {
  id: string;
  tipo: string;
  valor: number;
  quantidade?: number;
  createdAt: Date | string;
  itemNome?: string | null;
  usuarioNome?: string | null;
}

export function TransacaoList({ itens, vazio = 'Nenhuma transação ainda.' }: { itens: TransacaoItem[]; vazio?: string }) {
  if (itens.length === 0) return <EmptyCard>{vazio}</EmptyCard>;

  return (
    <div className={styles.rows}>
      {itens.map((t) => {
        const { debito, magnitude } = sinalTransacao(t.tipo, t.valor);
        const rotulo = ROTULO_TRANSACAO[t.tipo] ?? t.tipo;
        return (
          <div key={t.id} className={styles.line}>
            <div className={styles.meta}>
              <strong>{t.itemNome ?? rotulo}</strong>
              <span className={cx('muted', styles.sub)}>
                {rotulo}
                {t.quantidade && t.quantidade > 1 ? ` ×${t.quantidade}` : ''}
                {t.usuarioNome ? ` · ${t.usuarioNome}` : ''} · {formatarDataHora(t.createdAt)}
              </span>
            </div>
            <span className={cx(styles.amount, debito ? styles.debit : styles.credit)}>
              {debito ? '−' : '+'}
              {magnitude}
              <span className={styles.un}> Fichas</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
