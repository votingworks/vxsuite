import { expect, test, vi } from 'vitest';
import { v4 as uuid } from 'uuid';
import { ok } from '@votingworks/basics';
import { mockBaseLogger } from '@votingworks/logging';
import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  BallotMetadata,
  BallotPageLayout,
  BallotStyleId,
  BallotType,
  PageInterpretationWithFiles,
  SheetOf,
  TEST_JURISDICTION,
  VotesDict,
} from '@votingworks/types';
import { loadImageData, crop, toDataUrl } from '@votingworks/image-utils';
import { Store } from '../store';

vi.mock(import('@votingworks/image-utils'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    loadImageData: vi.fn().mockResolvedValue({
      isErr: () => true,
      err: () => new Error('mock: no real image'),
    }),
    crop: vi.fn().mockReturnValue({ width: 10, height: 10, data: [] }),
    toDataUrl: vi.fn().mockReturnValue('data:image/png;base64,cropped'),
  };
});

const jurisdiction = TEST_JURISDICTION;
const electionPackageHash = 'test-election-package-hash';
const electionDefinition =
  electionFamousNames2021Fixtures.readElectionDefinition();
const { election } = electionDefinition;

function createStore(): Store {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));
  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction,
    electionPackageHash,
  });
  return store;
}

const bmdMetadata: BallotMetadata = {
  ballotStyleId: 'card-number-3' as BallotStyleId,
  ballotType: BallotType.Precinct,
  ballotHash: electionDefinition.ballotHash,
  isTestMode: false,
  precinctId: 'town-id-00701-precinct-id-default',
};

function addBmdSheet(store: Store, votes: VotesDict): void {
  const batchId = store.getOngoingBatchId() ?? store.addBatch();
  const sheetId = uuid();
  const sheet: SheetOf<PageInterpretationWithFiles> = [
    {
      imagePath: `/${sheetId}-front.png`,
      interpretation: {
        type: 'InterpretedBmdPage',
        metadata: bmdMetadata,
        votes,
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [],
          enabledReasonInfos: [],
          ignoredReasonInfos: [],
        },
      },
    },
    {
      imagePath: `/${sheetId}-back.png`,
      interpretation: { type: 'BlankPage' },
    },
  ];
  store.addSheet(sheetId, batchId, sheet);
}

test('returns all write-in-eligible contests even with no ballots', async () => {
  const store = createStore();
  const result = await store.getWriteInReportData();

  const writeInContests = election.contests.filter(
    (c) => c.type === 'candidate' && c.allowWriteIns
  );
  expect(result).toHaveLength(writeInContests.length);
  for (const contestData of result) {
    expect(contestData.writeIns).toEqual([]);
  }
});

test('extracts BMD write-ins as text entries', async () => {
  const store = createStore();
  store.addBatch();

  addBmdSheet(store, {
    mayor: [
      {
        id: 'write-in-0',
        name: 'Mickey Mouse',
        isWriteIn: true,
        writeInIndex: 0,
      },
    ],
  });

  const result = await store.getWriteInReportData();

  const mayorContest = result.find((c) => c.contestId === 'mayor');
  expect(mayorContest).toBeDefined();
  expect(mayorContest?.writeIns).toEqual([
    { type: 'text', text: 'Mickey Mouse' },
  ]);
});

test('extracts multiple BMD write-ins across contests', async () => {
  const store = createStore();
  store.addBatch();

  addBmdSheet(store, {
    mayor: [
      {
        id: 'write-in-0',
        name: 'Mickey Mouse',
        isWriteIn: true,
        writeInIndex: 0,
      },
    ],
    controller: [
      {
        id: 'write-in-0',
        name: 'Donald Duck',
        isWriteIn: true,
        writeInIndex: 0,
      },
    ],
  });

  addBmdSheet(store, {
    mayor: [
      {
        id: 'write-in-0',
        name: 'Goofy',
        isWriteIn: true,
        writeInIndex: 0,
      },
    ],
  });

  const result = await store.getWriteInReportData();

  const mayorContest = result.find((c) => c.contestId === 'mayor');
  expect(mayorContest?.writeIns).toEqual(
    expect.arrayContaining([
      { type: 'text', text: 'Mickey Mouse' },
      { type: 'text', text: 'Goofy' },
    ])
  );

  const controllerContest = result.find((c) => c.contestId === 'controller');
  expect(controllerContest?.writeIns).toEqual([
    { type: 'text', text: 'Donald Duck' },
  ]);
});

