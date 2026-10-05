import { expect, test } from 'vitest';
import { sleep } from '@votingworks/basics';
import {
  assertPeerComponent,
  assertPeerMachineId,
  getPeerIdentity,
  PeerIdentityError,
  peerIdentityBeforeMiddleware,
  requirePeerIdentity,
  runWithPeerIdentity,
  type PeerIdentity,
} from './peer_identity.js';

const SCANNER: PeerIdentity = {
  machineId: 'CS-01-0001',
  component: 'central-scan',
};

test('identity is only visible inside runWithPeerIdentity', () => {
  expect(getPeerIdentity()).toBeUndefined();
  expect(() => requirePeerIdentity()).toThrow(PeerIdentityError);
  runWithPeerIdentity(SCANNER, () => {
    expect(getPeerIdentity()).toEqual(SCANNER);
    expect(requirePeerIdentity()).toEqual(SCANNER);
  });
  expect(getPeerIdentity()).toBeUndefined();
});

test('identity follows async continuations', async () => {
  await runWithPeerIdentity(SCANNER, async () => {
    await sleep(1);
    expect(getPeerIdentity()).toEqual(SCANNER);
  });
});

test('assertPeerMachineId accepts the proven ID and rejects any other', () => {
  runWithPeerIdentity(SCANNER, () => {
    expect(assertPeerMachineId('CS-01-0001')).toEqual(SCANNER);
    expect(() => assertPeerMachineId('CS-01-0002')).toThrow(
      new PeerIdentityError(
        'machine-id-mismatch',
        'Request claims machine ID CS-01-0002 but the peer is CS-01-0001'
      )
    );
  });
});

test('assertPeerComponent checks the machine type', () => {
  runWithPeerIdentity(SCANNER, () => {
    expect(assertPeerComponent(['central-scan', 'admin'])).toEqual(SCANNER);
    expect(() => assertPeerComponent(['admin'])).toThrow(PeerIdentityError);
  });
  expect(() => assertPeerComponent(['central-scan'])).toThrow(
    new PeerIdentityError(
      'identity-missing',
      'Request has no authenticated peer identity'
    )
  );
});

test('peerIdentityBeforeMiddleware checks a machineId input when present', () => {
  runWithPeerIdentity(SCANNER, () => {
    expect(() =>
      peerIdentityBeforeMiddleware({ input: { machineId: 'CS-01-0001' } })
    ).not.toThrow();
    expect(() =>
      peerIdentityBeforeMiddleware({ input: { cvrId: 'x' } })
    ).not.toThrow();
    expect(() =>
      peerIdentityBeforeMiddleware({ input: undefined })
    ).not.toThrow();
    expect(() =>
      peerIdentityBeforeMiddleware({ input: { machineId: 'AD-01-0001' } })
    ).toThrow(PeerIdentityError);
  });
});

test('PeerIdentityError carries its reason', () => {
  const error = new PeerIdentityError('identity-missing', 'nope');
  expect(error.reason).toEqual('identity-missing');
  expect(error.name).toEqual('PeerIdentityError');
  expect(error.message).toEqual('nope');
});
