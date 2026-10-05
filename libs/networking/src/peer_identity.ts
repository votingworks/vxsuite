import { AsyncLocalStorage } from 'node:async_hooks';
import type { MachineType } from '@votingworks/auth';
import type { Optional } from '@votingworks/basics';
import { UserError } from '@votingworks/grout';

/**
 * The identity of a networked peer, as proven by the machine cert that issued its TLS leaf.
 */
export interface PeerIdentity {
  readonly machineId: string;
  readonly component: MachineType;
  readonly jurisdiction?: string;
}

type PeerIdentityErrorReason =
  'identity-missing' | 'machine-id-mismatch' | 'component-not-allowed';

/**
 * Thrown when a peer request's proven identity is missing or disagrees with what the request
 * claims. Extends Grout's UserError so the caller receives a 400 with the message rather than a
 * logged server crash.
 */
export class PeerIdentityError extends UserError {
  private readonly peerIdentityErrorReason: PeerIdentityErrorReason;

  constructor(reason: PeerIdentityErrorReason, message: string) {
    super(message);
    this.name = 'PeerIdentityError';
    this.peerIdentityErrorReason = reason;
  }

  get reason(): PeerIdentityErrorReason {
    return this.peerIdentityErrorReason;
  }
}

const storage = new AsyncLocalStorage<PeerIdentity>();

/**
 * Runs `fn` with `identity` available to everything in its async continuation.
 */
export function runWithPeerIdentity<T>(identity: PeerIdentity, fn: () => T): T {
  return storage.run(identity, fn);
}

/**
 * The proven identity of the peer whose request is being handled, if any.
 */
export function getPeerIdentity(): Optional<PeerIdentity> {
  return storage.getStore();
}

/**
 * The proven identity of the peer whose request is being handled.
 */
export function requirePeerIdentity(): PeerIdentity {
  const identity = getPeerIdentity();
  if (!identity) {
    throw new PeerIdentityError(
      'identity-missing',
      'Request has no authenticated peer identity'
    );
  }
  return identity;
}

/**
 * Asserts that the machine ID a request claims is the one its TLS identity proves.
 */
export function assertPeerMachineId(claimedMachineId: string): PeerIdentity {
  const identity = requirePeerIdentity();
  if (identity.machineId !== claimedMachineId) {
    throw new PeerIdentityError(
      'machine-id-mismatch',
      `Request claims machine ID ${claimedMachineId} but the peer is ${identity.machineId}`
    );
  }
  return identity;
}

/**
 * Asserts that the requesting peer is one of the allowed machine types.
 */
export function assertPeerComponent(
  allowedComponents: readonly MachineType[]
): PeerIdentity {
  const identity = requirePeerIdentity();
  if (!allowedComponents.includes(identity.component)) {
    throw new PeerIdentityError(
      'component-not-allowed',
      `Peer ${identity.machineId} is a ${identity.component}, which may not call this method`
    );
  }
  return identity;
}

/**
 * A Grout `before` middleware that rejects any call whose `machineId` input disagrees with the
 * proven peer identity.
 */
export function peerIdentityBeforeMiddleware({
  input,
}: {
  input?: object;
}): void {
  if (input && 'machineId' in input && typeof input.machineId === 'string') {
    assertPeerMachineId(input.machineId);
  }
}
