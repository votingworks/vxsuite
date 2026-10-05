// @coverage-defer-file
import https from 'node:https';
import { buildPeerApp } from './peer_app.js';
import { PEER_PORT } from './globals.js';
import type { PeerAppContext } from './types.js';

/**
 * Starts the peer server over mutual TLS. Returns the port being listened on
 */
export function start(context: PeerAppContext): number {
  const app = buildPeerApp(context);

  const server = https.createServer(context.peerTls.serverOptions(), app);
  server.listen(PEER_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(
      `VxPollBook p2p backend running at https://localhost:${PEER_PORT}/`
    );
  });
  context.peerTls.startRenewal([server]);
  return PEER_PORT;
}
