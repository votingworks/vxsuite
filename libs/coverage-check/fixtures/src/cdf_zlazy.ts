// Driver: imports PersonSchema but never calls .read().

export interface SchemaShape {
  name: string;
}

function lazyLike<T>(factory: () => T): { read: () => T } {
  return { read: factory };
}

// An inline directive on a thunk argument inside a call expression (the CDF
// generator's z.lazy emission shape).
export const PersonSchema = lazyLike(
  /* @coverage-exclude: CDF generated thunk */ () => buildPersonSchema()
);

// @coverage-exclude: CDF generated builder
function buildPersonSchema(): SchemaShape {
  return { name: 'Person' };
}
