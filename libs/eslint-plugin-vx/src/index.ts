import type { Linter, Rule } from 'eslint';
import rules from './rules';
import buildRecommended from './configs/recommended';
import buildReact from './configs/react';

export interface VxPlugin {
  rules: Record<string, Rule.RuleModule>;
}

// The plugin object itself – consumers reference this in their flat configs.
const plugin: VxPlugin = {
  rules: rules as unknown as Record<string, Rule.RuleModule>,
};

// Build the flat config arrays, passing the plugin so configs can register it.
const recommended: Linter.Config[] = buildRecommended(plugin);
const react: Linter.Config[] = buildReact(plugin);

/**
 * Extra ignore patterns for workspace packages that need more than the
 * universal ignores baked into `recommended` / `react`.
 */
const ignores = {
  /** Vite-based frontend applications */
  frontend: [
    'prodserver/**',
    'public/**',
    'src/**/*.js',
    'config/**',
    'scripts/**',
  ] as const,

  /** Playwright integration-testing projects */
  integrationTesting: [
    'tests-examples/**',
    'prodserver/**',
    'src/**/*.js',
  ] as const,
} as const;

export default plugin;
export { recommended, react, ignores };
