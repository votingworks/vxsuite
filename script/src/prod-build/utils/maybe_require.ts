export function maybeRequire(id: string) {
  try {
    return require(id);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      return undefined;
    } else {
      throw error;
    }
  }
}
