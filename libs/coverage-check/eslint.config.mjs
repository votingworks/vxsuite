// eslint-plugin-vx tests itself under coverage-check, so coverage-check cannot
// depend on it as a package (Turbo rejects the cycle). The plugin is imported
// from its source directly.
import { recommended } from '../eslint-plugin-vx/src/index.ts';

export default [...recommended, { ignores: ['fixtures/**', '*.cjs'] }];
