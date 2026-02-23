import fs from 'node:fs';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { defineConfig } from 'vite';
import { zedbarScannerPlugin } from './vite-plugin-zedbar-scanner';

export default defineConfig({
  plugins: [react(), wasm(), zedbarScannerPlugin()],
  server: {
    port: 3100,
    host: true,
    https: {
      key: fs.readFileSync('.certs/key.pem'),
      cert: fs.readFileSync('.certs/cert.pem'),
    },
  },
});
