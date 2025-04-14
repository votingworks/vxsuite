// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function makeIdFactory() {
  let id = 0;
  return {
    next: () => {
      id += 1;
      return `test-random-id-${id}`;
    },
    reset: () => {
      id = 0;
    },
  };
}
