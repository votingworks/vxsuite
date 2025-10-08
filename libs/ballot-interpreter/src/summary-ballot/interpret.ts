import { ImageData } from 'canvas';
import { Result, err, ok } from '@votingworks/basics';
import {
  CompletedBallot,
  ElectionDefinition,
  SheetOf,
  mapSheet,
} from '@votingworks/types';
import {
  BALLOT_HASH_ENCODING_LENGTH,
  decodeBallot,
  decodeBallotHash,
} from '@votingworks/ballot-encoder';
import { crop } from '@votingworks/image-utils';
import { DetectQrCodeError, detectInBallot } from './utils/qrcode';
import { DetectedQrCode } from './types';
import { rotateImageData180 } from './utils/rotate';
import { findScannedDocumentInset } from './image_utils';
import { otsu } from './otsu';

export interface Interpretation {
  ballot: CompletedBallot;
  summaryBallotImage: ImageData;
  blankPageImage: ImageData;
}

export type InterpretError =
  | {
      type: 'votes-not-found';
      source: SheetOf<DetectQrCodeError>;
    }
  | {
      type: 'multiple-qr-codes';
      source: SheetOf<DetectedQrCode>;
    }
  | {
      type: 'mismatched-election';
      expectedBallotHash: string;
      actualBallotHash: string;
    }
  | {
      type: 'bmd-ballot-scanning-disabled';
    };

export type InterpretResult = Result<Interpretation, InterpretError>;

/**
 * Interprets a ballot card as a VX BMD ballot.
 */
export async function interpret(
  electionDefinition: ElectionDefinition,
  card: SheetOf<ImageData>,
  disableBmdBallotScanning: boolean = false
): Promise<InterpretResult> {
  const croppedCard = mapSheet(card, (imageData) => {
    const threshold = otsu(imageData.data);
    const inset = findScannedDocumentInset(imageData, threshold);

    return inset
      ? crop(imageData, {
          x: inset.left,
          y: inset.top,
          width: imageData.width - inset.right - inset.left,
          height: imageData.height - inset.bottom - inset.top,
        })
      : imageData;
  });

  const [frontResult, backResult] = await mapSheet(croppedCard, detectInBallot);

  if (frontResult.isErr() && backResult.isErr()) {
    return err({
      type: 'votes-not-found',
      source: [frontResult.err(), backResult.err()],
    });
  }

  if (frontResult.isOk() && backResult.isOk()) {
    return err({
      type: 'multiple-qr-codes',
      source: [frontResult.ok(), backResult.ok()],
    });
  }

  // A BMD ballot QR code was found

  if (disableBmdBallotScanning) {
    return err({
      type: 'bmd-ballot-scanning-disabled',
    });
  }

  const foundQrCode = (frontResult.ok() ?? backResult.ok()) as DetectedQrCode;
  const actualBallotHash = decodeBallotHash(foundQrCode.data);
  const expectedBallotHash = electionDefinition.ballotHash.slice(
    0,
    BALLOT_HASH_ENCODING_LENGTH
  );

  if (actualBallotHash !== expectedBallotHash) {
    return err({
      type: 'mismatched-election',
      expectedBallotHash,
      actualBallotHash:
        actualBallotHash ??
        /* istanbul ignore next - @preserve */
        '',
    });
  }

  const summaryBallotImage = frontResult.isOk()
    ? croppedCard[0]
    : croppedCard[1];
  // Orient the ballot image right side up
  if (foundQrCode.position === 'bottom') {
    rotateImageData180(summaryBallotImage);
  }

  return ok({
    ballot: decodeBallot(electionDefinition.election, foundQrCode.data),
    summaryBallotImage,
    blankPageImage: frontResult.isOk() ? croppedCard[1] : croppedCard[0],
  });
}
