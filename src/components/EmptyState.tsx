export function EmptyState({
  titulo,
  children,
}: {
  titulo: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="screen stack">
      <div className="card center stack-sm" style={{ paddingTop: 32, paddingBottom: 32 }}>
        <h2>{titulo}</h2>
        {children && <p className="muted">{children}</p>}
      </div>
    </main>
  );
}
