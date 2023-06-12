import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { tmpNameSync } from 'tmp';
import { readFileSync } from 'fs';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';

jest.setTimeout(60_000);

// mock SKIP_CVR_ELECTION_HASH_CHECK to allow us to use old cvr fixtures
const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

beforeEach(() => {
  jest.restoreAllMocks();
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_ELECTION_HASH_CHECK
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

const { electionDefinition, castVoteRecordReport } =
  electionGridLayoutNewHampshireAmherstFixtures;

test('batch export', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordReport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const path = tmpNameSync();
  await apiClient.exportBatchResults({ path });
  expect(readFileSync(path, 'utf-8').toString()).toMatchInlineSnapshot(`
    "Batch ID,Batch Name,Tabulator,Number of Ballots,\\"Governor - Ballots Cast\\",\\"Governor - Undervotes\\",\\"Governor - Overvotes\\",\\"Governor - Josiah Bartlett\\",\\"Governor - Hannah Dustin\\",\\"Governor - John Spencer\\",\\"Governor - Write In\\",\\"United States Senator - Ballots Cast\\",\\"United States Senator - Undervotes\\",\\"United States Senator - Overvotes\\",\\"United States Senator - John Langdon\\",\\"United States Senator - William Preston\\",\\"United States Senator - Write In\\",\\"Representative in Congress - Ballots Cast\\",\\"Representative in Congress - Undervotes\\",\\"Representative in Congress - Overvotes\\",\\"Representative in Congress - Jeremiah Smith\\",\\"Representative in Congress - Nicholas Gilman\\",\\"Representative in Congress - Richard Coote\\",\\"Representative in Congress - Write In\\",\\"Executive Councilor - Ballots Cast\\",\\"Executive Councilor - Undervotes\\",\\"Executive Councilor - Overvotes\\",\\"Executive Councilor - Anne Waldron\\",\\"Executive Councilor - Daniel Webster\\",\\"Executive Councilor - Write In\\",\\"State Senator - Ballots Cast\\",\\"State Senator - Undervotes\\",\\"State Senator - Overvotes\\",\\"State Senator - James Poole\\",\\"State Senator - Matthew Thornton\\",\\"State Senator - Write In\\",\\"State Representatives  Hillsborough District 34 - Ballots Cast\\",\\"State Representatives  Hillsborough District 34 - Undervotes\\",\\"State Representatives  Hillsborough District 34 - Overvotes\\",\\"State Representatives  Hillsborough District 34 - Obadiah Carrigan\\",\\"State Representatives  Hillsborough District 34 - Mary Baker Eddy\\",\\"State Representatives  Hillsborough District 34 - Samuel Bell\\",\\"State Representatives  Hillsborough District 34 - Samuel Livermore\\",\\"State Representatives  Hillsborough District 34 - Elijah Miller\\",\\"State Representatives  Hillsborough District 34 - Isaac Hill\\",\\"State Representatives  Hillsborough District 34 - Abigail Bartlett\\",\\"State Representatives  Hillsborough District 34 - Jacob Freese\\",\\"State Representatives  Hillsborough District 34 - Write In\\",\\"State Representative  Hillsborough District 37 - Ballots Cast\\",\\"State Representative  Hillsborough District 37 - Undervotes\\",\\"State Representative  Hillsborough District 37 - Overvotes\\",\\"State Representative  Hillsborough District 37 - Abeil Foster\\",\\"State Representative  Hillsborough District 37 - Charles H. Hersey\\",\\"State Representative  Hillsborough District 37 - William Lovejoy\\",\\"State Representative  Hillsborough District 37 - Write In\\",\\"Sheriff - Ballots Cast\\",\\"Sheriff - Undervotes\\",\\"Sheriff - Overvotes\\",\\"Sheriff - Edward Randolph\\",\\"Sheriff - Write In\\",\\"County Attorney - Ballots Cast\\",\\"County Attorney - Undervotes\\",\\"County Attorney - Overvotes\\",\\"County Attorney - Ezra Bartlett\\",\\"County Attorney - Mary Woolson\\",\\"County Attorney - Write In\\",\\"County Treasurer - Ballots Cast\\",\\"County Treasurer - Undervotes\\",\\"County Treasurer - Overvotes\\",\\"County Treasurer - John Smith\\",\\"County Treasurer - Jane Jones\\",\\"County Treasurer - Write In\\",\\"Register of Deeds - Ballots Cast\\",\\"Register of Deeds - Undervotes\\",\\"Register of Deeds - Overvotes\\",\\"Register of Deeds - John Mann\\",\\"Register of Deeds - Ellen A. Stileman\\",\\"Register of Deeds - Write In\\",\\"Register of Probate - Ballots Cast\\",\\"Register of Probate - Undervotes\\",\\"Register of Probate - Overvotes\\",\\"Register of Probate - Nathaniel Parker\\",\\"Register of Probate - Claire Cutts\\",\\"Register of Probate - Write In\\",\\"County Commissioner - Ballots Cast\\",\\"County Commissioner - Undervotes\\",\\"County Commissioner - Overvotes\\",\\"County Commissioner - Ichabod Goodwin\\",\\"County Commissioner - Valbe Cady\\",\\"County Commissioner - Write In\\",\\"Constitutional Amendment Question  1 - Ballots Cast\\",\\"Constitutional Amendment Question  1 - Undervotes\\",\\"Constitutional Amendment Question  1 - Overvotes\\",\\"Constitutional Amendment Question  1 - Yes\\",\\"Constitutional Amendment Question  1 - No\\"
    9822c71014,9822c71014,VX-00-000,184,184,2,4,2,2,172,2,184,2,2,2,176,2,184,2,4,2,2,172,2,184,2,2,2,176,2,184,2,2,2,176,2,184,12,30,60,58,56,56,56,56,56,56,56,184,2,4,2,2,172,2,184,2,0,180,2,184,2,2,2,176,2,184,2,2,2,176,2,184,2,2,2,176,2,184,2,2,2,176,2,184,2,2,2,176,2,184,178,2,2,2
    "
  `);
});
