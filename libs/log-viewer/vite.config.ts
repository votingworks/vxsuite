import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Alias, defineConfig } from 'vite';

function getWorkspaceAliases(root: string): Alias[] {
  const stdout = execFileSync(
    'pnpm',
    ['recursive', 'list', '--depth=-1', '--porcelain'],
    { cwd: root, encoding: 'utf-8' }
  );

  const aliases: Alias[] = [];
  for (const line of stdout.split('\n')) {
    const rel = relative(root, line.trim());
    if (!rel) continue;

    const pkgPath = join(root, rel, 'package.json');
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.main || pkg.module) {
        aliases.push({
          find: pkg.name,
          replacement: join(root, rel, 'src/index.ts'),
        });
      }
    } catch {
      // skip packages without valid package.json
    }
  }
  return aliases;
}

export default defineConfig(() => {
  const workspaceRootPath = join(__dirname, '../..');
  const aliases = getWorkspaceAliases(workspaceRootPath);

  return {
    build: {
      outDir: 'build',
      minify: false,
    },

    define: {
      'process.env.NODE_DEBUG': 'undefined',
      'process.platform': JSON.stringify('browser'),
      'process.version': JSON.stringify(process.version),
      global: 'globalThis',
    },

    resolve: {
      alias: [
        { find: 'buffer', replacement: require.resolve('buffer/') },
        { find: 'node:buffer', replacement: require.resolve('buffer/') },
        { find: 'fs', replacement: join(__dirname, './src/stubs/fs.ts') },
        { find: 'node:fs', replacement: join(__dirname, './src/stubs/fs.ts') },
        { find: 'path', replacement: require.resolve('path-browserify') },
        { find: 'node:path', replacement: require.resolve('path-browserify') },
        { find: 'os', replacement: join(__dirname, './src/stubs/os.ts') },
        { find: 'node:os', replacement: join(__dirname, './src/stubs/os.ts') },
        { find: 'util', replacement: require.resolve('util/') },
        { find: 'node:util', replacement: require.resolve('util/') },
        ...aliases,
      ],
    },

    plugins: [react()],

    server: {
      port: 3456,
      strictPort: true,
    },
  };
});
