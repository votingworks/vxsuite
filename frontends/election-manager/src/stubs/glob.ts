/**
 * A stub for the `glob` module. Since `glob` interacts with the filesystem and
 * we don't have a filesystem in the browser, we can stub it out with no ill
 * effect.
 *
 * We want to stub it out because it doesn't play well with
 * `@rollup/plugin-commonjs` as `glob` has a senseless & gratuitous dependency
 * cycle.
 *
 * @see https://github.com/isaacs/node-glob/issues/365
 */

export {};
