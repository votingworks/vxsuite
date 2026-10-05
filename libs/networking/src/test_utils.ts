import { Agent as HttpAgent } from 'node:http';
import type { Agent as HttpsAgent, ServerOptions } from 'node:https';
import type { PeerTlsLike } from './peer_tls.js';

/**
 * A stand-in for {@link PeerTls} for tests that run peer servers over plain http.
 */
export function mockPeerTls(): PeerTlsLike {
  const agent = new HttpAgent({ keepAlive: false }) as unknown as HttpsAgent;
  return {
    serverOptions(): ServerOptions {
      throw new Error('mockPeerTls cannot serve TLS');
    },
    getAgent() {
      return agent;
    },
    startRenewal() {},
  };
}