test('excludes write-ins from overvoted contests', async () => {
  const store = createStore();
  store.addBatch();

  // Mayor allows 1 seat, so 2 votes is an overvote
  addBmdSheet(store, {
    mayor: [
      { id: 'sherlock-holmes', name: 'Sherlock Holmes', isWriteIn: false },
      {
        id: 'write-in-0',
        name: 'Mickey Mouse',
        isWriteIn: true,
        writeInIndex: 0,
      },
    ],
    controller: [
      {
        id: 'write-in-0',
        name: 'Donald Duck',
        isWriteIn: true,
        writeInIndex: 0,
      },
    ],
  });

  const result = await store.getWriteInReportData();

  // Mayor should have 0 write-ins because the contest was overvoted
  const mayorContest = result.find((c) => c.contestId === 'mayor');
  expect(mayorContest?.writeIns).toEqual([]);

  // Controller should still have its write-in
  const controllerContest = result.find((c) => c.contestId === 'controller');
  expect(controllerContest?.writeIns.length).toEqual(1);
});

test('handles BMD multi-page ballots', async () => {
  const store = createStore();
  const batchId = store.addBatch();
  const sheetId = uuid();

  const sheet: SheetOf<PageInterpretationWithFiles> = [
    {
      imagePath: `/${sheetId}-front.png`,
      interpretation: {
        type: 'InterpretedBmdMultiPagePage',
        metadata: {
          ballotHash: electionDefinition.ballotHash,
          precinctId: 'town-id-00701-precinct-id-default',
          ballotStyleId: 'card-number-3' as BallotStyleId,
          pageNumber: 1,
          totalPages: 2,
          isTestMode: false,
          ballotType: BallotType.Precinct,
          ballotAuditId: 'audit-id-123',
          contestIds: ['mayor'],
        },
        votes: {
          mayor: [
            {
              id: 'write-in-0',
              name: 'Test Candidate',
              isWriteIn: true,
              writeInIndex: 0,
            },
          ],
        },
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [],
          enabledReasonInfos: [],
          ignoredReasonInfos: [],
        },
      },
    },
    {
      imagePath: `/${sheetId}-back.png`,
      interpretation: { type: 'BlankPage' },
    },
  ];
  store.addSheet(sheetId, batchId, sheet);

  const result = await store.getWriteInReportData();

  const mayorContest = result.find((c) => c.contestId === 'mayor');
  expect(mayorContest?.writeIns).toEqual([
    { type: 'text', text: 'Test Candidate' },
  ]);
});

test('skips non-interpreted pages (blank pages)', async () => {
  const store = createStore();
  const batchId = store.addBatch();
  const sheetId = uuid();

  const sheet: SheetOf<PageInterpretationWithFiles> = [
    {
      imagePath: `/${sheetId}-front.png`,
      interpretation: { type: 'BlankPage' },
    },
    {
      imagePath: `/${sheetId}-back.png`,
      interpretation: { type: 'BlankPage' },
    },
  ];
  store.addSheet(sheetId, batchId, sheet);

  const result = await store.getWriteInReportData();
  for (const contestData of result) {
    expect(contestData.writeIns.length).toEqual(0);
  }
});

