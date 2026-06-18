import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { readElection } from '@votingworks/fs';
import {
  ElectionSerializationOptions,
  RendererPool,
  allBaseBallotProps,
  ballotTemplates,
  createPlaywrightRendererPool,
  layOutBallotsAndCreateElectionDefinition,
  vxFamousNamesFixtures,
  vxGeneralElectionFixtures,
  vxPrimaryElectionFixtures,
} from '@votingworks/hmpb';
import { assert, iter } from '@votingworks/basics';
import {
  CachedElectionLookups,
  getBallotStyleGroupsForPrecinctOrSplit,
} from '@votingworks/utils';
import {
  BallotType,
  Election,
  ElectionDefinition,
  hasSplits,
  LanguageCode,
  LATEST_SOFTWARE_VERSION,
} from '@votingworks/types';
import { generateTestDeckBallots } from '@votingworks/test-decks';
import {
  createPrecinctTestDeck,
  createTestDeckTallyReports,
  precinctTallyReportFileName,
  FULL_TEST_DECK_TALLY_REPORT_FILE_NAME,
} from './test_decks';

vi.setConfig({
  testTimeout: 90_000,
});

vi.mock(import('@votingworks/types'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    formatBallotHash: vi.fn().mockReturnValue('0000000'),
  };
});

const serializationOptions: ElectionSerializationOptions = {
  format: 'vxf',
  version: LATEST_SOFTWARE_VERSION,
};

let rendererPool: RendererPool;
beforeAll(async () => {
  rendererPool = await createPlaywrightRendererPool();
});
afterAll(async () => {
  await rendererPool.close();
});

describe('createPrecinctTestDeck', () => {
  test('for a precinct with one ballot style', async () => {
    const fixtures = vxFamousNamesFixtures;
    const { electionDefinition } = vxFamousNamesFixtures;
    const { election } = electionDefinition;
    const precinctId = election.precincts[0].id;
    assert(
      CachedElectionLookups.getBallotStylesByPrecinctId(
        electionDefinition,
        precinctId
      ).length === 1
    );
    const { ballotContents } = await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates.VxDefaultBallot,
      fixtures.allBallotProps,
      serializationOptions
    );
    const ballots = iter(fixtures.allBallotProps)
      .zip(ballotContents)
      .map(([props, contents]) => ({ props, contents }))
      .toArray();

    const ballotSpecs = generateTestDeckBallots({
      election,
      precinctId,
      ballotFormat: 'bubble',
    });
    const testDeckDocument = await createPrecinctTestDeck({
      rendererPool,
      electionDefinition,
      ballotSpecs,
      ballots,
    });
    await expect(testDeckDocument).toMatchPdfSnapshot();
  });

  test('for a precinct with multiple ballot styles', async () => {
    const fixtures = vxPrimaryElectionFixtures;
    const primaryElectionDefinition = fixtures.electionDefinition;
    // Test takes unnecessarily long if using all language ballot styles
    const electionDefinition: ElectionDefinition = {
      ...primaryElectionDefinition,
      election: {
        ...primaryElectionDefinition.election,
        ballotStyles: primaryElectionDefinition.election.ballotStyles.filter(
          (bs) =>
            bs.languages &&
            bs.languages.length === 1 &&
            bs.languages[0] === LanguageCode.ENGLISH
        ),
      },
    };
    const { election } = electionDefinition;
    const ballotProps = allBaseBallotProps(election).filter(
      (props) =>
        props.ballotMode === 'test' && props.ballotType === BallotType.Precinct
    );
    const [precinct] = election.precincts;
    assert(!hasSplits(precinct));
    assert(
      getBallotStyleGroupsForPrecinctOrSplit({
        election,
        precinctOrSplit: { precinct },
      }).length > 1
    );
    const layouts = await layOutBallotsAndCreateElectionDefinition(
      rendererPool,
      ballotTemplates.VxDefaultBallot,
      ballotProps,
      serializationOptions
    );
    const ballots = iter(ballotProps)
      .zip(layouts.ballotContents)
      .map(([props, contents]) => ({ props, contents }))
      .toArray();

    const ballotSpecs = generateTestDeckBallots({
      election,
      precinctId: precinct.id,
      ballotFormat: 'bubble',
    });
    const testDeckDocument = await createPrecinctTestDeck({
      rendererPool,
      electionDefinition: layouts.electionDefinition,
      ballotSpecs,
      ballots,
    });
    await expect(testDeckDocument).toMatchPdfSnapshot();
  });

  test('for a precinct with no ballot styles', async () => {
    const fixtures = vxGeneralElectionFixtures.fixtureSpecs[0];
    const electionDefinition = (
      await readElection(fixtures.electionPath)
    ).unsafeUnwrap();

    const testDeckDocument = await createPrecinctTestDeck({
      rendererPool,
      electionDefinition,
      ballotSpecs: [],
      ballots: [], // doesn't matter
    });
    expect(testDeckDocument).toBeUndefined();
  });
});

