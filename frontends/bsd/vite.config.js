import { defineConfig } from 'vite';
import { BUILD_DIR } from './prodserver/constants';
import { setupServer } from './prodserver/server';

export default defineConfig({
  build: {
    outDir: BUILD_DIR,
  },

  define: {
    // Statically replace `process.env.NODE_ENV` with "development". This is not
    // a syntax-aware replacement, so don't be clever with how you use
    // `process.env`.
    'process.env.NODE_ENV': '"development"',
  },

  resolve: {
    alias: {
      // Map NodeJS internal "buffer" package to "buffer" from NPM.
      //
      // NOTE: The trailing slash is important! Without it, the result will be
      // "buffer", which refers to the NodeJS internal package.
      buffer: require.resolve('buffer/'),
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
