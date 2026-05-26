import { expect, test, vi } from 'vite-plus/test';
import { LogEventId, mockLogger } from '@votingworks/logging';
import {
  AdjudicationReason,
  BallotMetadata,
  BallotType,
  InterpretedHmpbPage,
} from '@votingworks/types';
import { logSheetAdjudicationInfo } from './logging';

const metadata: BallotMetadata = {
  ballotStyleId: '12',
  ballotType: BallotType.Precinct,
  ballotHash: 'abcdef',
  isTestMode: false,
  precinctId: '23',
};

function hmpbPage(
  enabledReasons: AdjudicationReason[],
  requiresAdjudication: boolean
): InterpretedHmpbPage {
  return {
    type: 'InterpretedHmpbPage',
    metadata: { ...metadata, pageNumber: 1 },
    markInfo: { ballotSize: { width: 1, height: 1 }, marks: [] },
    adjudicationInfo: {
      enabledReasons,
      enabledReasonInfos: [],
      ignoredReasonInfos: [],
      requiresAdjudication,
    },
    votes: {},
    layout: {
      pageSize: { width: 1, height: 1 },
      metadata: { ...metadata, pageNumber: 1 },
      contests: [],
    },
  };
}

test('logs error page types when present', async () => {
  const logger = mockLogger({ fn: vi.fn });
  await logSheetAdjudicationInfo(logger, [
    {
      type: 'InvalidBallotHashPage',
      actualBallotHash: 'a',
      expectedBallotHash: 'b',
    },
    { type: 'BlankPage' },
  ]);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'unknown',
    {
      message:
        'Sheet scanned that has unresolvable errors. Sheet must be removed to continue scanning.',
      adjudicationTypes: 'InvalidBallotHashPage, BlankPage',
    }
  );
});

test('logs deduplicated enabled reasons across both HMPB pages', async () => {
  const logger = mockLogger({ fn: vi.fn });
  await logSheetAdjudicationInfo(logger, [
    hmpbPage([AdjudicationReason.Overvote, AdjudicationReason.Undervote], true),
    hmpbPage([AdjudicationReason.Overvote], true),
  ]);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ScanAdjudicationInfo,
    'unknown',
    {
      message:
        'Sheet scanned has warnings (ex: undervotes or overvotes). The user can either tabulate it as is or remove the ballot to continue scanning.',
      adjudicationTypes: 'Overvote, Undervote',
    }
  );
});

test('does not log for HMPB pages that do not require adjudication', async () => {
  const logger = mockLogger({ fn: vi.fn });
  await logSheetAdjudicationInfo(logger, [
    hmpbPage([AdjudicationReason.Overvote], false),
    hmpbPage([AdjudicationReason.Overvote], false),
  ]);
  expect(logger.log).not.toHaveBeenCalled();
});
