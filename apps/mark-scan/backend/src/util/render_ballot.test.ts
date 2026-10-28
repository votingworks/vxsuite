import { beforeEach, expect, test, vi } from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import {
  electionStraightPartyFixtures,
  makeTemporaryDirectory,
  readElectionGeneralDefinition,
  systemSettings,
} from '@votingworks/fixtures';
import {
  anyPollingPlace,
  type CandidateOrderings,
  pollingPlaceBallotStyles,
  safeParseSystemSettings,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { getPdfPageCount } from '@votingworks/image-utils/pdf';
import { TestLanguageCode } from '@votingworks/test-utils';
import {
  BmdPaperBallot,
  getLayout,
  NoLayoutOptionError,
  ORDERED_BMD_BALLOT_LAYOUTS,
} from '@votingworks/ui';
import { assert, err, find, ok } from '@votingworks/basics';
import { encodeSummaryBallotPage } from '@votingworks/ballot-encoder';
import type { BallotMetaStore } from '@votingworks/backend';
import { makeDerivedStraightPartyVotesExplicit } from '@votingworks/utils';
import { renderBallot } from './render_ballot.js';
import { createWorkspace, type Workspace } from './workspace.js';

const electionGeneralDefinition = readElectionGeneralDefinition();
const electionGeneral = electionGeneralDefinition.election;

vi.mock(import('@votingworks/image-utils/pdf'), async (importActual) => ({
  ...(await importActual()),
  getPdfPageCount: vi.fn().mockImplementation(() => {
    throw new Error('Unexpected call to getPdfPageCount during this test');
  }),
}));

vi.mock(import('@votingworks/ui'), async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    BmdPaperBallot: vi.fn(actual.BmdPaperBallot),
    getLayout: vi.fn(),
  };
});

vi.mock(import('@votingworks/ballot-encoder'), async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    encodeSummaryBallotPage: vi.fn(actual.encodeSummaryBallotPage),
  };
});

vi.mock(import('@votingworks/utils'), async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    makeDerivedStraightPartyVotesExplicit: vi.fn(
      actual.makeDerivedStraightPartyVotesExplicit
    ),
  };
});

const pollingPlace = anyPollingPlace(electionGeneral);
const [ballotStyle] = pollingPlaceBallotStyles(electionGeneral, pollingPlace);
const ballotStyleId = ballotStyle!.id;
const [precinctId] = ballotStyle!.precincts;

let workspace: Workspace;

beforeEach(() => {
  const mockWorkspaceDir = makeTemporaryDirectory();
  workspace = createWorkspace(mockWorkspaceDir, mockBaseLogger({ fn: vi.fn }));
  workspace.store.setElectionAndJurisdiction({
    electionData: electionGeneralDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
    electionPackageHash: 'test-election-package-hash',
    ballotHash: electionGeneralDefinition.ballotHash,
  });
  workspace.store.setPollingPlaceId(pollingPlace.id);
  workspace.store.setSystemSettings(
    safeParseSystemSettings(systemSettings.asText()).unsafeUnwrap()
  );
  workspace.store.setTestMode(true);
});

test('tries as many layouts as necessary and proceeds with the first that works', async () => {
  vi.mocked(getLayout).mockImplementation(
    (_machineType, _ballotStyle, _electionDefinition, i) => {
      assert(i !== undefined);
      return i >= ORDERED_BMD_BALLOT_LAYOUTS.markScan.length
        ? err(new NoLayoutOptionError(0, 0, 'markScan'))
        : ok(ORDERED_BMD_BALLOT_LAYOUTS.markScan[i]!);
    }
  );
  vi.mocked(getPdfPageCount).mockImplementationOnce(() => Promise.resolve(2));
  vi.mocked(getPdfPageCount).mockImplementationOnce(() => Promise.resolve(2));
  vi.mocked(getPdfPageCount).mockImplementationOnce(() => Promise.resolve(1));

  await renderBallot({
    store: workspace.store,
    precinctId: precinctId!,
    ballotStyleId,
    votes: {},
    languageCode: TestLanguageCode.ENGLISH,
  });

  expect(getLayout).toHaveBeenCalledTimes(3);
});

test('tries all layouts beginning with the least compacted layout and errors if none work', async () => {
  vi.mocked(getLayout).mockImplementation(
    (_machineType, _ballotStyle, _electionDefinition, i) => {
      assert(i !== undefined);
      return i >= ORDERED_BMD_BALLOT_LAYOUTS.markScan.length
        ? err(new NoLayoutOptionError(0, 0, 'markScan'))
        : ok(ORDERED_BMD_BALLOT_LAYOUTS.markScan[i]!);
    }
  );
  vi.mocked(getPdfPageCount).mockImplementation(() => Promise.resolve(2));

  await expect(
    renderBallot({
      store: workspace.store,
      precinctId: precinctId!,
      ballotStyleId,
      votes: {},
      languageCode: TestLanguageCode.ENGLISH,
    })
  ).rejects.toThrow('Unable to render ballot contents in a single page');

  expect(getLayout).toHaveBeenCalledTimes(
    ORDERED_BMD_BALLOT_LAYOUTS.markScan.length
  );
});

