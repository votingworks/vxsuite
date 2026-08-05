// Driver: imports PersonSchema but never calls .read().
// Locks: the CDF generator emission shape — inline flag on a thunk argument
// inside a call expression (z.lazy pattern).

export interface SchemaShape {
  name: string;
}

function lazyLike<T>(factory: () => T): { read: () => T } {
  return { read: factory };
}

export const PersonSchema = lazyLike(
  /* @coverage-exclude: CDF generated thunk */ () => buildPersonSchema()
);

// @coverage-exclude: CDF generated builder
function buildPersonSchema(): SchemaShape {
  return { name: 'Person' };
}
