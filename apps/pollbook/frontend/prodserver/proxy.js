// Single source of truth for the frontend→backend proxy, shared by the dev
// server (Vite `server.proxy` in vite.config.ts) and the production server
// (index.js, via setupProxy.js). Kept dependency-free so Vite can inline it when
// bundling the ESM config — importing anything heavier (e.g. http-proxy-middleware)
// here is what breaks config loading under `"type": "module"`.

/** Request path prefixes the frontend forwards to the backend. */
const PROXY_PATHS = ['/api', '/dock'];

/** The backend listens on the port after the frontend's. */
function backendTarget(frontendPort = process.env.FRONTEND_PORT) {
  return `http://localhost:${Number(frontendPort || 3000) + 1}`;
}

module.exports = { PROXY_PATHS, backendTarget };
