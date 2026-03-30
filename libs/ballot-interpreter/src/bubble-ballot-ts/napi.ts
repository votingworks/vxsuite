import { join } from 'node:path';

/**
 * Type of the napi-rs native addon, derived from the generated `index.d.ts`.
 */
type NapiAddon = typeof import('../../index');

/**
 * The napi-rs native addon. The generated `index.js` at the package root
 * handles platform detection and loads the correct `.node` binary.
 *
 * The relative path resolves correctly from both source
 * (`src/bubble-ballot-ts/`) and compiled output (`build/bubble-ballot-ts/`).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires, import/no-dynamic-require, global-require
export const napi: NapiAddon = require(join(__dirname, '..', '..', 'index.js'));
