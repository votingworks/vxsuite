/* eslint-disable vx/gts-module-snake-case */
declare module 'esbuild-runner/register' {
  export function register(config: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  }): void;
}