test('preserves contest order from election definition', async () => {
  const store = createStore();
  const result = await store.getWriteInReportData();

  const expectedOrder = election.contests
    .filter((c) => c.type === 'candidate' && c.allowWriteIns)
    .map((c) => c.id);

  const actualOrder = result.map((c) => c.contestId);
  expect(actualOrder).toEqual(expectedOrder);
});

const hmpbMetadata = {
  ballotHash: electionDefinition.ballotHash,
  precinctId: 'town-id-00701-precinct-id-default',
  ballotStyleId: 'card-number-3' as BallotStyleId,
  pageNumber: 1,
  isTestMode: false,
  ballotType: BallotType.Precinct,
} as const;

const RECT = { x: 0, y: 0, width: 100, height: 50 } as const;
const TARGET = { bounds: RECT, inner: RECT } as const;
const CORNERS = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
  { x: 0, y: 50 },
] as const;

function makeHmpbLayout(contestIds: string[]): BallotPageLayout {
  return {
    pageSize: { width: 850, height: 1100 },
    metadata: hmpbMetadata,
    contests: contestIds.map((contestId) => ({
      contestId,
      bounds: RECT,
      corners: [...CORNERS],
      options: [
        {
          definition: {
            type: 'candidate' as const,
            id: 'write-in-0',
            contestId,
            name: 'Write-In',
            isWriteIn: true,
            writeInIndex: 0,
          },
          bounds: { x: 10, y: 10, width: 80, height: 30 },
          target: TARGET,
        },
      ],
    })),
  };
}

const hmpbBackMetadata = { ...hmpbMetadata, pageNumber: 2 } as const;

function addHmpbSheet(
  store: Store,
  votes: VotesDict,
  layout: BallotPageLayout
): void {
  const batchId = store.getOngoingBatchId() ?? store.addBatch();
  const sheetId = uuid();
  const backLayout: BallotPageLayout = {
    pageSize: { width: 850, height: 1100 },
    metadata: hmpbBackMetadata,
    contests: [],
  };
  const sheet: SheetOf<PageInterpretationWithFiles> = [
    {
      imagePath: `/${sheetId}-front.png`,
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata: hmpbMetadata,
        markInfo: { marks: [], ballotSize: { width: 850, height: 1100 } },
        votes,
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [],
          enabledReasonInfos: [],
          ignoredReasonInfos: [],
        },
        layout,
      },
    },
    {
      imagePath: `/${sheetId}-back.png`,
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata: hmpbBackMetadata,
        markInfo: { marks: [], ballotSize: { width: 850, height: 1100 } },
        votes: {},
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [],
          enabledReasonInfos: [],
          ignoredReasonInfos: [],
        },
        layout: backLayout,
      },
    },
  ];
  store.addSheet(sheetId, batchId, sheet);
}

test('extracts HMPB write-ins as image entries', async () => {
  vi.mocked(loadImageData).mockResolvedValueOnce(
    ok({ width: 850, height: 1100, data: new Uint8ClampedArray(0) })
  );

  const store = createStore();
  store.addBatch();
  const layout = makeHmpbLayout(['mayor']);

  addHmpbSheet(
    store,
    {
      mayor: [
        {
          id: 'write-in-0',
          name: 'Write-In',
          isWriteIn: true,
          writeInIndex: 0,
        },
      ],
    },
    layout
  );

  const result = await store.getWriteInReportData();

  const mayorContest = result.find((c) => c.contestId === 'mayor');
  expect(mayorContest?.writeIns).toEqual([
    { type: 'image', dataUrl: 'data:image/png;base64,cropped' },
  ]);
  expect(crop).toHaveBeenCalled();
  expect(toDataUrl).toHaveBeenCalled();
});

test('HMPB write-ins gracefully handle failed image load', async () => {
  // Default mock returns error for loadImageData, so write-ins from
  // HMPB pages should be silently dropped when the image cannot be loaded.
  const store = createStore();
  store.addBatch();
  const layout = makeHmpbLayout(['mayor']);

  addHmpbSheet(
    store,
    {
      mayor: [
        {
          id: 'write-in-0',
          name: 'Write-In',
          isWriteIn: true,
          writeInIndex: 0,
        },
      ],
    },
    layout
  );

  const result = await store.getWriteInReportData();

  const mayorContest = result.find((c) => c.contestId === 'mayor');
  expect(mayorContest?.writeIns).toEqual([]);
});

