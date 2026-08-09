import qrcode from 'qrcode-generator';

export function QRCode({ value, size = 220 }: { value: string; size?: number }) {
  const qr = qrcode(0, 'M'); // typeNumber 0 = ajusta ao tamanho do dado; correção 'M'
  qr.addData(value);
  qr.make();

  const count = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${count} ${count}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code ${value}`}
    >
      <path d={d} fill="#20261a" />
    </svg>
  );
}
