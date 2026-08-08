import styledDefault, { StyledInterface } from 'styled-components';

/**
 * `styled` from styled-components, normalized across module systems.
 *
 * styled-components v5 ships CommonJS only, so node's ESM interop makes the
 * default import `module.exports` and the real `styled` is its `default`
 * property. Vitest and Vite, meanwhile, hand us `styled` itself — vitest
 * applies its own `interopDefault`, and Vite resolves the package's ESM build.
 * Accept whichever we were given.
 *
 * The type comes from the package's own `StyledInterface` rather than from
 * `typeof styledDefault.default`, so it stays correct under both CommonJS and
 * ESM type resolution — the two disagree about what a default import of a
 * CommonJS module is.
 *
 * Named imports (`css`, `keyframes`, `ThemeProvider`, …) need no such handling:
 * node's CommonJS named-export detection resolves those correctly.
 */
const styledModule = styledDefault as unknown as StyledInterface & {
  default?: StyledInterface;
};

export const styled: StyledInterface =
  /* istanbul ignore next - only one branch is reachable per loader */
  styledModule.default ?? styledModule;
