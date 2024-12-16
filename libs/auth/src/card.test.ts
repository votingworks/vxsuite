import { expect, test } from 'vitest';
import {
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSystemAdministratorUser,
  mockVendorUser,
} from '@votingworks/test-utils';

import {
  areElectionManagerCardDetails,
  arePollWorkerCardDetails,
  areSystemAdministratorCardDetails,
  areVendorCardDetails,
  CardDetails,
} from './card';

const vendorUser = mockVendorUser();
const systemAdministratorUser = mockSystemAdministratorUser();
const electionManagerUser = mockElectionManagerUser();
const pollWorkerUser = mockPollWorkerUser();
const vendorCardDetails: CardDetails = {
  user: vendorUser,
};
const systemAdministratorCardDetails: CardDetails = {
  user: systemAdministratorUser,
};
const electionManagerCardDetails: CardDetails = {
  user: electionManagerUser,
};
const pollWorkerCardDetails: CardDetails = {
  user: pollWorkerUser,
  hasPin: false,
};
const unprogrammedCardDetails: CardDetails = {
  user: undefined,
  reason: 'unprogrammed_or_invalid_card',
};

test.each<{ cardDetails: CardDetails; result: boolean }>([
  { cardDetails: vendorCardDetails, result: true },
  { cardDetails: systemAdministratorCardDetails, result: false },
  { cardDetails: electionManagerCardDetails, result: false },
  { cardDetails: pollWorkerCardDetails, result: false },
  { cardDetails: unprogrammedCardDetails, result: false },
])('areVendorCardDetails', ({ cardDetails, result }) => {
  expect(areVendorCardDetails(cardDetails)).toEqual(result);
});

test.each<{ cardDetails: CardDetails; result: boolean }>([
  { cardDetails: vendorCardDetails, result: false },
  { cardDetails: systemAdministratorCardDetails, result: true },
  { cardDetails: electionManagerCardDetails, result: false },
  { cardDetails: pollWorkerCardDetails, result: false },
  { cardDetails: unprogrammedCardDetails, result: false },
])('areSystemAdministratorCardDetails', ({ cardDetails, result }) => {
  expect(areSystemAdministratorCardDetails(cardDetails)).toEqual(result);
});

test.each<{ cardDetails: CardDetails; result: boolean }>([
  { cardDetails: vendorCardDetails, result: false },
  { cardDetails: systemAdministratorCardDetails, result: false },
  { cardDetails: electionManagerCardDetails, result: true },
  { cardDetails: pollWorkerCardDetails, result: false },
  { cardDetails: unprogrammedCardDetails, result: false },
])('areElectionManagerCardDetails', ({ cardDetails, result }) => {
  expect(areElectionManagerCardDetails(cardDetails)).toEqual(result);
});

test.each<{ cardDetails: CardDetails; result: boolean }>([
  { cardDetails: vendorCardDetails, result: false },
  { cardDetails: systemAdministratorCardDetails, result: false },
  { cardDetails: electionManagerCardDetails, result: false },
  { cardDetails: pollWorkerCardDetails, result: true },
  { cardDetails: unprogrammedCardDetails, result: false },
])('arePollWorkerCardDetails', ({ cardDetails, result }) => {
  expect(arePollWorkerCardDetails(cardDetails)).toEqual(result);
});
