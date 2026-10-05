import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  Agent,
  request,
  type RequestOptions,
  type Server as HttpsServer,
  type ServerOptions,
} from 'node:https';
import type { DetailedPeerCertificate, TLSSocket } from 'node:tls';
import {
  constructPeerTlsConfig,
  mintPeerTlsCredentials,
  type MachineType,
  type PeerTlsConfig,
  type PeerTlsCredentials,
  VX_CUSTOM_CERT_FIELD,
} from '@votingworks/auth';
import type { Optional } from '@votingworks/basics';
import type { BaseLogger, LogEventId } from '@votingworks/logging';
import { rootDebug } from './debug.js';
import { type PeerIdentity, runWithPeerIdentity } from './peer_identity.js';

const debug = rootDebug.extend('peer-tls');

const MACHINE_TYPES: readonly MachineType[] = [
  'admin',
  'central-scan',
  'mark',
  'mark-scan',
  'poll-book',
  'print',
  'scan',
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function isMachineType(value: string): value is MachineType {
  return (MACHINE_TYPES as readonly string[]).includes(value);
}

function subjectFields(cert: X509Certificate): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of cert.subject.split('\n')) {
    const separatorIndex = line.indexOf('=');
    if (separatorIndex > 0) {
      fields.set(line.slice(0, separatorIndex), line.slice(separatorIndex + 1));
    }
  }
  return fields;
}

/**
 * Reads a peer's identity from the machine cert that issued its TLS leaf. The leaf's own subject
 * is never consulted: a machine can sign a leaf claiming to be anyone, but only its own cert is
 * signed by VotingWorks.
 */
export function peerIdentityFromCertificateChain(
  leaf?: Partial<DetailedPeerCertificate>
): Optional<PeerIdentity> {
  const issuer = leaf?.issuerCertificate;
  if (!leaf?.raw || !issuer?.raw || issuer === leaf) {
    return undefined;
  }
  const fields = subjectFields(new X509Certificate(issuer.raw));
  const component = fields.get(VX_CUSTOM_CERT_FIELD.COMPONENT);
  const machineId = fields.get(VX_CUSTOM_CERT_FIELD.MACHINE_ID);
  if (!component || !machineId || !isMachineType(component)) {
    return undefined;
  }
  const jurisdiction = fields.get(VX_CUSTOM_CERT_FIELD.JURISDICTION);
  return jurisdiction
    ? { machineId, component, jurisdiction }
    : { machineId, component };
}

/**
 * Reads the authenticated peer identity from a mutually authenticated TLS socket.
 */
export function peerIdentityFromSocket(
  socket: TLSSocket
): Optional<PeerIdentity> {
  if (!socket.authorized) {
    return undefined;
  }
  return peerIdentityFromCertificateChain(socket.getPeerCertificate(true));
}

function isTlsSocket(socket: IncomingMessage['socket']): socket is TLSSocket {
  return 'encrypted' in socket && socket.encrypted === true;
}

/**
 * Middleware for a peer API server: resolves the caller's identity from the TLS handshake and
 * makes it available via {@link getPeerIdentity} for the rest of the request. Requests with no
 * authenticated identity are rejected.
 */
export function buildPeerTlsIdentityMiddleware({
  logger,
  logEventId,
}: {
  logger: BaseLogger;
  logEventId: LogEventId;
}): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  return (req, res, next) => {
    const identity = isTlsSocket(req.socket)
      ? peerIdentityFromSocket(req.socket)
      : undefined;
    if (!identity) {
      logger.log(logEventId, 'system', {
        message: `Rejected peer request ${req.method ?? ''} ${req.url ?? ''} from ${req.socket.remoteAddress ?? 'unknown'}: no authenticated peer identity.`,
        disposition: 'failure',
      });
      res.statusCode = 403;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ message: 'Peer identity required' }));
      return;
    }
    runWithPeerIdentity(identity, next);
  };
}

/**
 * Options for an https server that requires every client to present a chain to the VotingWorks
 * root.
 */
export function buildPeerTlsServerOptions(
  credentials: PeerTlsCredentials,
  vxCertAuthorityCertPem: string
): ServerOptions {
  return {
    key: credentials.key,
    cert: credentials.cert,
    ca: [vxCertAuthorityCertPem],
    requestCert: true,
    rejectUnauthorized: true,
    minVersion: 'TLSv1.3',
  };
}

