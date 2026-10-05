import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { IncomingMessage, ServerResponse } from 'node:http';
import https from 'node:https';
import tls, { type DetailedPeerCertificate } from 'node:tls';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import {
  buildPeerTlsAgent,
  buildPeerTlsIdentityMiddleware,
  buildPeerTlsServerOptions,
  peerIdentityFromCertificateChain,
  peerIdentityFromSocket,
  peerTlsRequest,
} from './peer_tls.js';
import { getPeerIdentity } from './peer_identity.js';

const execFileAsync = promisify(execFile);

const OPENSSL_CONFIG = `
oid_section = new_oids
[new_oids]
component = 1.3.6.1.4.1.59817.1
jurisdiction = 1.3.6.1.4.1.59817.2
machineId = 1.3.6.1.4.1.59817.6
[req]
distinguished_name = dn
prompt = no
[dn]
C = US
O = VotingWorks
[v3_ca]
basicConstraints = critical, CA:TRUE
keyUsage = critical, keyCertSign, cRLSign
[v3_tls_leaf]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
extendedKeyUsage = serverAuth, clientAuth
`;

interface Machine {
  machineId: string;
  component: 'admin' | 'poll-book';
  key: string;
  chain: string;
}

let dir: string;
let rootPem: string;
let admin: Machine;
let pollBook: Machine;
let forgedPollBook: Machine;

function readTestFile(name: string): string {
  return readFileSync(join(dir, name), 'utf-8');
}

async function openssl(...args: string[]): Promise<void> {
  await execFileAsync('openssl', args, { cwd: dir });
}

async function makeMachine(
  component: Machine['component'],
  machineId: string,
  leafSubject = '/C=US/O=VotingWorks/CN=vx-peer-tls'
): Promise<Machine> {
  const base = `${component}-${machineId}`;
  await openssl(
    'ecparam',
    '-name',
    'prime256v1',
    '-genkey',
    '-noout',
    '-out',
    `${base}-machine.key`
  );
  await openssl(
    'req',
    '-new',
    '-key',
    `${base}-machine.key`,
    '-config',
    'vx.cnf',
    '-subj',
    `/C=US/O=VotingWorks/component=${component}/machineId=${machineId}/jurisdiction=ca.test`,
    '-out',
    `${base}-machine.csr`
  );
  await openssl(
    'x509',
    '-req',
    '-in',
    `${base}-machine.csr`,
    '-CA',
    'root.pem',
    '-CAkey',
    'root.key',
    '-CAcreateserial',
    '-extfile',
    'vx.cnf',
    '-extensions',
    'v3_ca',
    '-days',
    '30',
    '-out',
    `${base}-machine.pem`
  );
  await openssl(
    'ecparam',
    '-name',
    'prime256v1',
    '-genkey',
    '-noout',
    '-out',
    `${base}-leaf.key`
  );
  await openssl(
    'req',
    '-new',
    '-key',
    `${base}-leaf.key`,
    '-config',
    'vx.cnf',
    '-subj',
    leafSubject,
    '-out',
    `${base}-leaf.csr`
  );
  await openssl(
    'x509',
    '-req',
    '-in',
    `${base}-leaf.csr`,
    '-CA',
    `${base}-machine.pem`,
    '-CAkey',
    `${base}-machine.key`,
    '-CAcreateserial',
    '-extfile',
    'vx.cnf',
    '-extensions',
    'v3_tls_leaf',
    '-days',
    '7',
    '-out',
    `${base}-leaf.pem`
  );
  return {
    machineId,
    component,
    key: readTestFile(`${base}-leaf.key`),
    chain: `${readTestFile(`${base}-leaf.pem`)}${readTestFile(`${base}-machine.pem`)}`,
  };
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'peer-tls-test-'));
  writeFileSync(join(dir, 'vx.cnf'), OPENSSL_CONFIG);
  await openssl(
    'ecparam',
    '-name',
    'prime256v1',
    '-genkey',
    '-noout',
    '-out',
    'root.key'
  );
  await openssl(
    'req',
    '-new',
    '-x509',
    '-key',
    'root.key',
    '-config',
    'vx.cnf',
    '-extensions',
    'v3_ca',
    '-subj',
    '/C=US/O=VotingWorks/CN=Vx Root',
    '-days',
    '30',
    '-out',
    'root.pem'
  );
  rootPem = readFileSync(join(dir, 'root.pem'), 'utf-8');
  admin = await makeMachine('admin', 'AD-01-0001');
  pollBook = await makeMachine('poll-book', 'PB-01-0001');
  forgedPollBook = await makeMachine(
    'poll-book',
    'PB-01-0001',
    '/C=US/O=VotingWorks/component=admin/machineId=AD-99-9999/CN=vx-peer-tls'
  );
}, 60_000);

function credentials(machine: Machine) {
  return { key: machine.key, cert: machine.chain, expiresAt: new Date() };
}

async function handshake(
  server: Machine,
  client: Machine | { key: string; chain: string }
): Promise<{
  serverSawIdentity: ReturnType<typeof peerIdentityFromSocket>;
  clientSawIdentity: ReturnType<typeof peerIdentityFromSocket>;
  protocol: string | null;
}> {
  return new Promise((resolve, reject) => {
    let serverSawIdentity: ReturnType<typeof peerIdentityFromSocket>;
    const tlsServer = tls.createServer(
      buildPeerTlsServerOptions(credentials(server), rootPem),
      (socket) => {
        serverSawIdentity = peerIdentityFromSocket(socket);
        socket.end();
      }
    );
    tlsServer.on('tlsClientError', reject);
    tlsServer.listen(0, '127.0.0.1', () => {
      const { port } = tlsServer.address() as AddressInfo;
      const clientSocket = tls.connect(
        {
          host: '127.0.0.1',
          port,
          key: client.key,
          cert: client.chain,
          ca: [rootPem],
          minVersion: 'TLSv1.3',
          checkServerIdentity: () => undefined,
        },
        () => {
          const clientSawIdentity = peerIdentityFromSocket(clientSocket);
          const protocol = clientSocket.getProtocol();
          clientSocket.on('close', () => {
            tlsServer.close();
            resolve({ serverSawIdentity, clientSawIdentity, protocol });
          });
        }
      );
      clientSocket.on('error', reject);
    });
  });
}

