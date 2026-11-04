import { assert, assertDefined, iter, typedAs } from '@votingworks/basics';
import {
  DEFAULT_FAMOUS_NAMES_BALLOT_STYLE_ID,
  DEFAULT_FAMOUS_NAMES_PRECINCT_ID,
  DEFAULT_FAMOUS_NAMES_VOTES,
  renderBmdBallotFixture,
} from '@votingworks/bmd-ballot-fixtures';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { pdfToImages } from '@votingworks/image-utils/pdf';
import {
  AdjudicationReason,
  DEFAULT_MARK_THRESHOLDS,
  type ElectionDefinition,
  type HmpbBallotPageMetadata,
  type InterpretedHmpbPage,
  type SheetOf,
  asSheet,
  type RgbaImageData,
  type CandidateOrderings,
  type GetCandidateOrderingsFn,
} from '@votingworks/types';
import * as fs from 'node:fs/promises';
import { createElectionPackageDbForTest } from '@votingworks/backend/test-utils';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from 'vitest';
import { interpretSheetAndSaveImages } from '@votingworks/ballot-interpreter';
import {
  ElectionPackageStore,
  type ElectionPackageIncluding,
} from '@votingworks/backend';
import { interpret } from './interpret.js';

vi.mock(import('@votingworks/ballot-interpreter'), async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    interpretSheetAndSaveImages: vi.fn(actual.interpretSheetAndSaveImages),
  };
});

if (process.env.CI) {
  vi.setConfig({ testTimeout: 20_000 });
}

const { electionDefinition } = vxFamousNamesFixtures;
const { election } = electionDefinition;

let ballotImages: {
  overvoteBallot: SheetOf<RgbaImageData>;
  normalBallot: SheetOf<RgbaImageData>;
  normalBmdBallot: SheetOf<RgbaImageData>;
  undervoteBmdBallot: SheetOf<RgbaImageData>;
};
let ballotImagesPath!: string;
let dbPath!: string;
let db!: ElectionPackageStore<ElectionPackageIncluding<'candidateOrderings'>>;

async function ballotAsSheet(ballotPdf: Uint8Array) {
  return asSheet(
    await iter(pdfToImages(ballotPdf, { scale: 200 / 72 }))
      .map(({ page }) => page)
      .toArray()
  );
}

beforeAll(async () => {
  dbPath = await createElectionPackageDbForTest(electionDefinition);
  db = ElectionPackageStore.fileStore(dbPath, {
    ballotPositions: false,
    ballots: false,
    candidateOrderings: true,
    uiStrings: false,
  });

  ballotImages = {
    overvoteBallot: await ballotAsSheet(
      Uint8Array.from(await fs.readFile(vxFamousNamesFixtures.markedBallotPath))
    ),
    normalBallot: await ballotAsSheet(
      Uint8Array.from(await fs.readFile(vxFamousNamesFixtures.blankBallotPath))
    ),
    normalBmdBallot: await ballotAsSheet(
      await renderBmdBallotFixture({ electionDefinition })
    ),
    undervoteBmdBallot: await ballotAsSheet(
      await renderBmdBallotFixture({
        electionDefinition,
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
  vi.resetAllMocks();
  ballotImagesPath = makeTemporaryDirectory();
});

afterEach(async () => {
  await fs.rm(ballotImagesPath, { recursive: true });
});

afterAll(() => {
  db.close();
});

test('treats BMD ballot with one blank side as valid', async () => {
  const result = await interpret('foo-sheet-id', ballotImages.normalBmdBallot, {
    electionDefinition,
    validPrecinctIds: allPrecinctIds(electionDefinition),
    ballotImagesPath,
    testMode: true,
    markThresholds: DEFAULT_MARK_THRESHOLDS,
    adjudicationReasons: [],
    dbPath,
    getCandidateOrderings: (bs) =>
      db.getCandidateOrderingsStore().getCandidateOrderings(bs),
  });
  expect(result.ok()?.type).toEqual('ValidSheet');
});

test('respects adjudication reasons for a BMD ballot on the front side', async () => {
  const result = await interpret(
    'foo-sheet-id',
    ballotImages.undervoteBmdBallot,
    {
      electionDefinition,
      validPrecinctIds: allPrecinctIds(electionDefinition),
      ballotImagesPath,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [AdjudicationReason.Undervote],
      dbPath,
      getCandidateOrderings: (bs) =>
        db.getCandidateOrderingsStore().getCandidateOrderings(bs),
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
    electionDefinition,
    validPrecinctIds: allPrecinctIds(electionDefinition),
    ballotImagesPath,
    testMode: true,
    markThresholds: DEFAULT_MARK_THRESHOLDS,
    adjudicationReasons: [AdjudicationReason.Overvote],
    dbPath,
    getCandidateOrderings: (bs) =>
      db.getCandidateOrderingsStore().getCandidateOrderings(bs),
  });
  expect(result.ok()?.type).toEqual('NeedsReviewSheet');
});

test('NH interpreter with testMode=true', async () => {
  const sheet = (
    await interpret('foo-sheet-id', ballotImages.normalBallot, {
      electionDefinition,
      validPrecinctIds: allPrecinctIds(electionDefinition),
      ballotImagesPath,
      testMode: true,
      markThresholds: DEFAULT_MARK_THRESHOLDS,
      adjudicationReasons: [AdjudicationReason.Overvote],
      dbPath,
      getCandidateOrderings: (bs) =>
        db.getCandidateOrderingsStore().getCandidateOrderings(bs),
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

test('uses candidate orderings from specified lookup fn', async () => {
  const mockOrderings: CandidateOrderings = {
    irrelevant: [{ id: 'just-needs-to-match' }],
  };
  const getCandidateOrderings = vi.fn<GetCandidateOrderingsFn>(
    () => mockOrderings
  );

  const ballotStyle = assertDefined(election.ballotStyles[0]);
  vi.mocked(interpretSheetAndSaveImages).mockImplementation(
    (_, getOrderings) => {
      expect(getOrderings(ballotStyle)).toEqual(mockOrderings);

      return Promise.resolve([
        { imagePath: '', interpretation: { type: 'BlankPage' } },
        { imagePath: '', interpretation: { type: 'BlankPage' } },
      ]);
    }
  );

  const res = await interpret('foo-sheet-id', ballotImages.overvoteBallot, {
    electionDefinition,
    validPrecinctIds: allPrecinctIds(electionDefinition),
    ballotImagesPath,
    testMode: true,
    markThresholds: DEFAULT_MARK_THRESHOLDS,
    adjudicationReasons: [AdjudicationReason.Overvote],
    getCandidateOrderings,
  });

  const sheet = res.unsafeUnwrap();
  expect(vi.mocked(interpretSheetAndSaveImages)).toHaveBeenCalled();
  expect(getCandidateOrderings).toHaveBeenCalledWith(ballotStyle);

  for (const page of sheet.pages) {
    expect(page.interpretation.type).toEqual('BlankPage');
  }
});

function allPrecinctIds(electionDef: ElectionDefinition) {
  return new Set(electionDef.election.precincts.map((p) => p.id));
}
