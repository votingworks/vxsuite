const fs = require('node:fs');
const esbuild = require('esbuild');
function compileTs(module, filename) {
  const src = fs.readFileSync(filename, 'utf8');
  const { code } = esbuild.transformSync(src, {
    loader: filename.endsWith('.tsx') ? 'tsx' : 'ts',
    format: 'cjs',
    target: 'node20',
    sourcefile: filename,
    sourcemap: 'inline',
  });
  module._compile(code, filename);
}
require.extensions['.ts'] = compileTs;
require.extensions['.tsx'] = compileTs;
