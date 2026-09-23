// Single source of truth for the frontend→backend proxy, shared by the dev
// server (Vite `server.proxy` in vite.config.ts) and the production server
// (index.js, via setupProxy.js).

/** Request path prefixes the frontend forwards to the backend. */
export const PROXY_PATHS = ['/api', '/dock'];

/** The backend listens on the port after the frontend's. */
export function backendTarget(frontendPort = process.env.FRONTEND_PORT) {
  return `http://localhost:${Number(frontendPort || 3000) + 1}`;
}
