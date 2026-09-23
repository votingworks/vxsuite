import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function maybeRequire(id: string) {
  try {
    return require(id);
  } catch (error) {
    if ((error as { code?: unknown }).code === 'MODULE_NOT_FOUND') {
      return undefined;
    } else {
      throw error;
    }
  }
}
