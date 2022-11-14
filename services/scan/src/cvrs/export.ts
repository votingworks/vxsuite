import { loadImage, toDataUrl, toImageData } from '@votingworks/image-utils';
import {
  BallotIdSchema,
  BallotPageLayout,
  CastVoteRecord,
  HmpbPageInterpretation,
  InlineBallotImage,
  mapSheet,
  PageInterpretation,
  SheetOf,
  unsafeParse,
} from '@votingworks/types';
import {
  EnvironmentFlagName,
  isFeatureFlagEnabled,
  mapAsync,
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
): interpretation is HmpbPageInterpretation {
  return (
    interpretation.type === 'InterpretedHmpbPage' ||
    interpretation.type === 'UninterpretedHmpbPage'
  );
}

function isHmpbSheet(
  interpretations: SheetOf<PageInterpretation>
): interpretations is SheetOf<HmpbPageInterpretation> {
  return isHmpbPage(interpretations[0]) && isHmpbPage(interpretations[1]);
}

const CvrBallotImageScale = 0.5;

async function loadImagePathShrinkBase64(
  path: string,
  factor: number
): Promise<string> {
  const image = await loadImage(path);
  const newImageData = toImageData(image, {
    maxWidth: image.width * factor,
    maxHeight: image.height * factor,
  });
  return toDataUrl(newImageData, 'image/jpeg').slice(
    'data:image/jpeg;base64,'.length
  );
}

export async function* exportCastVoteRecords({
  store,
  skipImages,
  orderBySheetId,
}: {
  store: Store;
  skipImages?: boolean;
  orderBySheetId?: boolean;
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
  } of store.forEachResultSheet({ orderBySheetId })) {
    const frontImage: InlineBallotImage = { normalized: '' };
    const backImage: InlineBallotImage = { normalized: '' };
    const includeImages =
      isFeatureFlagEnabled(EnvironmentFlagName.WRITE_IN_ADJUDICATION) &&
      !skipImages;

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
            ({ metadata }) =>
              store.getBallotPageLayoutForMetadata(
                metadata,
                electionDefinition
              ) as BallotPageLayout
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
            frontImage.normalized = await loadImagePathShrinkBase64(
              frontFilenames.normalized,
              CvrBallotImageScale
            );
          }
        }

        if (backHasWriteIns) {
          const backFilenames = store.getBallotFilenames(id, 'back');
          if (backFilenames) {
            backImage.normalized = await loadImagePathShrinkBase64(
              backFilenames.normalized,
              CvrBallotImageScale
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
 * Export all CVRs newline-delimited JSON.
 */
export function exportCastVoteRecordsAsNdJson({
  store,
  skipImages,
  orderBySheetId,
}: {
  store: Store;
  skipImages?: boolean;
  orderBySheetId?: boolean;
}): NodeJS.ReadableStream {
  return Readable.from(
    mapAsync(
      exportCastVoteRecords({ store, skipImages, orderBySheetId }),
      (cvr) => `${JSON.stringify(cvr)}\n`
    )
  );
}
