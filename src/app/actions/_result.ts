import { ZodError } from 'zod';
import { isDomainError } from '@/lib/errors';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(err: unknown): never | ActionResult<never> {
  if (isDomainError(err)) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  if (err instanceof ZodError) {
    return {
      ok: false,
      error: { code: 'VALIDACAO', message: err.issues.map((i) => i.message).join('; ') },
    };
  }
  throw err;
}
