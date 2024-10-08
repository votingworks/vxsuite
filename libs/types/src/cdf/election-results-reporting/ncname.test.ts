import { assertDefined } from '@votingworks/basics';
import { election } from '../../../test/election';
import { Candidate, PartyId } from '../../election';
import {
  asNcName,
  getCandidateId,
  getCandidateSelectionId,
  getContestId,
  getCountyId,
  getDistrictId,
  getDistrictIdFromContest,
  getNoOptionId,
  getPartyId,
  getPartyIdForCandidate,
  getStateId,
  getYesOptionId,
} from './ncname';

test('asNcName', () => {
  const str = 'test:str';
  expect(asNcName(str)).toEqual('vx_teststr');
});

test('getStateId', () => {
  expect(getStateId(election)).toEqual('vx_state');
});

test('getCountyId', () => {
  expect(getCountyId(election)).toEqual('vx_COUNTY');
});

test('getDistrictId', () => {
  expect(getDistrictId(election.districts[0])).toEqual('vx_D');
});

test('getContestId', () => {
  expect(getContestId(election.contests[0])).toEqual('vx_CC');
});

test('getDistrictIdFromContest', () => {
  expect(getDistrictIdFromContest(election.contests[0])).toEqual('vx_D');
});

test('getPartyId', () => {
  expect(getPartyId(election.parties[0])).toEqual('vx_PARTY');
});

test('getCandidateId', () => {
  const candidateContest = assertDefined(
    election.contests.find((contest) => contest.type === 'candidate')
  );
  expect(getCandidateId(candidateContest.candidates[0])).toEqual('vx_C');
});

test('getCandidateSelectionId', () => {
  const candidateContest = assertDefined(
    election.contests.find((contest) => contest.type === 'candidate')
  );
  expect(
    getCandidateSelectionId(candidateContest, candidateContest.candidates[0].id)
  ).toEqual('vx_CC_C');
});

test('getYesOptionId', () => {
  const yesNoContest = assertDefined(
    election.contests.find((contest) => contest.type === 'yesno')
  );
  expect(getYesOptionId(yesNoContest)).toEqual('vx_YNC-option-yes');
});

test('getNoOptionId', () => {
  const yesNoContest = assertDefined(
    election.contests.find((contest) => contest.type === 'yesno')
  );
  expect(getNoOptionId(yesNoContest)).toEqual('vx_YNC-option-no');
});

test('getPartyIdForCandidate', () => {
  const candidateContest = assertDefined(
    election.contests.find((contest) => contest.type === 'candidate')
  );
  const candidate: Candidate = {
    ...candidateContest.candidates[0],
    partyIds: ['0' as PartyId],
  };
  expect(getPartyIdForCandidate(candidate)).toEqual('vx_0');
});

test('getPartyIdForCandidate returns undefined if no party ID list', () => {
  const candidateContest = assertDefined(
    election.contests.find((contest) => contest.type === 'candidate')
  );
  const candidate: Candidate = {
    ...candidateContest.candidates[0],
    partyIds: undefined,
  };

  expect(getPartyIdForCandidate(candidate)).toBeUndefined();
});
