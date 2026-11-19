import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  readElectionPackageFromFile,
  type SpeechSynthesizer,
  type Translator,
} from '@votingworks/backend';
import { assertDefined } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { createPlaywrightRendererPool } from '@votingworks/hmpb';
import {
  BallotType,
  DEFAULT_SYSTEM_SETTINGS,
  type Election,
  type ElectionRegisteredVoterCounts,
  ElectionPackageFileName,
  formatBallotHash,
  LATEST_SOFTWARE_VERSION,
  LanguageCode,
  type SoftwareVersion,
} from '@votingworks/types';
import { getEntries, openZip, readEntry } from '@votingworks/utils';
import {
  needsColorNormalization,
  normalizeBallotColorModeForPrinting,
} from './ballot_pdfs.js';
import { LocalFileStorageClient } from './file_storage_client.js';
import {
  type ElectionPackageAndBallotsContext,
  type ElectionPackageAndBallotsInput,
  renderElectionPackageAndBallots,
} from './render_election_package_and_ballots.js';

vi.mock(import('./ballot_pdfs.js'), async (importActual) => ({
  ...(await importActual()),
  needsColorNormalization: vi.fn(),
  normalizeBallotColorModeForPrinting: vi.fn(),
}));

const fullElection = electionFamousNames2021Fixtures.readElection();
const ballotStyle = assertDefined(fullElection.ballotStyles[0]);
const precinctId = assertDefined(ballotStyle.precincts[0]);
const election: Election = {
  ...fullElection,
  precincts: fullElection.precincts.filter((p) => p.id === precinctId),
  ballotStyles: [{ ...ballotStyle, precincts: [precinctId] }],
};

const englishOnlyTranslator: Translator = {
  translateText: () => Promise.reject(new Error('Unexpected translation')),
};

let storageRoot: string;
let context: ElectionPackageAndBallotsContext;

function baseInput(): ElectionPackageAndBallotsInput {
  return {
    election,
    stateCode: 'DEMO',
    ballotLanguageConfigs: [{ languages: [LanguageCode.ENGLISH] }],
    ballotTemplateId: 'VxDefaultBallot',
    getCandidateOrderings: (bs) => bs.orderedCandidatesByContest,
    compact: false,
    systemSettings: DEFAULT_SYSTEM_SETTINGS,
    registeredVoterCounts: { [precinctId]: { total: 100 } },
    softwareVersion: LATEST_SOFTWARE_VERSION,
    electionSerializationFormat: 'vxf',
  };
}

async function readZipEntryNames(path: string): Promise<string[]> {
  const zip = await openZip(await readFile(path));
  return getEntries(zip).map((entry) => entry.name);
}

beforeEach(() => {
  vi.mocked(needsColorNormalization).mockReturnValue(false);
  storageRoot = makeTemporaryDirectory();
  context = {
    translator: englishOnlyTranslator,
    createRendererPool: () => createPlaywrightRendererPool(2),
    fileStorageClient: new LocalFileStorageClient(storageRoot),
    outputDirectory: 'output',
    scratchDir: { path: makeTemporaryDirectory() },
    emitProgress: vi.fn(),
  };
});

afterEach(() => {
  vi.mocked(needsColorNormalization).mockReset();
  vi.mocked(normalizeBallotColorModeForPrinting).mockReset();
});

