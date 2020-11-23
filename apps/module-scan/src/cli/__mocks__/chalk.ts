const chalk = new Proxy((str: string) => str, {
  get: (): typeof chalk => chalk,
}) as typeof import('chalk')

export default chalk
