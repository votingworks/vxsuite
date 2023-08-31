import { Election, ElectionDefinition } from '@votingworks/types';
import { sha256 } from 'js-sha256';

export * as electionGridLayoutNewHampshireAmherstFixtures from './data/electionGridLayoutNewHampshireAmherst';
export * as electionGridLayoutNewHampshireHudsonFixtures from './data/electionGridLayoutNewHampshireHudson';
export * as electionFamousNames2021Fixtures from './data/electionFamousNames2021';
export * as electionMultiPartyPrimaryFixtures from './data/electionMultiPartyPrimary';
export * as electionMinimalExhaustiveSampleFixtures from './data/electionMinimalExhaustiveSample';
export * as electionComplexGeoSample from './data/electionComplexGeoSample/election.json';
export * as electionMinimalExhaustiveSampleWithReportingUrlFixtures from './data/electionMinimalExhaustiveSampleWithReportingUrl';
export * as electionWithMsEitherNeitherFixtures from './data/electionWithMsEitherNeither';
export * as sampleBallotImages from './data/sample-ballot-images';
export {
  electionDefinition as electionSampleDefinition,
  election as electionSample,
} from './data/electionSample.json';
export {
  electionDefinition as multiPartyPrimaryElectionDefinition,
  election as multiPartyPrimaryElection,
} from './data/electionMultiPartyPrimary';
export {
  electionDefinition as electionMinimalExhaustiveSampleDefinition,
  election as electionMinimalExhaustiveSample,
} from './data/electionMinimalExhaustiveSample';
export {
  electionDefinition as electionMinimalExhaustiveSampleWithReportingUrlDefinition,
  election as electionMinimalExhaustiveSampleWithReportingUrl,
} from './data/electionMinimalExhaustiveSampleWithReportingUrl';
export {
  electionDefinition as electionWithMsEitherNeitherDefinition,
  election as electionWithMsEitherNeither,
} from './data/electionWithMsEitherNeither';
export {
  electionDefinition as electionMinimalExhaustiveSampleSinglePrecinctDefinition,
  election as electionMinimalExhaustiveSampleSinglePrecinct,
} from './data/electionMinimalExhaustiveSampleSinglePrecinct/election.json';
export {
  electionDefinition as electionSampleLongContentDefinition,
  election as electionSampleLongContent,
} from './data/electionSampleLongContent.json';
export * as systemSettings from './data/sampleAdminInitialSetupPackage/systemSettings.json';

export function asElectionDefinition(election: Election): ElectionDefinition {
  const electionData = JSON.stringify(election);
  return {
    election,
    electionData,
    electionHash: sha256(electionData),
  };
}
