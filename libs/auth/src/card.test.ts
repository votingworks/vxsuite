import {
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSystemAdministratorUser,
} from '@votingworks/test-utils';

import {
  areElectionManagerCardDetails,
  arePollWorkerCardDetails,
  areSystemAdministratorCardDetails,
  CardDetails,
} from './card';

const jurisdiction = 'st.jurisdiction';
const systemAdministratorUser = fakeSystemAdministratorUser();
const electionManagerUser = fakeElectionManagerUser();
const pollWorkerUser = fakePollWorkerUser();
const systemAdministratorCardDetails: CardDetails = {
  jurisdiction,
  user: systemAdministratorUser,
};
const electionManagerCardDetails: CardDetails = {
  jurisdiction,
  user: electionManagerUser,
};
const pollWorkerCardDetails: CardDetails = {
  jurisdiction,
  user: pollWorkerUser,
  hasPin: false,
};

test.each<{ cardDetails: CardDetails; result: boolean }>([
  { cardDetails: systemAdministratorCardDetails, result: true },
  { cardDetails: electionManagerCardDetails, result: false },
  { cardDetails: pollWorkerCardDetails, result: false },
])('areSystemAdministratorCardDetails', ({ cardDetails, result }) => {
  expect(areSystemAdministratorCardDetails(cardDetails)).toEqual(result);
});

test.each<{ cardDetails: CardDetails; result: boolean }>([
  { cardDetails: systemAdministratorCardDetails, result: false },
  { cardDetails: electionManagerCardDetails, result: true },
  { cardDetails: pollWorkerCardDetails, result: false },
])('areElectionManagerCardDetails', ({ cardDetails, result }) => {
  expect(areElectionManagerCardDetails(cardDetails)).toEqual(result);
});

test.each<{ cardDetails: CardDetails; result: boolean }>([
  { cardDetails: systemAdministratorCardDetails, result: false },
  { cardDetails: electionManagerCardDetails, result: false },
  { cardDetails: pollWorkerCardDetails, result: true },
])('arePollWorkerCardDetails', ({ cardDetails, result }) => {
  expect(arePollWorkerCardDetails(cardDetails)).toEqual(result);
});
