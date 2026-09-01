// eslint-plugin-vx tests itself under coverage-check, so coverage-check cannot
// depend on it as a package (Turbo rejects the cycle). The plugin is imported
// from its build directly; `lint:self` builds it first.
import { recommended } from '../eslint-plugin-vx/build/index.js';

export default [...recommended, { ignores: ['fixtures/**', '*.cjs'] }];