// --- electionTwoPartyPrimary tests ---

const primaryElectionDefinition =
  electionTwoPartyPrimaryFixtures.readElectionDefinition();
const primaryElection = primaryElectionDefinition.election;

function createPrimaryStore(): Store {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));
  store.setElectionAndJurisdiction({
    electionData: primaryElectionDefinition.electionData,
    jurisdiction,
    electionPackageHash,
  });
  return store;
}

const primaryBmdMetadata: BallotMetadata = {
  ballotStyleId: '1M' as BallotStyleId,
  ballotType: BallotType.Precinct,
  ballotHash: primaryElectionDefinition.ballotHash,
  isTestMode: false,
  precinctId: 'precinct-1',
};

function addPrimaryBmdSheet(store: Store, votes: VotesDict): void {
  const batchId = store.getOngoingBatchId() ?? store.addBatch();
  const sheetId = uuid();
  const sheet: SheetOf<PageInterpretationWithFiles> = [
    {
      imagePath: `/${sheetId}-front.png`,
      interpretation: {
        type: 'InterpretedBmdPage',
        metadata: primaryBmdMetadata,
        votes,
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [],
          enabledReasonInfos: [],
          ignoredReasonInfos: [],
        },
      },
    },
    {
      imagePath: `/${sheetId}-back.png`,
      interpretation: { type: 'BlankPage' },
    },
  ];
  store.addSheet(sheetId, batchId, sheet);
}

test('excludes non-write-in candidate contests and yes/no contests', async () => {
  const store = createPrimaryStore();
  const result = await store.getWriteInReportData();

  const contestIds = result.map((c) => c.contestId);

  // Only write-in-eligible candidate contests should appear
  expect(contestIds).toContain('zoo-council-mammal');
  expect(contestIds).toContain('aquarium-council-fish');

  // Non-write-in candidate contests excluded
  expect(contestIds).not.toContain('best-animal-mammal');
  expect(contestIds).not.toContain('best-animal-fish');

  // Yes/no contests excluded
  expect(contestIds).not.toContain('new-zoo-either');
  expect(contestIds).not.toContain('new-zoo-pick');
  expect(contestIds).not.toContain('fishing');

  expect(result).toHaveLength(2);
});

test('includes partyId from contest definition', async () => {
  const store = createPrimaryStore();
  const result = await store.getWriteInReportData();

  const mammalContest = result.find(
    (c) => c.contestId === 'zoo-council-mammal'
  );
  expect(mammalContest?.partyId).toEqual('0');

  const fishContest = result.find(
    (c) => c.contestId === 'aquarium-council-fish'
  );
  expect(fishContest?.partyId).toEqual('1');
});

test('uses contest title as contestName', async () => {
  const store = createPrimaryStore();
  const result = await store.getWriteInReportData();

  for (const contestData of result) {
    const electionContest = primaryElection.contests.find(
      (c) => c.id === contestData.contestId
    );
    expect(contestData.contestName).toEqual(electionContest?.title);
  }
});

test('extracts write-ins from primary election ballots', async () => {
  const store = createPrimaryStore();
  store.addBatch();

  addPrimaryBmdSheet(store, {
    'zoo-council-mammal': [
      {
        id: 'write-in-0',
        name: 'Elephant',
        isWriteIn: true,
        writeInIndex: 0,
      },
    ],
  });

  const result = await store.getWriteInReportData();

  const mammalContest = result.find(
    (c) => c.contestId === 'zoo-council-mammal'
  );
  expect(mammalContest?.writeIns).toEqual([{ type: 'text', text: 'Elephant' }]);
});
