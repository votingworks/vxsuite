const chalk = new Proxy((str: string) => str, {
  get: () => chalk,
}) as typeof import('chalk');

// This is emulating an existing 3rd party API, so we need to follow suit.
// eslint-disable-next-line vx/gts-no-default-exports
export default chalk;
