import {
  BallotIdSchema,
  CastVoteRecord,
  InterpretedHmpbPage,
  PageInterpretation,
  unsafeParse,
} from '@votingworks/types';
import { Store } from '../store';
import { buildCastVoteRecord } from './build';

function isHmpbPage(
  interpretation: PageInterpretation
): interpretation is InterpretedHmpbPage {
  return interpretation.type === 'InterpretedHmpbPage';
}

export function* exportCastVoteRecords({
  store,
}: {
  store: Store;
}): Generator<CastVoteRecord> {
  const electionDefinition = store.getElectionDefinition();

  if (!electionDefinition) {
    throw new Error('no election configured');
  }

  for (const {
    id,
    batchId,
    batchLabel,
    interpretation,
  } of store.forEachResultSheet()) {
    const cvr = buildCastVoteRecord(
      id,
      batchId,
      batchLabel || '',
      (interpretation[0].type === 'InterpretedBmdPage' &&
        interpretation[0].ballotId) ||
        (interpretation[1].type === 'InterpretedBmdPage' &&
          interpretation[1].ballotId) ||
        unsafeParse(BallotIdSchema, id),
      electionDefinition.election,
      [
        {
          interpretation: interpretation[0],
          contestIds: isHmpbPage(interpretation[0])
            ? store.getContestIdsForMetadata(
                interpretation[0].metadata,
                electionDefinition
              )
            : undefined,
        },
        {
          interpretation: interpretation[1],
          contestIds: isHmpbPage(interpretation[1])
            ? store.getContestIdsForMetadata(
                interpretation[1].metadata,
                electionDefinition
              )
            : undefined,
        },
      ]
    );

    if (cvr) {
      yield cvr;
    }
  }
}
