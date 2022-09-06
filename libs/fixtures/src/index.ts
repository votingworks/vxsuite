import { Election, ElectionDefinition } from '@votingworks/types';
import { sha256 } from 'js-sha256';

export * as electionFamousNames2021Fixtures from './data/electionFamousNames2021';
export * as electionSample2Fixtures from './data/electionSample2';
export * as electionMultiPartyPrimaryFixtures from './data/electionMultiPartyPrimary';
export * as electionMinimalExhaustiveSampleFixtures from './data/electionMinimalExhaustiveSample';
export * as electionMinimalExhaustiveSampleWithReportingUrlFixtures from './data/electionMinimalExhaustiveSampleWithReportingUrl';
export * as electionWithMsEitherNeitherFixtures from './data/electionWithMsEitherNeither';
export * as primaryElectionSampleFixtures from './data/electionPrimary';
export {
  electionDefinition as electionSampleDefinition,
  election as electionSample,
} from './data/electionSample.json';
export {
  electionDefinition as electionSample2Definition,
  election as electionSample2,
} from './data/electionSample2/election.json';
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
  electionDefinition as electionMinimalExhaustiveSampleRightSideTargetsDefinition,
  election as electionMinimalExhaustiveSampleRightSideTargets,
} from './data/electionMinimalExhaustiveSampleRightSideTargets/electionMinimalExhaustiveSampleRightSideTargets.json';
export {
  electionDefinition as primaryElectionSampleDefinition,
  election as primaryElectionSample,
} from './data/electionPrimary';
export {
  electionDefinition as electionSampleNoSealDefinition,
  election as electionSampleNoSeal,
} from './data/electionSampleNoSeal.json';
export {
  electionDefinition as electionSampleLongContentDefinition,
  election as electionSampleLongContent,
} from './data/electionSampleLongContent.json';
export {
  electionDefinition as electionSampleRotationDefinition,
  election as electionSampleRotation,
} from './data/electionSampleRotation.json';

export function asElectionDefinition(election: Election): ElectionDefinition {
  const electionData = JSON.stringify(election);
  return {
    election,
    electionData,
    electionHash: sha256(electionData),
  };
}
