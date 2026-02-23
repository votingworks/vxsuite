/**
 * Vite dev server plugin that adds a /api/scan endpoint for QR code scanning.
 * Receives grayscale image data via POST, decodes QR codes using zedbar,
 * and returns raw decoded bytes as base64 (since QR data is binary, not UTF-8).
 */
import type { Plugin } from 'vite';

export function zedbarScannerPlugin(): Plugin {
  return {
    name: 'zedbar-scanner',

    configureServer(server) {
      server.middlewares.use('/api/scan', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end('Method not allowed');
          return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const body = Buffer.concat(chunks);

        try {
          const { width, height, data } = JSON.parse(body.toString('utf-8'));
          const grayscale = new Uint8Array(
            Buffer.from(data as string, 'base64')
          );

          const { scanGrayscale } = await import('zedbar');
          const results = scanGrayscale(grayscale, width, height);

          // Return raw bytes as base64 since our QR data is binary, not valid UTF-8
          const decoded = results
            .filter((r) => r.symbolType === 'QR-Code')
            .map((r) => Buffer.from(r.data).toString('base64'));

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ results: decoded }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}
