import {
  interpret,
  QrCodePageResult,
} from '@votingworks/ballot-interpreter-vx';
import { loadImageData } from '@votingworks/image-utils';
import {
  BallotMetadata,
  BallotType,
  ElectionDefinition,
  mapSheet,
  PageInterpretation,
  PrecinctSelection,
  SheetOf,
} from '@votingworks/types';
import { time } from '@votingworks/utils';
import { ImageData } from 'canvas';
import makeDebug from 'debug';

const debug = makeDebug('scan:interpreter');

export interface InterpretFileParams {
  readonly ballotImagePath: string;
  readonly detectQrcodeResult: QrCodePageResult;
}

export interface InterpretFileResult {
  interpretation: PageInterpretation;
  normalizedImage?: ImageData;
}

export interface InterpreterOptions {
  electionDefinition: ElectionDefinition;
  precinctSelection: PrecinctSelection;
  testMode: boolean;
}

export async function interpretSheet(
  { electionDefinition, precinctSelection, testMode }: InterpreterOptions,
  sheet: SheetOf<string>
): Promise<SheetOf<InterpretFileResult>> {
  const timer = time(debug, `interpretSheet: ${sheet.join(', ')}`);

  const interpretResult = await interpret(
    electionDefinition,
    await mapSheet(sheet, (ballotImagePath) => loadImageData(ballotImagePath))
  );

  if (interpretResult.isErr()) {
    const error = interpretResult.err();
    if (error.type === 'mismatched-election') {
      return [
        {
          interpretation: {
            type: 'InvalidElectionHashPage',
            expectedElectionHash: error.expectedElectionHash,
            actualElectionHash: error.actualElectionHash,
          },
        },
        {
          interpretation: {
            type: 'InvalidElectionHashPage',
            expectedElectionHash: error.expectedElectionHash,
            actualElectionHash: error.actualElectionHash,
          },
        },
      ];
    }

    const [frontReason, backReason] = error.source;
    return [
      {
        interpretation: {
          type: 'UnreadablePage',
          reason: JSON.stringify(frontReason),
        },
      },
      {
        interpretation: {
          type: 'UnreadablePage',
          reason: JSON.stringify(backReason),
        },
      },
    ];
  }

  const { ballot } = interpretResult.ok();
  let front: InterpretFileResult;

  try {
    const metadata: BallotMetadata = {
      electionHash: ballot.electionHash,
      ballotType: BallotType.Standard,
      locales: { primary: 'en-US' },
      ballotStyleId: ballot.ballotStyleId,
      precinctId: ballot.precinctId,
      isTestMode: ballot.isTestMode,
    };

    front = {
      interpretation: {
        type: 'InterpretedBmdPage',
        ballotId: ballot.ballotId,
        metadata,
        votes: ballot.votes,
      },
    };

    if (front.interpretation.type === 'InterpretedBmdPage') {
      if (front.interpretation.metadata.isTestMode !== testMode) {
        front = {
          interpretation: {
            type: 'InvalidTestModePage',
            metadata: front.interpretation.metadata,
          },
        };
      } else if (
        precinctSelection.kind !== 'AllPrecincts' &&
        front.interpretation.metadata.precinctId !==
          precinctSelection.precinctId
      ) {
        front = {
          interpretation: {
            type: 'InvalidPrecinctPage',
            metadata: front.interpretation.metadata,
          },
        };
      }
    }

    return [
      front,
      {
        interpretation: {
          type: 'BlankPage',
        },
      },
    ];
  } finally {
    timer.end();
  }
}
