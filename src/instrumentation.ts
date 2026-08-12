import { validarSegredo } from './lib/segredo';

export function register(): void {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV !== 'production') return;

  const problema = validarSegredo(process.env.SESSION_SECRET);
  if (problema) {
    throw new Error(
      `[boot] ${problema} Sem um segredo real qualquer pessoa forja o cookie de sessão de qualquer conta. Gere um valor com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
}
