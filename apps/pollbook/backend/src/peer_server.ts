import { buildPeerApp } from './peer_app';
import { PEER_PORT } from './globals';
import { PeerAppContext } from './types';

/**
 * Starts the server.
 */
export function start(context: PeerAppContext): void {
  const app = buildPeerApp(context);

  app.listen(PEER_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(
      `VxPollbook p2p backend running at http://localhost:${PEER_PORT}/`
    );
  });
}
