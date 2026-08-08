import styledDefault from 'styled-components';

type Styled = typeof styledDefault.default;

/**
 * `styled` from styled-components, normalized across module systems.
 *
 * styled-components v5 ships CommonJS only, so node's ESM interop makes the
 * default import `module.exports` and the real `styled` is its `default`
 * property. Vitest and Vite, meanwhile, hand us `styled` itself — vitest
 * applies its own `interopDefault`, and Vite resolves the package's ESM build.
 * Accept whichever we were given.
 */
export const styled: Styled =
  (styledDefault as unknown as { default?: Styled }).default ??
  (styledDefault as unknown as Styled);
