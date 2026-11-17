import { sleep } from '@votingworks/basics';
import type { BallotStyle, ElectionId } from '@votingworks/types';

/**
 * MOCKUP ONLY: a stand-in for finalizing an election definition, so the
 * Finalize screen can be designed and documented before the real flow exists.
 * Nothing is locked, rendered or exported.
 */

/** Which set of finalized ballots to save. */
export type FinalizedBallotsKind = 'official' | 'test';

/** Progress through the current finalize phase. */
export interface FinalizeProgress {
  readonly label: string;
  readonly progress: number;
  readonly total: number;
}

/** Where the election definition is in the finalize flow. */
export type FinalizeStatus =
  | { readonly status: 'not-finalized' }
  | { readonly status: 'finalizing'; readonly progress: FinalizeProgress }
  | { readonly status: 'finalized' };

/** Delay between fake progress steps. */
const STEP_DELAY_MS = 400;

const PHASES: ReadonlyArray<{
  label: string;
  stepsPerBallotStyle: number;
}> = [
  { label: 'Rendering official ballots', stepsPerBallotStyle: 2 },
  { label: 'Rendering test ballots', stepsPerBallotStyle: 2 },
  { label: 'Generating election package', stepsPerBallotStyle: 1 },
];

/** In-memory finalize state for the single election definition. */
export interface FinalizeMockup {
  getStatus(electionId: ElectionId): FinalizeStatus;
  start(electionId: ElectionId, ballotStyles: readonly BallotStyle[]): void;
  reset(): void;
}

/** Creates the in-memory finalize stand-in. */
export function createFinalizeMockup(): FinalizeMockup {
  let current: { electionId: ElectionId; status: FinalizeStatus } | undefined;

  async function run(
    electionId: ElectionId,
    ballotStyleCount: number
  ): Promise<void> {
    for (const { label, stepsPerBallotStyle } of PHASES) {
      const total = Math.max(1, ballotStyleCount * stepsPerBallotStyle);
      for (let progress = 0; progress <= total; progress += 1) {
        if (current?.electionId !== electionId) return;
        current = {
          electionId,
          status: {
            status: 'finalizing',
            progress: { label, progress, total },
          },
        };
        await sleep(STEP_DELAY_MS);
      }
    }
    if (current?.electionId === electionId) {
      current = { electionId, status: { status: 'finalized' } };
    }
  }

  return {
    getStatus(electionId) {
      return current?.electionId === electionId
        ? current.status
        : { status: 'not-finalized' };
    },
    start(electionId, ballotStyles) {
      current = {
        electionId,
        status: {
          status: 'finalizing',
          progress: { label: 'Starting', progress: 0, total: 1 },
        },
      };
      void run(electionId, ballotStyles.length);
    },
    reset() {
      current = undefined;
    },
  };
}