test('identity is read from the issuing machine cert on both ends of a TLS 1.3 mutual handshake', async () => {
  const result = await handshake(admin, pollBook);
  expect(result.protocol).toEqual('TLSv1.3');
  expect(result.serverSawIdentity).toEqual({
    machineId: 'PB-01-0001',
    component: 'poll-book',
    jurisdiction: 'ca.test',
  });
  expect(result.clientSawIdentity).toEqual({
    machineId: 'AD-01-0001',
    component: 'admin',
    jurisdiction: 'ca.test',
  });
});

test('a leaf whose subject claims another machine still resolves to its real issuer', async () => {
  const leafPem = forgedPollBook.chain.slice(
    0,
    forgedPollBook.chain.indexOf('-----END CERTIFICATE-----') +
      '-----END CERTIFICATE-----'.length
  );
  expect(new X509Certificate(leafPem).subject).toContain('AD-99-9999');

  const result = await handshake(admin, forgedPollBook);
  expect(result.serverSawIdentity).toEqual({
    machineId: 'PB-01-0001',
    component: 'poll-book',
    jurisdiction: 'ca.test',
  });
});

test('a client without a chain to the root is refused', async () => {
  await execFileAsync(
    'openssl',
    [
      'ecparam',
      '-name',
      'prime256v1',
      '-genkey',
      '-noout',
      '-out',
      'stranger.key',
    ],
    { cwd: dir }
  );
  await execFileAsync(
    'openssl',
    [
      'req',
      '-new',
      '-x509',
      '-key',
      'stranger.key',
      '-config',
      'vx.cnf',
      '-subj',
      '/C=US/O=Stranger',
      '-days',
      '1',
      '-out',
      'stranger.pem',
    ],
    { cwd: dir }
  );
  await expect(
    handshake(admin, {
      key: readFileSync(join(dir, 'stranger.key'), 'utf-8'),
      chain: readFileSync(join(dir, 'stranger.pem'), 'utf-8'),
    })
  ).rejects.toThrow();
});

test('peerIdentityFromCertificateChain rejects missing, self-issued, and non-machine issuers', () => {
  expect(peerIdentityFromCertificateChain(undefined)).toBeUndefined();
  expect(peerIdentityFromCertificateChain({})).toBeUndefined();
  const selfIssued: Partial<DetailedPeerCertificate> = {
    raw: Buffer.from('x'),
  };
  selfIssued.issuerCertificate = selfIssued as DetailedPeerCertificate;
  expect(peerIdentityFromCertificateChain(selfIssued)).toBeUndefined();
  const rootRaw = new X509Certificate(rootPem).raw;
  const rootAsIssuer: Partial<DetailedPeerCertificate> = { raw: rootRaw };
  expect(
    peerIdentityFromCertificateChain({
      raw: rootRaw,
      issuerCertificate: rootAsIssuer as DetailedPeerCertificate,
    })
  ).toBeUndefined();
});

test('the identity middleware exposes the identity to handlers and rejects plain http', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  const middleware = buildPeerTlsIdentityMiddleware({
    logger,
    logEventId: 'application-startup' as never,
  });
  const server = https.createServer(
    buildPeerTlsServerOptions(credentials(admin), rootPem),
    (req, res) => {
      middleware(req, res, () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(getPeerIdentity()));
      });
    }
  );
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  const agent = buildPeerTlsAgent(credentials(pollBook), rootPem);
  const response = await peerTlsRequest(`https://127.0.0.1:${port}/`, {
    method: 'GET',
    agent,
  });
  const responseBody = await new Promise<string>((resolve) => {
    let data = '';
    response.on('data', (chunk) => {
      data += chunk;
    });
    response.on('end', () => resolve(data));
  });
  expect(response.statusCode).toEqual(200);
  expect(JSON.parse(responseBody)).toEqual({
    machineId: 'PB-01-0001',
    component: 'poll-book',
    jurisdiction: 'ca.test',
  });
  agent.destroy();

  const plainResponse: {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
  } = { statusCode: 0, headers: {}, body: '' };
  const plainRequest: {
    socket: { remoteAddress: string };
    method: string;
    url: string;
  } = {
    socket: { remoteAddress: '169.254.1.2' },
    method: 'POST',
    url: '/api/x',
  };
  const plainResponseSink: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(responseText: string): void;
  } = {
    set statusCode(code: number) {
      plainResponse.statusCode = code;
    },
    setHeader(name: string, value: string) {
      plainResponse.headers[name] = value;
    },
    end(responseText: string) {
      plainResponse.body = responseText;
    },
  };
  middleware(
    plainRequest as unknown as IncomingMessage,
    plainResponseSink as unknown as ServerResponse,
    () => {
      throw new Error('next should not run');
    }
  );
  expect(plainResponse.statusCode).toEqual(403);
  expect(logger.log).toHaveBeenCalled();
  server.close();
});

afterAll(() => {
  vi.restoreAllMocks();
});
