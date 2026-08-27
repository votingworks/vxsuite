/**
 * The napi-rs native addon. The generated `index.js` at the package root
 * handles platform detection and loads the correct `.node` binary; it is
 * generated in ESM form (`napi build --esm`), so it can be re-exported
 * directly.
 *
 * The relative path resolves correctly from both source
 * (`src/bubble-ballot-ts/`) and compiled output (`build/bubble-ballot-ts/`).
 */
export * as napi from '../../index.js';