/**
 * An https agent that presents this machine's chain and trusts only the VotingWorks root. Peers
 * are addressed by ephemeral link-local IP, so server hostname checking is disabled; identity is
 * read from the chain instead.
 */
export function buildPeerTlsAgent(
  credentials: PeerTlsCredentials,
  vxCertAuthorityCertPem: string
): Agent {
  return new Agent({
    keepAlive: true,
    key: credentials.key,
    cert: credentials.cert,
    ca: [vxCertAuthorityCertPem],
    minVersion: 'TLSv1.3',
    checkServerIdentity: () => undefined,
  });
}

/**
 * Makes a raw https request to a peer with the given agent, resolving with the response once
 * headers arrive. Used for the few non-Grout endpoints that stream zip files.
 */
export function peerTlsRequest(
  url: string,
  {
    agent,
    method,
    headers,
    body,
    timeoutMs,
  }: {
    agent: Agent;
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: Buffer;
    timeoutMs?: number;
  }
): Promise<IncomingMessage> {
  const options: RequestOptions = {
    agent,
    method,
    headers,
    timeout: timeoutMs,
  };
  return new Promise((resolve, reject) => {
    const req = request(url, options, resolve);
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Request to ${url} timed out`));
    });
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * The parts of {@link PeerTls} that peer servers and clients depend on, so tests can substitute
 * plain-http stand-ins.
 */
export interface PeerTlsLike {
  serverOptions(): ServerOptions;
  getAgent(): Agent;
  startRenewal(servers: HttpsServer[]): void;
}

/**
 * Holds a machine's peer TLS credentials, renewing the leaf before it expires and swapping the
 * new chain into the running servers and client agent.
 */
export class PeerTls implements PeerTlsLike {
  private readonly config: PeerTlsConfig;
  private readonly vxCertAuthorityCertPem: string;
  private credentials: PeerTlsCredentials;
  private agent: Agent;
  private renewalTimer?: NodeJS.Timeout;

  private constructor(
    config: PeerTlsConfig,
    vxCertAuthorityCertPem: string,
    credentials: PeerTlsCredentials
  ) {
    this.config = config;
    this.vxCertAuthorityCertPem = vxCertAuthorityCertPem;
    this.credentials = credentials;
    this.agent = buildPeerTlsAgent(credentials, vxCertAuthorityCertPem);
  }

  static async create(
    config: PeerTlsConfig = constructPeerTlsConfig()
  ): Promise<PeerTls> {
    const vxCertAuthorityCertPem = readFileSync(
      config.vxCertAuthorityCertPath,
      'utf-8'
    );
    const credentials = await mintPeerTlsCredentials(config);
    debug(
      'Minted peer TLS leaf expiring %s',
      credentials.expiresAt.toISOString()
    );
    return new PeerTls(config, vxCertAuthorityCertPem, credentials);
  }

  serverOptions(): ServerOptions {
    return buildPeerTlsServerOptions(
      this.credentials,
      this.vxCertAuthorityCertPem
    );
  }

  getAgent(): Agent {
    return this.agent;
  }

  getExpiresAt(): Date {
    return this.credentials.expiresAt;
  }

  async renew(): Promise<void> {
    this.credentials = await mintPeerTlsCredentials(this.config);
    const previousAgent = this.agent;
    this.agent = buildPeerTlsAgent(
      this.credentials,
      this.vxCertAuthorityCertPem
    );
    previousAgent.destroy();
    debug(
      'Renewed peer TLS leaf, now expiring %s',
      this.credentials.expiresAt.toISOString()
    );
  }

  startRenewal(
    servers: HttpsServer[],
    {
      checkIntervalMs = HOUR_MS,
      renewBeforeExpiryMs = DAY_MS,
    }: { checkIntervalMs?: number; renewBeforeExpiryMs?: number } = {}
  ): void {
    this.stopRenewal();
    this.renewalTimer = setInterval(() => {
      if (
        this.credentials.expiresAt.getTime() - Date.now() >
        renewBeforeExpiryMs
      ) {
        return;
      }
      void this.renew().then(() => {
        for (const server of servers) {
          server.setSecureContext(this.serverOptions());
        }
      });
    }, checkIntervalMs);
    this.renewalTimer.unref();
  }

  stopRenewal(): void {
    if (this.renewalTimer) {
      clearInterval(this.renewalTimer);
      this.renewalTimer = undefined;
    }
  }
}
