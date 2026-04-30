import { assertDefined, iter, typedAs } from '@votingworks/basics';
import {
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
  renderBmdBallotFixture,
} from '@votingworks/bmd-ballot-fixtures';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { ImageData, pdfToImages } from '@votingworks/image-utils';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  BallotType,
  DEFAULT_MARK_THRESHOLDS,
  ElectionDefinition,
  HmpbBallotPageMetadata,
  InterpretedBmdMultiPagePage,
  InterpretedHmpbPage,
  PageInterpretation,
  SheetInterpretation,
  SheetOf,
  asSheet,
} from '@votingworks/types';
import { assert } from 'node:console';
import * as fs from 'node:fs/promises';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { combinePageInterpretationsForSheet, interpret } from './interpret';

if (process.env.CI) {
  vi.setConfig({ testTimeout: 20_000 });
}

let ballotImages: {
  overvoteBallot: SheetOf<ImageData>;
  normalBallot: SheetOf<ImageData>;
  normalBmdBallot: SheetOf<ImageData>;
  undervoteBmdBallot: SheetOf<ImageData>;
};
let ballotImagesPath!: string;

async function ballotAsSheet(ballotPdf: Uint8Array) {
  return asSheet(
    await iter(pdfToImages(ballotPdf, { scale: 200 / 72 }))
      .map(({ page }) => page)
      .toArray()
  );
}

beforeAll(async () => {
  ballotImages = {
    overvoteBallot: await ballotAsSheet(
      Uint8Array.from(await fs.readFile(vxFamousNamesFixtures.markedBallotPath))
    ),
    normalBallot: await ballotAsSheet(
      Uint8Array.from(await fs.readFile(vxFamousNamesFixtures.blankBallotPath))
    ),
    normalBmdBallot: await ballotAsSheet(
      await renderBmdBallotFixture({
        electionDefinition: vxFamousNamesFixtures.electionDefinition,
      })
    ),
    undervoteBmdBallot: await ballotAsSheet(
      await renderBmdBallotFixture({
        electionDefinition: vxFamousNamesFixtures.electionDefinition,
        precinctId: DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
        ballotStyleId: DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
        votes: {
          ...DEFAULT_FAMOUS_NAMES_VOTES,
          'city-council': DEFAULT_FAMOUS_NAMES_VOTES['city-council']?.slice(
            0,
            1
          ),
        },
      })
    ),
  };
});

beforeEach(() => {
  ballotImagesPath = makeTemporaryDirectory();
});

afterEach(async () => {
  await fs.rm(ballotImagesPath, { recursive: true });
});

test('treats BMD ballot with one blank side as valid', async () => {
  const result = await interpret('foo-sheet-id', ballotImages.normalBmdBallot, {
    electionDefinition: vxFamousNamesFixtures.electionDefinition,
    validPrecinctIds: allPrecinctIds(vxFamousNamesFixtures.electionDefinition),
    ballotImagesPath,
    testMode: true,
    markThresholds: DEFAULT_MARK_THRESHOLDS,
    adjudicationReasons: [],
  });
  expect(result.ok()?.type).toEqual('ValidSheet');
});

test('respects adjudication reasons for a BMD ballot on the front side', async () => {
  const result = await interpret(
    'foo-sheet-id',
    ballotImages.undervoteBmdBallot,
    {
      electionDefinition: vxFamousNamesFixtures.electionDefinition,
      validPrecinctIds: allPrecinctIds(
        vxFamousNamesFixtures.electionDefinition
      ),
      ballotImagesPath,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [AdjudicationReason.Undervote],
    }
  );
  const interpretation = assertDefined(result.ok());
  assert(interpretation.type === 'NeedsReviewSheet');

  // if statement for type narrowing only
  if (interpretation.type === 'NeedsReviewSheet') {
    expect(interpretation.reasons).toEqual([
      {
        contestId: 'city-council',
        expected: 4,
        optionIds: ['marie-curie'],
        type: 'Undervote',
      },
    ]);
  }
});

test('NH interpreter of overvote yields a sheet that needs to be reviewed', async () => {
  const result = await interpret('foo-sheet-id', ballotImages.overvoteBallot, {
    electionDefinition: vxFamousNamesFixtures.electionDefinition,
    validPrecinctIds: allPrecinctIds(vxFamousNamesFixtures.electionDefinition),
    ballotImagesPath,
    testMode: true,
    markThresholds: DEFAULT_MARK_THRESHOLDS,
    adjudicationReasons: [AdjudicationReason.Overvote],
  });
  expect(result.ok()?.type).toEqual('NeedsReviewSheet');
});

