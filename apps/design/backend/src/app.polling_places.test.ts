import { afterAll, expect, test } from 'vitest';
import { err, ok } from '@votingworks/basics';
import { PollingPlace, Precinct, PrecinctSplit } from '@votingworks/types';
import { testSetupHelpers } from '../test/helpers';
import { organizations, nonVxUser, nonVxJurisdiction } from '../test/mocks';

const { setupApp, cleanup } = testSetupHelpers();

afterAll(cleanup);

test('polling places CRUD', async () => {
  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions: nonVxUser.jurisdictions,
    users: [nonVxUser],
  });

  auth0.setLoggedInUser(nonVxUser);
  const electionId = (
    await apiClient.createElection({
      jurisdictionId: nonVxJurisdiction.id,
      id: 'election1',
    })
  ).unsafeUnwrap();

  expect(await apiClient.listPollingPlaces({ electionId })).toEqual([]);

  // Should error on invalid precinct:

  const initialPlace1: PollingPlace = {
    id: 'place1',
    name: 'Place 1',
    precincts: {
      precinct1: { type: 'whole' },
    },
    type: 'election_day',
  };
  expect(
    await apiClient.setPollingPlace({ electionId, place: initialPlace1 })
  ).toEqual(err('invalid-precinct'));

  // Precincts/splits setup:

  const splits: PrecinctSplit[] = [
    { districtIds: [], id: 's1', name: 'Split 1' },
    { districtIds: [], id: 's2', name: 'Split 2' },
  ];
  const precincts: Precinct[] = [
    { id: 'precinct1', name: 'Precinct 1', districtIds: [] },
    { id: 'precinct2', name: 'Precinct 2', districtIds: [], splits },
  ];
  for (const newPrecinct of precincts) {
    const res = await apiClient.createPrecinct({ electionId, newPrecinct });
    res.unsafeUnwrap();
  }

  // Add and retrieve valid polling place:

  expect(
    await apiClient.setPollingPlace({ electionId, place: initialPlace1 })
  ).toEqual(ok());

  expect(await apiClient.listPollingPlaces({ electionId })).toEqual([
    initialPlace1,
  ]);

  // Update and retrieve existing polling place:

  const updatedPlace1: PollingPlace = {
    ...initialPlace1,
    name: 'Place 1 (Updated)',
    precincts: {
      precinct1: { type: 'whole' },
      precinct2: { type: 'whole' },
    },
  };
  expect(
    await apiClient.setPollingPlace({ electionId, place: updatedPlace1 })
  ).toEqual(ok());

  expect(await apiClient.listPollingPlaces({ electionId })).toEqual([
    updatedPlace1,
  ]);

  // Should error on new place with duplicate name:

  expect(
    await apiClient.setPollingPlace({
      electionId,
      place: { ...updatedPlace1, id: 'place1-copy' },
    })
  ).toEqual(err('duplicate-name'));

  // Can add polling place with duplicate name, if it has a different type:

  const place1EarlyVoting: PollingPlace = {
    ...updatedPlace1,
    id: 'place1-early',
    type: 'early_voting',
  };

  expect(
    await apiClient.setPollingPlace({
      electionId,
      place: place1EarlyVoting,
    })
  ).toEqual(ok());

  expect(await apiClient.listPollingPlaces({ electionId })).toEqual([
    updatedPlace1,
    place1EarlyVoting,
  ]);

  // Add new place, get updated list:

  const place2: PollingPlace = {
    id: 'place2',
    name: 'Place 2',
    precincts: { precinct1: { type: 'whole' } },
    type: 'absentee',
  };
  const place3: PollingPlace = {
    id: 'place3',
    name: 'Place 3',
    precincts: { precinct2: { type: 'whole' } },
    type: 'early_voting',
  };

  expect(
    await apiClient.setPollingPlace({ electionId, place: place3 })
  ).toEqual(ok());
  expect(
    await apiClient.setPollingPlace({ electionId, place: place2 })
  ).toEqual(ok());

  expect(await apiClient.listPollingPlaces({ electionId })).toEqual([
    updatedPlace1,
    place1EarlyVoting,
    place2,
    place3,
  ]);

  // Delete existing place, get updated list:

  await apiClient.deletePollingPlace({ electionId, id: place2.id });
  await apiClient.deletePollingPlace({ electionId, id: place2.id }); // no-op

  expect(await apiClient.listPollingPlaces({ electionId })).toEqual([
    updatedPlace1,
    place1EarlyVoting,
    place3,
  ]);
});
