'use client';

import { ProdutoThumb } from '@/components/ProdutoThumb';
import { EmptyCard } from '@/components/ui';
import type { ProdutoView } from '@/server/queries';
import styles from './CatalogoGrid.module.css';

export function CatalogoGrid({
  itens,
  onEscolher,
  vazio,
}: {
  itens: ProdutoView[];
  onEscolher: (produto: ProdutoView) => void;
  vazio: string;
}) {
  if (itens.length === 0) return <EmptyCard>{vazio}</EmptyCard>;

  return (
    <div className={styles.catalogo}>
      {itens.map((p) => (
        <button
          key={p.id}
          type="button"
          className={styles.produto}
          onClick={() => onEscolher(p)}
          aria-label={`Vender ${p.nome}`}
        >
          <div className={styles.thumb}>
            <ProdutoThumb />
          </div>
          <span className={styles.cat}>{p.categoria}</span>
          <span className={styles.nome}>{p.nome}</span>
          <span className={styles.meta}>
            Preço: <b>{p.valor}</b> Fichas
          </span>
          <span className={styles.meta}>
            Estoque: <b>{p.quantidade}</b>
          </span>
        </button>
      ))}
    </div>
  );
}
