import type { Linter } from 'eslint';
import type { VxPlugin } from '../index';
import buildRecommended from './recommended';

/**
 * Build the "react" flat config array for a given instance of the vx plugin.
 * It is `recommended` plus the React/JSX layer; see `RecommendedOptions`.
 */
export default function buildReact(plugin: VxPlugin): Linter.Config[] {
  return buildRecommended(plugin, { react: true });
}