test('NH interpreter with testMode=true', async () => {
  const sheet = (
    await interpret('foo-sheet-id', ballotImages.normalBallot, {
      electionDefinition: vxFamousNamesFixtures.electionDefinition,
      validPrecinctIds: allPrecinctIds(
        vxFamousNamesFixtures.electionDefinition
      ),
      ballotImagesPath,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [AdjudicationReason.Overvote],
    })
  ).unsafeUnwrap();
  expect(sheet.type).toEqual('ValidSheet');

  for (const page of sheet.pages) {
    expect(page.interpretation).toMatchObject<Partial<InterpretedHmpbPage>>({
      type: 'InterpretedHmpbPage',
      metadata: expect.objectContaining(
        typedAs<Partial<HmpbBallotPageMetadata>>({
          isTestMode: true,
        })
      ),
    });
  }
});

function allPrecinctIds(electionDef: ElectionDefinition) {
  return new Set(electionDef.election.precincts.map((p) => p.id));
}

function mockHmpbPage({
  numMarks = 1,
  requiresAdjudication = false,
  enabledReasonInfos = [],
}: {
  numMarks?: number;
  requiresAdjudication?: boolean;
  enabledReasonInfos?: AdjudicationReasonInfo[];
} = {}): InterpretedHmpbPage {
  // Just mock the fields needed for combinePageInterpretationsForSheet
  // (bypassing the type system)
  return {
    type: 'InterpretedHmpbPage',
    markInfo: { marks: Array.from({ length: numMarks }, () => ({})) },
    adjudicationInfo: {
      requiresAdjudication,
      enabledReasons: [],
      enabledReasonInfos,
      ignoredReasonInfos: [],
    },
  } as unknown as InterpretedHmpbPage;
}

function mockBmdMultiPagePage({
  requiresAdjudication = false,
  enabledReasonInfos = [],
}: {
  requiresAdjudication?: boolean;
  enabledReasonInfos?: AdjudicationReasonInfo[];
} = {}): InterpretedBmdMultiPagePage {
  // Just mock the fields needed for combinePageInterpretationsForSheet
  // (bypassing the type system)
  return {
    type: 'InterpretedBmdMultiPagePage',
    adjudicationInfo: {
      requiresAdjudication,
      enabledReasons: [],
      enabledReasonInfos,
      ignoredReasonInfos: [],
    },
  } as unknown as InterpretedBmdMultiPagePage;
}

const blankPage: PageInterpretation = { type: 'BlankPage' };

function mockSheet(
  front: PageInterpretation,
  back: PageInterpretation
): Parameters<typeof combinePageInterpretationsForSheet>[0] {
  return [
    { imagePath: 'front.jpeg', interpretation: front },
    { imagePath: 'back.jpeg', interpretation: back },
  ];
}

test('treats multi-page BMD ballot with one blank side as valid', () => {
  const printed = mockBmdMultiPagePage();
  expect(
    combinePageInterpretationsForSheet(mockSheet(printed, blankPage))
  ).toEqual<SheetInterpretation>({
    type: 'ValidSheet',
  });
  expect(
    combinePageInterpretationsForSheet(mockSheet(blankPage, printed))
  ).toEqual<SheetInterpretation>({
    type: 'ValidSheet',
  });
});

test('respects adjudication reasons for a multi-page BMD ballot', () => {
  const reasons: AdjudicationReasonInfo[] = [
    {
      type: AdjudicationReason.Undervote,
      contestId: 'contest-1',
      expected: 1,
      optionIds: [],
    },
  ];
  const printed = mockBmdMultiPagePage({
    requiresAdjudication: true,
    enabledReasonInfos: reasons,
  });
  expect(
    combinePageInterpretationsForSheet(mockSheet(printed, blankPage))
  ).toEqual<SheetInterpretation>({
    type: 'NeedsReviewSheet',
    reasons,
  });
});

test('treats HMPB ballot with both sides marked blank as a blank ballot', () => {
  const blankReason: AdjudicationReasonInfo = {
    type: AdjudicationReason.BlankBallot,
  };
  const front = mockHmpbPage({
    requiresAdjudication: true,
    enabledReasonInfos: [blankReason],
  });
  const back = mockHmpbPage({
    requiresAdjudication: true,
    enabledReasonInfos: [blankReason],
  });
  expect(
    combinePageInterpretationsForSheet(mockSheet(front, back))
  ).toEqual<SheetInterpretation>({
    type: 'NeedsReviewSheet',
    reasons: [{ type: AdjudicationReason.BlankBallot }],
  });
});

test('treats HMPB ballot with no marks on either side as a blank ballot', () => {
  const front = mockHmpbPage({ numMarks: 0, requiresAdjudication: true });
  const back = mockHmpbPage({ numMarks: 0, requiresAdjudication: true });
  expect(
    combinePageInterpretationsForSheet(mockSheet(front, back))
  ).toEqual<SheetInterpretation>({
    type: 'NeedsReviewSheet',
    reasons: [{ type: AdjudicationReason.BlankBallot }],
  });
});

