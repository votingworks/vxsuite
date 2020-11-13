const chalk = new Proxy((str: string) => str, {
  get: () => chalk,
}) as typeof import('chalk')

export default chalk
