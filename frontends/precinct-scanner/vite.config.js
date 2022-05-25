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

    // Statically replace `process.env.NODE_DEBUG` with undefined.
    'process.env.NODE_DEBUG': JSON.stringify(undefined),
  },

  resolve: {
    alias: {
      // Map NodeJS internal modules to equivalents from NPM.
      buffer: require.resolve('buffer/'),
      // util: require.resolve('util/'),
      // zlib: require.resolve('browserify-zlib/'),
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
