import { loadBallotImageBase64 } from '@votingworks/backend';
import { iter } from '@votingworks/basics';
import {
  BallotIdSchema,
  BallotPageLayout,
  CastVoteRecord,
  InterpretedHmpbPage,
  InlineBallotImage,
  mapSheet,
  PageInterpretation,
  SheetOf,
  unsafeParse,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { Readable } from 'stream';
import { Store } from '../store';
import {
  addBallotImagesToCvr,
  buildCastVoteRecord,
  cvrHasWriteIns,
} from './build';

function isHmpbPage(
  interpretation: PageInterpretation
): interpretation is InterpretedHmpbPage {
  return interpretation.type === 'InterpretedHmpbPage';
}

function isHmpbSheet(
  interpretations: SheetOf<PageInterpretation>
): interpretations is SheetOf<InterpretedHmpbPage> {
  return isHmpbPage(interpretations[0]) && isHmpbPage(interpretations[1]);
}

export async function* exportCastVoteRecords({
  store,
  skipImages,
}: {
  store: Store;
  skipImages?: boolean;
}): AsyncGenerator<CastVoteRecord> {
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
    const frontImage: InlineBallotImage = { normalized: '' };
    const backImage: InlineBallotImage = { normalized: '' };
    const includeImages =
      isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.WRITE_IN_ADJUDICATION
      ) && !skipImages;

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
      ],
      includeImages && isHmpbSheet(interpretation)
        ? mapSheet(
            interpretation,
            ({ metadata, layout }) =>
              layout ??
              (store.getBallotPageLayoutForMetadata(
                metadata,
                electionDefinition
              ) as BallotPageLayout)
          )
        : undefined
    );

    if (cvr) {
      let cvrMaybeWithBallotImages = cvr;

      // if write-in adjudication & there are write-ins in this CVR, we augment record with ballot images
      if (includeImages && isHmpbSheet(interpretation)) {
        const [frontHasWriteIns, backHasWriteIns] = cvrHasWriteIns(
          electionDefinition.election,
          cvr
        );
        if (frontHasWriteIns) {
          const frontFilenames = store.getBallotFilenames(id, 'front');
          if (frontFilenames) {
            frontImage.normalized = await loadBallotImageBase64(
              frontFilenames.normalized
            );
          }
        }

        if (backHasWriteIns) {
          const backFilenames = store.getBallotFilenames(id, 'back');
          if (backFilenames) {
            backImage.normalized = await loadBallotImageBase64(
              backFilenames.normalized
            );
          }

          cvrMaybeWithBallotImages = addBallotImagesToCvr(cvr, [
            frontImage,
            backImage,
          ]);
        }
      }

      yield cvrMaybeWithBallotImages;
    }
  }
}

/**
 * Export all CVRs as a newline-delimited JSON stream.
 */
export function exportCastVoteRecordsAsNdJson({
  store,
  skipImages,
}: {
  store: Store;
  skipImages?: boolean;
}): NodeJS.ReadableStream {
  return Readable.from(
    iter(exportCastVoteRecords({ store, skipImages })).map(
      (cvr) => `${JSON.stringify(cvr)}\n`
    )
  );
}
