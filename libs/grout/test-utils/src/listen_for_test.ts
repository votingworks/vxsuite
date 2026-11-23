interface TestServer {
  keepAliveTimeout: number;
  address(): unknown;
}

/** Starts `app` on a free port with keep-alive expiry off, so a stalled test can't reset a reused socket. */
export function listenForTest<Server extends TestServer>(app: {
  listen(): Server;
}): { server: Server; port: number } {
  const server = app.listen();
  server.keepAliveTimeout = 0;
  const { port } = server.address() as { port: number };
  return { server, port };
}
