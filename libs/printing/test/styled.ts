import styledDefault, { StyledInterface } from 'styled-components';

/**
 * `styled` from styled-components, normalized across module systems.
 *
 * styled-components v5 ships CommonJS only, so node's ESM interop makes the
 * default import `module.exports` and the real `styled` is its `default`
 * property. Vitest, meanwhile, applies its own `interopDefault` and hands us
 * `styled` itself. Accept whichever we were given.
 *
 * The type comes from the package's own `StyledInterface` rather than from
 * `typeof styledDefault.default`, so it stays correct under both CommonJS and
 * ESM type resolution — the two disagree about what a default import of a
 * CommonJS module is.
 */
const styledModule = styledDefault as unknown as StyledInterface & {
  default?: StyledInterface;
};

export const styled: StyledInterface = styledModule.default ?? styledModule;
