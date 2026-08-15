import { join } from 'node:path';

/**
 * Type of the napi-rs native addon, derived from the generated `index.d.ts`.
 */
type NapiAddon = typeof import('../index');

/**
 * The napi-rs native addon. The generated `index.js` at the package root
 * handles platform detection and loads the correct `.node` binary.
 *
 * The relative path resolves from both source (`src/`) and compiled output
 * (`build/`), which sit at the same depth.
 */
// eslint-disable-next-line import/no-dynamic-require, global-require
export const napi: NapiAddon = require(join(__dirname, '..', 'index.js'));
