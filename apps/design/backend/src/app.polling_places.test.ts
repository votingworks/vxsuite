import { afterAll, describe, expect, test } from 'vitest';
import { err, ok } from '@votingworks/basics';
import {
  PollingPlace,
  pollingPlaceGenerateFromPrecinct,
  pollingPlacesGenerateFromPrecincts,
  Precinct,
  PrecinctSplit,
} from '@votingworks/types';
import { electionGeneralFixtures } from '@votingworks/fixtures';
import { testSetupHelpers } from '../test/helpers';
import { nonVxUser, organizations, jurisdictions } from '../test/mocks';
import { getStateFeaturesConfig } from './features';
import { Jurisdiction, User } from './types';

const { setupApp, cleanup } = testSetupHelpers();

afterAll(cleanup);

test('polling places CRUD', async () => {
  const user = nonVxUser;
  const jurisdiction = user.jurisdictions[0];
  expectEditingEnabled(jurisdiction, false);

  const { apiClient, auth0 } = await setupApp({
    organizations,
    jurisdictions: user.jurisdictions,
    users: [user],
  });

  auth0.setLoggedInUser(user);
  const electionId = (
    await apiClient.createElection({
      jurisdictionId: jurisdiction.id,
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

test('polling place updates on precinct creation/update/deletion', async () => {
  const user = nonVxUser;
  const jurisdiction = user.jurisdictions[1];
  expectEditingEnabled(jurisdiction, true);

  const { apiClient: api, auth0 } = await setupApp({
    organizations,
    jurisdictions,
    users: [user],
  });

  auth0.setLoggedInUser(user);

  const electionId = (
    await api.createElection({
      jurisdictionId: jurisdiction.id,
      id: 'election1',
    })
  ).unsafeUnwrap();

  expect(await api.listPollingPlaces({ electionId })).toEqual([]);

  // Expect polling place generation on precinct creation:

  const splits: PrecinctSplit[] = [
    { districtIds: [], id: 's1', name: 'Split 1' },
    { districtIds: [], id: 's2', name: 'Split 2' },
  ];
  const precincts: Precinct[] = [
    { id: 'precinct1', name: 'Precinct 1', districtIds: [] },
    { id: 'precinct2', name: 'Precinct 2', districtIds: [], splits },
  ];
  for (const newPrecinct of precincts) {
    const res = await api.createPrecinct({ electionId, newPrecinct });
    expect(res).toEqual(ok());
  }

  const placeFromPrecinct1 = pollingPlaceGenerateFromPrecinct({
    precinct: precincts[0],
    id: expect.any(String),
    type: 'election_day',
  });
  const placeFromPrecinct2 = pollingPlaceGenerateFromPrecinct({
    precinct: precincts[1],
    id: expect.any(String),
    type: 'election_day',
  });

  expect(await api.listPollingPlaces({ electionId })).toEqual([
    placeFromPrecinct1,
    placeFromPrecinct2,
  ]);

  const customPlace1: PollingPlace = {
    id: 'customPlace1',
    name: 'Custom Place 1',
    precincts: {
      precinct1: { type: 'whole' },
      precinct2: { type: 'whole' },
    },
    type: 'election_day',
  };

  expect(
    await api.setPollingPlace({ electionId, place: customPlace1 })
  ).toEqual(ok());

  expect(await api.listPollingPlaces({ electionId })).toEqual([
    // Alphabetically sorted:
    customPlace1,
    placeFromPrecinct1,
    placeFromPrecinct2,
  ]);

  // Updating a precinct maintains polling place links:

  expect(
    await api.updatePrecinct({
      electionId,
      updatedPrecinct: {
        ...precincts[0],
        name: 'Precinct 1 (Updated)',
      },
    })
  ).toEqual(ok());

  expect(await api.listPollingPlaces({ electionId })).toEqual([
    customPlace1,
    placeFromPrecinct1,
    placeFromPrecinct2,
  ]);

  // Deleting precincts removes polling place links:

  await api.deletePrecinct({ electionId, precinctId: precincts[0].id });

  const customPlace1Updated: PollingPlace = {
    ...customPlace1,
    precincts: { precinct2: { type: 'whole' } },
  };
  const placeFromPrecinct1Updated: PollingPlace = {
    ...placeFromPrecinct1,
    precincts: {},
  };
  expect(await api.listPollingPlaces({ electionId })).toEqual([
    customPlace1Updated,
    placeFromPrecinct1Updated,
    placeFromPrecinct2,
  ]);

  // Creating precinct with name matching existing polling place is no-op:

  expect(
    await api.createPrecinct({
      electionId,
      newPrecinct: {
        districtIds: [],
        id: 'precinct3',
        name: customPlace1.name,
      },
    })
  ).toEqual(ok());

  expect(await api.listPollingPlaces({ electionId })).toEqual([
    customPlace1Updated,
    placeFromPrecinct1Updated,
    placeFromPrecinct2,
  ]);
});

describe('loadElection', () => {
  const electionDef = electionGeneralFixtures.readElectionDefinition();
  const [precinct1, precinct2] = electionDef.election.precincts;

  const place1: PollingPlace = {
    id: 'place1',
    name: 'Place 1',
    precincts: { [precinct1.id]: { type: 'whole' } },
    type: 'election_day',
  };

  const place2: PollingPlace = {
    id: 'place2',
    name: 'Place 2',
    precincts: {
      [precinct1.id]: { type: 'whole' },
      [precinct2.id]: { type: 'whole' },
    },
    type: 'absentee',
  };

  async function setUpAppAndElection(
    user: User,
    jurisdiction: Jurisdiction,
    pollingPlaces?: PollingPlace[]
  ) {
    const { apiClient: api, auth0 } = await setupApp({
      organizations,
      jurisdictions,
      users: [user],
    });
    auth0.setLoggedInUser(user);

    const electionFileContents = JSON.stringify({
      ...electionDef.election,
      pollingPlaces,
    });

    const electionId = (
      await api.loadElection({
        jurisdictionId: jurisdiction.id,
        newId: 'newElection',
        upload: { format: 'vxf', electionFileContents },
      })
    ).unsafeUnwrap();

    return { api, electionId };
  }

  describe('stateFeatures.EDIT_POLLING_PLACES === true', () => {
    const user = nonVxUser;
    const jurisdiction = user.jurisdictions[1];
    expectEditingEnabled(jurisdiction, true);

    test('uses existing polling places if present', async () => {
      const { api, electionId } = await setUpAppAndElection(
        user,
        jurisdiction,
        [place1, place2]
      );

      const [precinctCopy1, precinctCopy2] = await api.listPrecincts({
        electionId,
      });
      expect(await api.listPollingPlaces({ electionId })).toEqual([
        {
          ...place1,
          id: expect.not.stringMatching(place1.id),
          precincts: { [precinctCopy1.id]: { type: 'whole' } },
        },
        {
          ...place2,
          id: expect.not.stringMatching(place2.id),
          precincts: {
            [precinctCopy1.id]: { type: 'whole' },
            [precinctCopy2.id]: { type: 'whole' },
          },
        },
      ]);
    });

    test('generates missing polling places from precincts', async () => {
      const { api, electionId } = await setUpAppAndElection(user, jurisdiction);

      const precincts = await api.listPrecincts({ electionId });
      const expectedPlaces = pollingPlacesGenerateFromPrecincts(
        precincts,
        'election_day',
        () => expect.any(String)
      );
      expect(await api.listPollingPlaces({ electionId })).toEqual(
        expectedPlaces
      );
    });
  });

  describe('stateFeatures.EDIT_POLLING_PLACES === false', () => {
    const user = nonVxUser;
    const jurisdiction = user.jurisdictions[0];
    expectEditingEnabled(jurisdiction, false);

    test('ignores polling places if present', async () => {
      const { api, electionId } = await setUpAppAndElection(
        user,
        jurisdiction,
        [place1, place2]
      );

      expect(await api.listPollingPlaces({ electionId })).toEqual([]);
    });

    test('does not generate missing polling place', async () => {
      const { api, electionId } = await setUpAppAndElection(user, jurisdiction);

      expect(await api.listPollingPlaces({ electionId })).toEqual([]);
    });
  });
});

describe('cloneElection', () => {
  const electionDef = electionGeneralFixtures.readElectionDefinition();
  const [precinct1, precinct2] = electionDef.election.precincts;

  const place1: PollingPlace = {
    id: 'place1',
    name: 'Place 1',
    precincts: { [precinct1.id]: { type: 'whole' } },
    type: 'election_day',
  };

  const place2: PollingPlace = {
    id: 'place2',
    name: 'Place 2',
    precincts: {
      [precinct1.id]: { type: 'whole' },
      [precinct2.id]: { type: 'whole' },
    },
    type: 'absentee',
  };

  async function setUpAppAndSrcElection(
    user: User,
    jurisdiction: Jurisdiction,
    pollingPlaces?: PollingPlace[]
  ) {
    const { apiClient: api, auth0 } = await setupApp({
      organizations,
      jurisdictions,
      users: [user],
    });
    auth0.setLoggedInUser(user);

    const electionFileContents = JSON.stringify({
      ...electionDef.election,
      pollingPlaces,
    });

    const electionId = (
      await api.loadElection({
        jurisdictionId: jurisdiction.id,
        newId: 'newElection',
        upload: { format: 'vxf', electionFileContents },
      })
    ).unsafeUnwrap();

    return { api, electionId };
  }

  describe('stateFeatures.EDIT_POLLING_PLACES === true', () => {
    const user = nonVxUser;

    const srcJurisdiction = user.jurisdictions[1];
    expectEditingEnabled(srcJurisdiction, true);

    const destJurisdiction = user.jurisdictions[1];
    expectEditingEnabled(destJurisdiction, true);

    test('clones source polling places if present', async () => {
      const { api, electionId } = await setUpAppAndSrcElection(
        user,
        srcJurisdiction,
        [place1, place2]
      );

      const clonedElectionId = await api.cloneElection({
        electionId,
        destElectionId: 'clonedElection',
        destJurisdictionId: destJurisdiction.id,
      });

      const [precinctCopy1, precinctCopy2] = await api.listPrecincts({
        electionId: clonedElectionId,
      });
      expect(
        await api.listPollingPlaces({ electionId: clonedElectionId })
      ).toEqual([
        {
          ...place1,
          id: expect.not.stringMatching(place1.id),
          precincts: { [precinctCopy1.id]: { type: 'whole' } },
        },
        {
          ...place2,
          id: expect.not.stringMatching(place2.id),
          precincts: {
            [precinctCopy1.id]: { type: 'whole' },
            [precinctCopy2.id]: { type: 'whole' },
          },
        },
      ]);
    });

    test('generates missing polling places from cloned precincts', async () => {
      const { api, electionId } = await setUpAppAndSrcElection(
        user,
        destJurisdiction
      );

      const clonedElectionId = await api.cloneElection({
        electionId,
        destElectionId: 'clonedElection',
        destJurisdictionId: destJurisdiction.id,
      });

      const expectedPlaces = pollingPlacesGenerateFromPrecincts(
        await api.listPrecincts({ electionId: clonedElectionId }),
        'election_day',
        () => expect.any(String)
      );

      expect(
        await api.listPollingPlaces({ electionId: clonedElectionId })
      ).toEqual(expectedPlaces);
    });
  });

  describe('stateFeatures.EDIT_POLLING_PLACES === false', () => {
    const user = nonVxUser;

    const srcJurisdiction = user.jurisdictions[1];
    expectEditingEnabled(srcJurisdiction, true);

    const destJurisdiction = user.jurisdictions[0];
    expectEditingEnabled(destJurisdiction, false);

    test('ignores source polling places if present', async () => {
      const { api, electionId } = await setUpAppAndSrcElection(
        user,
        srcJurisdiction,
        [place1, place2]
      );

      const clonedElectionId = await api.cloneElection({
        electionId,
        destElectionId: 'clonedElection',
        destJurisdictionId: destJurisdiction.id,
      });

      expect(
        await api.listPollingPlaces({ electionId: clonedElectionId })
      ).toEqual([]);
    });

    test('does not generate missing polling places', async () => {
      const { api, electionId } = await setUpAppAndSrcElection(
        user,
        srcJurisdiction
      );

      const clonedElectionId = await api.cloneElection({
        electionId,
        destElectionId: 'clonedElection',
        destJurisdictionId: destJurisdiction.id,
      });

      expect(
        await api.listPollingPlaces({ electionId: clonedElectionId })
      ).toEqual([]);
    });
  });
});

function expectEditingEnabled(jurisdiction: Jurisdiction, expected: boolean) {
  const enabled = !!getStateFeaturesConfig(jurisdiction).EDIT_POLLING_PLACES;
  expect(enabled).toEqual(expected);
}
