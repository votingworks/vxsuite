import { safeParse } from '@votingworks/types';
import {
  decodeBackTimingMarkBits,
  decodeFrontTimingMarkBits,
} from '../accuvote';
import { Debugger } from '../debug';
import {
  decodeBottomRowTimingMarks,
  interpolateMissingTimingMarks,
} from '../timing_marks';
import {
  BackMarksMetadataSchema,
  BallotCardGeometry,
  FrontMarksMetadataSchema,
  ScannedBallotPageLayout,
} from '../types';
import { findBallotTimingMarks } from './find_ballot_timing_marks';

/**
 * Find timing marks in a ballot image and read their metadata.
 */
export function interpretPageLayout(
  imageData: ImageData,
  { geometry, debug }: { geometry: BallotCardGeometry; debug?: Debugger }
): ScannedBallotPageLayout | undefined {
  const partialMarks = findBallotTimingMarks(imageData, {
    geometry,
    debug,
  });

  if (!partialMarks) {
    return undefined;
  }

  const completeMarks = interpolateMissingTimingMarks(partialMarks, { debug });

  if (!completeMarks) {
    return undefined;
  }

  const frontMarkBits = decodeBottomRowTimingMarks(partialMarks);

  if (!frontMarkBits) {
    return undefined;
  }

  const decodedFrontMarks = decodeFrontTimingMarkBits(
    [...frontMarkBits].reverse()
  );
  const decodedBackMarks = decodeBackTimingMarkBits(
    [...frontMarkBits].reverse()
  );

  if (
    decodedFrontMarks &&
    safeParse(FrontMarksMetadataSchema, decodedFrontMarks).isOk()
  ) {
    return {
      side: 'front',
      metadata: decodedFrontMarks,
      partialMarks,
      completeMarks,
    };
  }

  if (
    decodedBackMarks &&
    safeParse(BackMarksMetadataSchema, decodedBackMarks).isOk()
  ) {
    return {
      side: 'back',
      metadata: decodedBackMarks,
      partialMarks,
      completeMarks,
    };
  }

  return undefined;
}
