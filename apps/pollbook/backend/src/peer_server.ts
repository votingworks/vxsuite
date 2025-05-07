import { buildPeerApp } from './peer_app';
import { PEER_PORT } from './globals';
import { PeerAppContext } from './types';

/**
 * Starts the server. Returns the port being listened on
 */
export function start(context: PeerAppContext): number {
  const app = buildPeerApp(context);

  app.listen(PEER_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(
      `VxPollbook p2p backend running at http://localhost:${PEER_PORT}/`
    );
  });
  return PEER_PORT;
}
