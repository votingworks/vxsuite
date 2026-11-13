import React from 'react';
import { expect, test, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { DateWithoutTime, err, ok } from '@votingworks/basics';
import type {
  DistrictsUpdate,
  ElectionInfoUpdate,
  PartiesUpdate,
  PollingPlaceDelete,
  PollingPlaceSet,
  PrecinctCreate,
  PrecinctDelete,
  PrecinctUpdate,
} from '@votingworks/election-definition-backend';
import { LanguageCode } from '@votingworks/types';
import { createMockApiClient, provideApi } from '../test/api_helpers.js';
import { render, screen, waitFor } from '../test/react_testing_library.js';
import { useElectionDefinitionApi } from './election_definition_context.js';

const electionInfoUpdate: ElectionInfoUpdate = {
  electionId: 'election-1',
  type: 'general',
  date: new DateWithoutTime('2026-11-03'),
  title: 'General Election',
  state: 'Demo State',
  jurisdictionName: 'Demo County',
  seal: '',
  languageCodes: [LanguageCode.ENGLISH],
};

function UpdateButton(): JSX.Element {
  const updateElectionInfo =
    useElectionDefinitionApi().updateElectionInfo.useMutation();
  return (
    <button
      type="button"
      onClick={() => updateElectionInfo.mutate(electionInfoUpdate)}
    >
      Update
    </button>
  );
}

test('updateElectionInfo calls invalidateElectionQueries on success', async () => {
  const apiMock = createMockApiClient();
  const invalidateElectionQueries = vi.fn().mockResolvedValue(undefined);
  render(
    provideApi(apiMock, <UpdateButton />, {
      options: { invalidateElectionQueries },
    })
  );

  apiMock.updateElectionInfo
    .expectCallWith(electionInfoUpdate)
    .resolves(err('duplicate-title-and-date'));
  await userEvent.click(screen.getByRole('button', { name: 'Update' }));
  apiMock.assertComplete();
  expect(invalidateElectionQueries).not.toHaveBeenCalled();

  apiMock.updateElectionInfo.expectCallWith(electionInfoUpdate).resolves(ok());
  await userEvent.click(screen.getByRole('button', { name: 'Update' }));
  await waitFor(() =>
    expect(invalidateElectionQueries).toHaveBeenCalledWith(
      expect.anything(),
      'election-1'
    )
  );
  apiMock.assertComplete();
});

const districtsUpdate: DistrictsUpdate = {
  electionId: 'election-1',
  newDistricts: [{ id: 'district-1', name: 'District 1' }],
};

function UpdateDistrictsButton(): JSX.Element {
  const updateDistricts =
    useElectionDefinitionApi().updateDistricts.useMutation();
  return (
    <button
      type="button"
      onClick={() => updateDistricts.mutate(districtsUpdate)}
    >
      Update Districts
    </button>
  );
}

test('updateDistricts calls invalidateElectionQueries on success', async () => {
  const apiMock = createMockApiClient();
  const invalidateElectionQueries = vi.fn().mockResolvedValue(undefined);
  render(
    provideApi(apiMock, <UpdateDistrictsButton />, {
      options: { invalidateElectionQueries },
    })
  );

  apiMock.updateDistricts
    .expectCallWith(districtsUpdate)
    .resolves(err({ code: 'duplicate-name', districtId: 'district-1' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Update Districts' })
  );
  apiMock.assertComplete();
  expect(invalidateElectionQueries).not.toHaveBeenCalled();

  apiMock.updateDistricts.expectCallWith(districtsUpdate).resolves(ok());
  await userEvent.click(
    screen.getByRole('button', { name: 'Update Districts' })
  );
  await waitFor(() =>
    expect(invalidateElectionQueries).toHaveBeenCalledWith(
      expect.anything(),
      'election-1'
    )
  );
  apiMock.assertComplete();
});

const partiesUpdate: PartiesUpdate = {
  electionId: 'election-1',
  newParties: [
    {
      id: 'party-1',
      name: 'Democrat',
      fullName: 'Democratic Party',
      abbrev: 'D',
    },
  ],
};

function UpdatePartiesButton(): JSX.Element {
  const updateParties = useElectionDefinitionApi().updateParties.useMutation();
  return (
    <button type="button" onClick={() => updateParties.mutate(partiesUpdate)}>
      Update Parties
    </button>
  );
}

test('updateParties calls invalidateElectionQueries on success', async () => {
  const apiMock = createMockApiClient();
  const invalidateElectionQueries = vi.fn().mockResolvedValue(undefined);
  render(
    provideApi(apiMock, <UpdatePartiesButton />, {
      options: { invalidateElectionQueries },
    })
  );

  apiMock.updateParties
    .expectCallWith(partiesUpdate)
    .resolves(err({ code: 'duplicate-abbrev', partyId: 'party-1' }));
  await userEvent.click(screen.getButton('Update Parties'));
  apiMock.assertComplete();
  expect(invalidateElectionQueries).not.toHaveBeenCalled();

  apiMock.updateParties.expectCallWith(partiesUpdate).resolves(ok());
  await userEvent.click(screen.getButton('Update Parties'));
  await waitFor(() =>
    expect(invalidateElectionQueries).toHaveBeenCalledWith(
      expect.anything(),
      'election-1'
    )
  );
  apiMock.assertComplete();
});

const precinctCreate: PrecinctCreate = {
  electionId: 'election-1',
  newPrecinct: { id: 'precinct-1', name: 'Precinct 1', districtIds: [] },
};
const precinctUpdate: PrecinctUpdate = {
  electionId: 'election-1',
  updatedPrecinct: { id: 'precinct-1', name: 'Precinct 1', districtIds: [] },
  registeredVoterCounts: 10,
};
const precinctDelete: PrecinctDelete = {
  electionId: 'election-1',
  precinctId: 'precinct-1',
};

function PrecinctButtons(): JSX.Element {
  const api = useElectionDefinitionApi();
  const createPrecinct = api.createPrecinct.useMutation();
  const updatePrecinct = api.updatePrecinct.useMutation();
  const deletePrecinct = api.deletePrecinct.useMutation();
  return (
    <React.Fragment>
      <button
        type="button"
        onClick={() => createPrecinct.mutate(precinctCreate)}
      >
        Create Precinct
      </button>
      <button
        type="button"
        onClick={() => updatePrecinct.mutate(precinctUpdate)}
      >
        Update Precinct
      </button>
      <button
        type="button"
        onClick={() => deletePrecinct.mutate(precinctDelete)}
      >
        Delete Precinct
      </button>
    </React.Fragment>
  );
}

test('precinct mutations call invalidateElectionQueries on success', async () => {
  const apiMock = createMockApiClient();
  const invalidateElectionQueries = vi.fn().mockResolvedValue(undefined);
  render(
    provideApi(apiMock, <PrecinctButtons />, {
      options: { invalidateElectionQueries },
    })
  );

  apiMock.createPrecinct
    .expectCallWith(precinctCreate)
    .resolves(err('duplicate-precinct-name'));
  await userEvent.click(screen.getButton('Create Precinct'));
  apiMock.updatePrecinct
    .expectCallWith(precinctUpdate)
    .resolves(err('duplicate-split-name'));
  await userEvent.click(screen.getButton('Update Precinct'));
  apiMock.assertComplete();
  expect(invalidateElectionQueries).not.toHaveBeenCalled();

  apiMock.createPrecinct.expectCallWith(precinctCreate).resolves(ok());
  await userEvent.click(screen.getButton('Create Precinct'));
  await waitFor(() =>
    expect(invalidateElectionQueries).toHaveBeenCalledTimes(1)
  );
  apiMock.assertComplete();

  apiMock.updatePrecinct.expectCallWith(precinctUpdate).resolves(ok());
  await userEvent.click(screen.getButton('Update Precinct'));
  await waitFor(() =>
    expect(invalidateElectionQueries).toHaveBeenCalledTimes(2)
  );
  apiMock.assertComplete();

  apiMock.deletePrecinct.expectCallWith(precinctDelete).resolves();
  await userEvent.click(screen.getButton('Delete Precinct'));
  await waitFor(() =>
    expect(invalidateElectionQueries).toHaveBeenCalledTimes(3)
  );
  expect(invalidateElectionQueries).toHaveBeenNthCalledWith(
    3,
    expect.anything(),
    'election-1'
  );
  apiMock.assertComplete();
});

const pollingPlaceSet: PollingPlaceSet = {
  electionId: 'election-1',
  place: {
    id: 'place-1',
    name: 'Town Hall',
    precincts: {},
    type: 'election_day',
  },
};
const pollingPlaceDelete: PollingPlaceDelete = {
  electionId: 'election-1',
  id: 'place-1',
};

function PollingPlaceButtons(): JSX.Element {
  const api = useElectionDefinitionApi();
  const setPollingPlace = api.setPollingPlace.useMutation();
  const deletePollingPlace = api.deletePollingPlace.useMutation();
  return (
    <React.Fragment>
      <button
        type="button"
        onClick={() => setPollingPlace.mutate(pollingPlaceSet)}
      >
        Set Polling Place
      </button>
      <button
        type="button"
        onClick={() => deletePollingPlace.mutate(pollingPlaceDelete)}
      >
        Delete Polling Place
      </button>
    </React.Fragment>
  );
}

test('polling place mutations call invalidateElectionQueries on success', async () => {
  const apiMock = createMockApiClient();
  const invalidateElectionQueries = vi.fn().mockResolvedValue(undefined);
  render(
    provideApi(apiMock, <PollingPlaceButtons />, {
      options: { invalidateElectionQueries },
    })
  );

  apiMock.setPollingPlace
    .expectCallWith(pollingPlaceSet)
    .resolves(err('duplicate-name'));
  await userEvent.click(screen.getButton('Set Polling Place'));
  apiMock.assertComplete();
  expect(invalidateElectionQueries).not.toHaveBeenCalled();

  apiMock.setPollingPlace.expectCallWith(pollingPlaceSet).resolves(ok());
  await userEvent.click(screen.getButton('Set Polling Place'));
  await waitFor(() =>
    expect(invalidateElectionQueries).toHaveBeenCalledTimes(1)
  );
  apiMock.assertComplete();

  apiMock.deletePollingPlace.expectCallWith(pollingPlaceDelete).resolves();
  await userEvent.click(screen.getButton('Delete Polling Place'));
  await waitFor(() =>
    expect(invalidateElectionQueries).toHaveBeenCalledTimes(2)
  );
  expect(invalidateElectionQueries).toHaveBeenNthCalledWith(
    2,
    expect.anything(),
    'election-1'
  );
  apiMock.assertComplete();
});