test('renders the election package and the official, sample and test ballot zips', async () => {
  const speechSynthesizer: SpeechSynthesizer = {
    synthesizeSpeech: vi.fn().mockResolvedValue('audio'),
  };
  const output = await renderElectionPackageAndBallots(context, {
    ...baseInput(),
    audio: { speechSynthesizer, electionTtsEdits: [] },
    shouldExportSampleBallots: true,
    shouldExportTestBallots: true,
  });

  const ballotHash = formatBallotHash(output.electionDefinition.ballotHash);
  expect(output.electionPackagePath).toMatch(
    new RegExp(`^output/election-package-${ballotHash}-[0-9a-f]+\\.zip$`)
  );
  expect(output).toMatchObject({
    officialBallotsPath: `output/official-ballots-${ballotHash}.zip`,
    sampleBallotsPath: `output/sample-ballots-${ballotHash}.zip`,
    testBallotsPath: `output/test-ballots-${ballotHash}.zip`,
  });
  expect(context.emitProgress).toHaveBeenCalled();
  expect(speechSynthesizer.synthesizeSpeech).toHaveBeenCalled();
  expect(normalizeBallotColorModeForPrinting).not.toHaveBeenCalled();

  const electionPackagePath = join(storageRoot, output.electionPackagePath);
  const { electionPackage } = (
    await readElectionPackageFromFile(electionPackagePath)
  ).unsafeUnwrap();
  expect(electionPackage.electionDefinition.ballotHash).toEqual(
    output.electionDefinition.ballotHash
  );
  expect(electionPackage.systemSettings).toEqual(DEFAULT_SYSTEM_SETTINGS);
  expect(electionPackage.registeredVoterCounts).toEqual({
    [precinctId]: { total: 100 },
  });
  expect(Object.keys(electionPackage.uiStringAudioIds)).not.toHaveLength(0);

  const electionPackageEntryNames =
    await readZipEntryNames(electionPackagePath);
  expect(electionPackageEntryNames).toEqual(
    expect.arrayContaining([
      ElectionPackageFileName.METADATA,
      ElectionPackageFileName.APP_STRINGS,
      ElectionPackageFileName.ELECTION,
      ElectionPackageFileName.SYSTEM_SETTINGS,
      ElectionPackageFileName.REGISTERED_VOTER_COUNTS,
      ElectionPackageFileName.AUDIO_IDS,
      ElectionPackageFileName.AUDIO_CLIPS,
      ElectionPackageFileName.BALLOTS,
    ])
  );
  expect(electionPackageEntryNames).not.toContain(
    ElectionPackageFileName.BALLOT_POSITIONS
  );

  const ballotsEntry = assertDefined(
    getEntries(await openZip(await readFile(electionPackagePath))).find(
      (entry) => entry.name === ElectionPackageFileName.BALLOTS
    )
  );
  const encodedBallots = (await readEntry(ballotsEntry))
    .toString('utf-8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(
    encodedBallots.map(({ ballotMode, ballotType }) => [ballotMode, ballotType])
  ).toEqual(
    expect.arrayContaining([
      ['official', BallotType.Precinct],
      ['official', BallotType.Absentee],
      ['sample', BallotType.Precinct],
      ['test', BallotType.Precinct],
    ])
  );
  expect(encodedBallots).toHaveLength(6);

  for (const [path, mode, hasCalibrationSheet] of [
    [assertDefined(output.officialBallotsPath), 'official', true],
    [assertDefined(output.sampleBallotsPath), 'sample', false],
    [assertDefined(output.testBallotsPath), 'test', true],
  ] as const) {
    const entryNames = await readZipEntryNames(join(storageRoot, path));
    expect(entryNames.filter((name) => name.startsWith(`${mode}-`))).toEqual(
      expect.arrayContaining([
        expect.stringMatching(new RegExp(`^${mode}-precinct-ballot-.*\\.pdf$`)),
        expect.stringMatching(new RegExp(`^${mode}-absentee-ballot-.*\\.pdf$`)),
      ])
    );
    expect(entryNames.includes('VxScan-calibration-sheet.pdf')).toEqual(
      hasCalibrationSheet
    );
  }
});

test('renders a split election definition with ballot audit IDs and normalizes ballot colors', async () => {
  vi.mocked(needsColorNormalization).mockReturnValue(true);
  const output = await renderElectionPackageAndBallots(context, {
    ...baseInput(),
    systemSettings: {
      ...DEFAULT_SYSTEM_SETTINGS,
      splitElectionDefinition: true,
    },
    numAuditIdBallots: 2,
  });

  expect(output.sampleBallotsPath).toBeUndefined();
  expect(output.testBallotsPath).toBeUndefined();
  expect(normalizeBallotColorModeForPrinting).toHaveBeenCalledTimes(2);

  const electionPackagePath = join(storageRoot, output.electionPackagePath);
  expect(await readZipEntryNames(electionPackagePath)).toEqual(
    expect.arrayContaining([
      ElectionPackageFileName.BALLOT_POSITIONS,
      ElectionPackageFileName.CANDIDATE_ORDERINGS,
    ])
  );
  const { electionPackage } = (
    await readElectionPackageFromFile(electionPackagePath)
  ).unsafeUnwrap();
  expect(electionPackage.systemSettings).toEqual({
    ...DEFAULT_SYSTEM_SETTINGS,
    splitElectionDefinition: true,
    precinctScanEnableBallotAuditIds: true,
  });
  expect(electionPackage.uiStringAudioIds).toEqual({});

  expect(
    (
      await readZipEntryNames(join(storageRoot, output.officialBallotsPath))
    ).sort()
  ).toEqual([
    'VxScan-calibration-sheet.pdf',
    expect.stringMatching(/^official-precinct-ballot-.*-1\.pdf$/),
    expect.stringMatching(/^official-precinct-ballot-.*-2\.pdf$/),
  ]);
});

test('exports registered voter counts as totals for v4.0 and as objects for v4.1', async () => {
  const partyId = assertDefined(fullElection.parties[0]).id;
  const registeredVoterCounts: ElectionRegisteredVoterCounts = {
    [precinctId]: { total: 100, byParty: { [partyId]: 60 }, nonpartisan: 40 },
  };

  async function exportedRegisteredVoterCounts(
    softwareVersion: SoftwareVersion
  ): Promise<unknown> {
    const output = await renderElectionPackageAndBallots(context, {
      ...baseInput(),
      softwareVersion,
      registeredVoterCounts,
    });
    const zip = await openZip(
      await readFile(join(storageRoot, output.electionPackagePath))
    );
    const entry = assertDefined(
      getEntries(zip).find(
        (e) => e.name === ElectionPackageFileName.REGISTERED_VOTER_COUNTS
      )
    );
    return JSON.parse((await readEntry(entry)).toString('utf-8'));
  }

  expect(await exportedRegisteredVoterCounts('v4.0')).toEqual({
    [precinctId]: 100,
  });
  expect(await exportedRegisteredVoterCounts('v4.1')).toEqual(
    registeredVoterCounts
  );
});
