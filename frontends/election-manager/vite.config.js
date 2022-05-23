import { join } from 'path';
import { defineConfig } from 'vite';
import { BUILD_DIR } from './prodserver/constants';
import { setupServer } from './prodserver/server';

export default defineConfig({
  build: {
    outDir: BUILD_DIR,
  },

  // These are not syntax-aware replacements, so don't be clever with how you
  // use them.
  define: {
    // Statically replace `process.env.NODE_ENV` with "development".
    'process.env.NODE_ENV': JSON.stringify('development'),
  },

  resolve: {
    alias: {
      // Map NodeJS internal modules to equivalents from NPM.
      buffer: require.resolve('buffer/'),
      util: require.resolve('util/'),
      zlib: require.resolve('browserify-zlib/'),

      // Stub the `glob` module (https://github.com/isaacs/node-glob/issues/365).
      glob: join(__dirname, 'src/stubs/glob.ts'),
    },
  },

  plugins: [
    {
      name: 'custom server config',
      configureServer(server) {
        setupServer(server.middlewares);
      },
    },
  ],
});
