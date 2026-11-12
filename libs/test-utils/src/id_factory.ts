export interface IdFactory {
  next(): string;
  reset(): void;
}

export function makeIdFactory(): IdFactory {
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