describe('createTestDeckTallyReports', () => {
  test('without summary ballots', async () => {
    const fixtures = vxGeneralElectionFixtures.fixtureSpecs[0];
    const electionDefinition = (
      await readElection(fixtures.electionPath)
    ).unsafeUnwrap();
    const { election } = electionDefinition;

    const reports = await createTestDeckTallyReports({
      electionDefinition,
      generatedAtTime: new Date('2021-01-01T00:00:00.000'),
      includeSummaryBallots: false,
    });

    // Verify correct number of reports
    expect(reports.size).toEqual(election.precincts.length + 1);

    // Verify full report exists and matches snapshot
    const fullReport = reports.get(FULL_TEST_DECK_TALLY_REPORT_FILE_NAME);
    assert(fullReport);
    await expect(fullReport).toMatchPdfSnapshot({
      customSnapshotIdentifier: 'full-tally-report-no-summary',
      failureThreshold: 0.046,
    });

    // Verify each precinct report exists and matches snapshot
    for (const precinct of election.precincts) {
      const precinctFileName = precinctTallyReportFileName(precinct.name);
      const precinctReport = reports.get(precinctFileName);
      assert(precinctReport, `Missing report for precinct: ${precinct.name}`);
      const sanitizedName = precinct.name.replaceAll(' ', '_');
      await expect(precinctReport).toMatchPdfSnapshot({
        customSnapshotIdentifier: `precinct-tally-report-${sanitizedName}-no-summary`,
        failureThreshold: 0.046,
      });
    }
  });

  test('with summary ballots', async () => {
    const fixtures = vxGeneralElectionFixtures.fixtureSpecs[0];
    const electionDefinition = (
      await readElection(fixtures.electionPath)
    ).unsafeUnwrap();
    const { election } = electionDefinition;

    const reports = await createTestDeckTallyReports({
      electionDefinition,
      generatedAtTime: new Date('2021-01-01T00:00:00.000'),
      includeSummaryBallots: true,
    });

    // Verify correct number of reports
    expect(reports.size).toEqual(election.precincts.length + 1);

    // Verify full report exists and matches snapshot
    const fullReport = reports.get(FULL_TEST_DECK_TALLY_REPORT_FILE_NAME);
    assert(fullReport);
    await expect(fullReport).toMatchPdfSnapshot({
      customSnapshotIdentifier: 'full-tally-report-with-summary',
      failureThreshold: 0.05,
    });

    // Verify each precinct report exists and matches snapshot
    for (const precinct of election.precincts) {
      const precinctFileName = precinctTallyReportFileName(precinct.name);
      const precinctReport = reports.get(precinctFileName);
      assert(precinctReport, `Missing report for precinct: ${precinct.name}`);
      const sanitizedName = precinct.name.replaceAll(' ', '_');
      await expect(precinctReport).toMatchPdfSnapshot({
        customSnapshotIdentifier: `precinct-tally-report-${sanitizedName}-with-summary`,
        failureThreshold: 0.05,
      });
    }
  });

  test('single-precinct election only generates full report', async () => {
    const { electionDefinition: baseElectionDefinition } =
      vxFamousNamesFixtures;
    const { election: baseElection } = baseElectionDefinition;

    const singlePrecinct = baseElection.precincts[0];
    const singlePrecinctElection: Election = {
      ...baseElection,
      precincts: [singlePrecinct],
      ballotStyles: baseElection.ballotStyles
        .filter((bs) => bs.precincts.includes(singlePrecinct.id))
        .map((bs) => ({ ...bs, precincts: [singlePrecinct.id] })),
    };
    const singlePrecinctElectionDefinition: ElectionDefinition = {
      ...baseElectionDefinition,
      election: singlePrecinctElection,
    };

    const reports = await createTestDeckTallyReports({
      electionDefinition: singlePrecinctElectionDefinition,
      generatedAtTime: new Date('2021-01-01T00:00:00.000'),
      includeSummaryBallots: false,
    });

    expect(reports.size).toEqual(1);
    expect(reports.has(FULL_TEST_DECK_TALLY_REPORT_FILE_NAME)).toEqual(true);
    expect(
      reports.has(precinctTallyReportFileName(singlePrecinct.name))
    ).toEqual(false);
  });
});
