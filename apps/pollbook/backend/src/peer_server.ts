import { buildPeerApp } from './peer_app.js';
import { PEER_PORT } from './globals.js';
import { PeerAppContext } from './types.js';

/**
 * Starts the server. Returns the port being listened on
 */
export function start(context: PeerAppContext): number {
  const app = buildPeerApp(context);

  app.listen(PEER_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(
      `VxPollBook p2p backend running at http://localhost:${PEER_PORT}/`
    );
  });
  return PEER_PORT;
}