test('drops blank reason from one side when other side has non-blank reasons', () => {
  const overvoteReason: AdjudicationReasonInfo = {
    type: AdjudicationReason.Overvote,
    contestId: 'contest-1',
    expected: 1,
    optionIds: ['a', 'b'],
  };
  const front = mockHmpbPage({
    numMarks: 0,
    requiresAdjudication: true,
    enabledReasonInfos: [{ type: AdjudicationReason.BlankBallot }],
  });
  const back = mockHmpbPage({
    requiresAdjudication: true,
    enabledReasonInfos: [overvoteReason],
  });
  expect(
    combinePageInterpretationsForSheet(mockSheet(front, back))
  ).toEqual<SheetInterpretation>({
    type: 'NeedsReviewSheet',
    reasons: [overvoteReason],
  });
});

test('treats either page being an invalid ballot hash as an invalid sheet', () => {
  const invalidBallotHashPage: PageInterpretation = {
    type: 'InvalidBallotHashPage',
    expectedBallotHash: 'expected',
    actualBallotHash: 'actual',
  };
  expect(
    combinePageInterpretationsForSheet(
      mockSheet(invalidBallotHashPage, { type: 'UnreadablePage' })
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_ballot_hash',
  });
  expect(
    combinePageInterpretationsForSheet(
      mockSheet({ type: 'UnreadablePage' }, invalidBallotHashPage)
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_ballot_hash',
  });
});

const invalidPageMetadata: HmpbBallotPageMetadata = {
  ballotStyleId: vxFamousNamesFixtures.election.ballotStyles[0].id,
  precinctId: vxFamousNamesFixtures.election.ballotStyles[0].precincts[0],
  ballotType: BallotType.Precinct,
  ballotHash: vxFamousNamesFixtures.electionDefinition.ballotHash,
  isTestMode: false,
  pageNumber: 1,
};

test('treats either page being an invalid test mode as an invalid sheet', () => {
  const invalidTestModePage: PageInterpretation = {
    type: 'InvalidTestModePage',
    metadata: invalidPageMetadata,
  };
  expect(
    combinePageInterpretationsForSheet(
      mockSheet(invalidTestModePage, { type: 'UnreadablePage' })
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_test_mode',
  });
  expect(
    combinePageInterpretationsForSheet(
      mockSheet({ type: 'UnreadablePage' }, invalidTestModePage)
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_test_mode',
  });
});

test('treats either page being an invalid precinct as an invalid sheet', () => {
  const invalidPrecinctPage: PageInterpretation = {
    type: 'InvalidPrecinctPage',
    metadata: invalidPageMetadata,
  };
  expect(
    combinePageInterpretationsForSheet(
      mockSheet(invalidPrecinctPage, { type: 'UnreadablePage' })
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_precinct',
  });
  expect(
    combinePageInterpretationsForSheet(
      mockSheet({ type: 'UnreadablePage' }, invalidPrecinctPage)
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_precinct',
  });
});

test('treats either page having invalid scale as an invalid sheet', () => {
  const invalidScalePage: PageInterpretation = {
    type: 'UnreadablePage',
    reason: 'invalidScale',
  };
  expect(
    combinePageInterpretationsForSheet(
      mockSheet(invalidScalePage, { type: 'UnreadablePage' })
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_scale',
  });
  expect(
    combinePageInterpretationsForSheet(
      mockSheet({ type: 'UnreadablePage' }, invalidScalePage)
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'invalid_scale',
  });
});

test('treats either page having BMD ballot scanning disabled as an invalid sheet', () => {
  const bmdDisabledPage: PageInterpretation = {
    type: 'UnreadablePage',
    reason: 'bmdBallotScanningDisabled',
  };
  expect(
    combinePageInterpretationsForSheet(
      mockSheet(bmdDisabledPage, { type: 'UnreadablePage' })
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'bmd_ballot_scanning_disabled',
  });
  expect(
    combinePageInterpretationsForSheet(
      mockSheet({ type: 'UnreadablePage' }, bmdDisabledPage)
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'bmd_ballot_scanning_disabled',
  });
});

test('treats either page having vertical streaks as an invalid sheet', () => {
  const verticalStreaksPage: PageInterpretation = {
    type: 'UnreadablePage',
    reason: 'verticalStreaksDetected',
  };
  expect(
    combinePageInterpretationsForSheet(
      mockSheet(verticalStreaksPage, { type: 'UnreadablePage' })
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'vertical_streaks_detected',
  });
  expect(
    combinePageInterpretationsForSheet(
      mockSheet({ type: 'UnreadablePage' }, verticalStreaksPage)
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'vertical_streaks_detected',
  });
});

test('treats unreadable pages as an invalid sheet', () => {
  expect(
    combinePageInterpretationsForSheet(
      mockSheet({ type: 'UnreadablePage' }, { type: 'UnreadablePage' })
    )
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'unreadable',
  });
});

test('treats unmatched page combinations as unknown invalid sheet', () => {
  // Both blank doesn't match any specific case.
  expect(
    combinePageInterpretationsForSheet(mockSheet(blankPage, blankPage))
  ).toEqual<SheetInterpretation>({
    type: 'InvalidSheet',
    reason: 'unknown',
  });
});