test('tries all layouts beginning with a slightly compacted layout and errors if none work', async () => {
  vi.mocked(getLayout).mockImplementation(
    (_machineType, _ballotStyle, _electionDefinition, i) => {
      assert(i !== undefined);
      // getLayout picks a first layout to try given the nature of the election itself, e.g., if
      // there are many contests, we don't even try the least compacted layout
      const iAdjusted = i + 2;
      return iAdjusted >= ORDERED_BMD_BALLOT_LAYOUTS.markScan.length
        ? err(new NoLayoutOptionError(0, 0, 'markScan'))
        : ok(ORDERED_BMD_BALLOT_LAYOUTS.markScan[iAdjusted]!);
    }
  );
  vi.mocked(getPdfPageCount).mockImplementation(() => Promise.resolve(2));

  await expect(
    renderBallot({
      store: workspace.store,
      precinctId: precinctId!,
      ballotStyleId,
      votes: {},
      languageCode: TestLanguageCode.ENGLISH,
    })
  ).rejects.toThrow('Unable to render ballot contents in a single page');

  expect(getLayout).toHaveBeenCalledTimes(
    ORDERED_BMD_BALLOT_LAYOUTS.markScan.length - 1
  );
});

test('includes votes derived from a straight party selection', async () => {
  const electionDefinition =
    electionStraightPartyFixtures.readElectionDefinition();
  const { election } = electionDefinition;
  workspace.store.reset();
  workspace.store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
    electionPackageHash: 'test-election-package-hash',
    ballotHash: electionDefinition.ballotHash,
  });
  workspace.store.setTestMode(true);
  const straightPartyBallotStyle = election.ballotStyles[0]!;
  vi.mocked(getLayout).mockReturnValue(
    ok(ORDERED_BMD_BALLOT_LAYOUTS.markScan[0]!)
  );
  vi.mocked(getPdfPageCount).mockResolvedValueOnce(1);

  const president = find(election.contests, (c) => c.id === 'president');
  assert(president.type === 'candidate');

  const { candidates } = president;
  const candidate = find(candidates, (c) => c.id === 'barchi-hallaren');
  const otherCandidate = find(candidates, (c) => c.id !== candidate.id);

  const mockCandidateOrderings: CandidateOrderings = {
    [president.id]: [otherCandidate, candidate],
  };

  vi.spyOn(workspace.store, 'getBallotMetaStore').mockReturnValue(
    mockBallotMetaStore({
      getCandidateOrderings: (styleId) => {
        expect(styleId).toEqual(straightPartyBallotStyle.id);
        return mockCandidateOrderings;
      },
    })
  );

  await renderBallot({
    store: workspace.store,
    precinctId: straightPartyBallotStyle.precincts[0]!,
    ballotStyleId: straightPartyBallotStyle.id,
    votes: { 'straight-party-ticket': ['0'] },
    languageCode: TestLanguageCode.ENGLISH,
  });

  const [, { votes }] = vi.mocked(encodeSummaryBallotPage).mock.lastCall!;
  expect(votes['straight-party-ticket']).toEqual(['0']);
  expect(votes[president.id]).toEqual([candidate]);

  expect(
    vi.mocked(makeDerivedStraightPartyVotesExplicit).mock.lastCall?.[0]
      .orderings
  ).toEqual(mockCandidateOrderings);
});

test('renders with stored candidate orderings', async () => {
  vi.mocked(getPdfPageCount).mockResolvedValue(1);
  vi.mocked(getLayout).mockReturnValue(
    ok(ORDERED_BMD_BALLOT_LAYOUTS.markScan[0]!)
  );

  const mockOrderings: CandidateOrderings = {
    contest1: [{ id: 'orderedCandidate2' }, { id: 'orderedCandidate1' }],
  };

  const mockMetaStore: Partial<BallotMetaStore> = {
    getCandidateOrderings: (styleId) => {
      expect(styleId).toEqual(ballotStyleId);
      return mockOrderings;
    },
  };

  vi.spyOn(workspace.store, 'getBallotMetaStore').mockReturnValue(
    mockMetaStore as BallotMetaStore
  );

  await renderBallot({
    store: workspace.store,
    precinctId: precinctId!,
    ballotStyleId,
    votes: {},
    languageCode: TestLanguageCode.ENGLISH,
  });

  const ballotProps = vi.mocked(BmdPaperBallot).mock.lastCall?.[0];
  expect(ballotProps?.candidateOrderings).toEqual(mockOrderings);
});

function mockBallotMetaStore(mocks: Partial<BallotMetaStore>) {
  return mocks as unknown as BallotMetaStore;
}
