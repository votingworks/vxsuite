import { beforeEach, expect, test, vi } from 'vitest';
import { SetPollingPlaceError } from '@votingworks/design-backend';
import {
  ElectionStringKey,
  PollingPlace,
  Precinct,
  PrecinctSplit,
  PrecinctWithSplits,
  PrecinctWithoutSplits,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { err, ok } from '@votingworks/basics';
import React from 'react';
import {
  createMockApiClient,
  MockApiClient,
  provideApi,
} from '../test/api_helpers';
import { makeIdFactory } from '../test/id_helpers';
import { render, screen, waitFor, within } from '../test/react_testing_library';
import { PollingPlaceForm } from './polling_place_form';
import { AudioLinkButton } from './ballot_audio/audio_link_button';
import { routes } from './routes';

vi.mock('./ballot_audio/audio_link_button.js');

const MOCK_AUDIO_BUTTON_ID = 'MockAudioLinkButton';
vi.mocked(AudioLinkButton).mockImplementation(({ to }) => (
  <span data-testid={MOCK_AUDIO_BUTTON_ID} data-href={to} />
));

const idFactory = makeIdFactory();
const electionId = 'election1';
const pollingPlaceRoutes = routes.election(electionId).pollingPlaces;

const precinct1 = mockPrecinctNoSplits({ id: 'p1', name: 'Precinct 1' });
const precinct2 = mockPrecinctNoSplits({ id: 'p2', name: 'Precinct 2' });
const precinct3 = mockPrecinctWithSplits({
  id: 'p3',
  name: 'Precinct 3',
  splits: [mockSplit({ id: 's1' }), mockSplit({ id: 's2' })],
});

beforeEach(() => {
  idFactory.reset();
});

test('add polling place', async () => {
  const api = createMockApiClient();
  setMockPrecincts(api, [precinct1, precinct2, precinct3]);
  setMockFinalizedState(api, false);

  const exit = vi.fn();
  const switchToView = vi.fn();
  renderForm(
    api,
    <PollingPlaceForm
      editing
      electionId={electionId}
      exit={exit}
      switchToEdit={unexpectedFnCall('switchToEdit')}
      switchToView={switchToView}
    />
  );

  await screen.findByRole('heading', { name: 'Add Polling Place' });

  // Cancel button should trigger `exit`:
  expect(exit).not.toHaveBeenCalled();
  userEvent.click(screen.getButton('Cancel'));
  expect(exit).toHaveBeenCalledOnce();
  exit.mockClear();

  expect(screen.queryByTestId(MOCK_AUDIO_BUTTON_ID)).not.toBeInTheDocument();
  expect(screen.getAllByRole('radio')).toEqual([
    screen.getByRole('radio', { name: 'Absentee Voting', checked: false }),
    screen.getByRole('radio', { name: 'Early Voting', checked: false }),
    screen.getByRole('radio', { name: 'Election Day', checked: true }),
  ]);
  expect(screen.getAllByRole('checkbox')).toEqual([
    screen.getByRole('checkbox', { name: precinct1.name, checked: false }),
    screen.getByRole('checkbox', { name: precinct2.name, checked: false }),
    screen.getByRole('checkbox', { name: precinct3.name, checked: false }),
  ]);

  userEvent.type(screen.getByLabelText('Name'), 'New Place');
  userEvent.click(screen.getByRole('radio', { name: 'Early Voting' }));
  userEvent.click(screen.getByRole('checkbox', { name: precinct3.name }));
  userEvent.click(screen.getByRole('checkbox', { name: precinct2.name }));

  expect(switchToView).not.toHaveBeenCalled();

  const expectedPlace: PollingPlace = {
    id: idFactory.next(),
    name: 'New Place',
    precincts: {
      [precinct2.id]: { type: 'whole' },
      [precinct3.id]: { type: 'whole' },
    },
    type: 'early_voting',
  };

  api.setPollingPlace
    .expectCallWith({ electionId, place: expectedPlace })
    .resolves(ok());

  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => api.assertComplete());
  expect(switchToView).toHaveBeenCalledOnce();
  expect(exit).not.toHaveBeenCalledOnce();

  expect(screen.getByLabelText('Name')).toHaveValue(expectedPlace.name);
  expect(screen.getAllByRole('radio')).toEqual([
    screen.getByRole('radio', { name: 'Absentee Voting', checked: false }),
    screen.getByRole('radio', { name: 'Early Voting', checked: true }),
    screen.getByRole('radio', { name: 'Election Day', checked: false }),
  ]);
  expect(screen.getAllByRole('checkbox')).toEqual([
    screen.getByRole('checkbox', { name: precinct1.name, checked: false }),
    screen.getByRole('checkbox', { name: precinct2.name, checked: true }),
    screen.getByRole('checkbox', { name: precinct3.name, checked: true }),
  ]);
});

test('view polling place', async () => {
  const api = createMockApiClient();
  setMockPrecincts(api, [precinct1, precinct2, precinct3]);
  setMockFinalizedState(api, false);

  const savedPlace: PollingPlace = {
    id: idFactory.next(),
    name: 'Saved Place',
    precincts: { [precinct2.id]: { type: 'whole' } },
    type: 'early_voting',
  };

  const switchToEdit = vi.fn();
  renderForm(
    api,
    <PollingPlaceForm
      editing={false}
      electionId={electionId}
      savedPlace={savedPlace}
      exit={unexpectedFnCall('exit')}
      switchToEdit={switchToEdit}
      switchToView={unexpectedFnCall('switchToView')}
    />
  );

  await screen.findByRole('heading', { name: 'Polling Place Info' });
  api.assertComplete();

  const nameInput = screen.getByLabelText('Name');
  expect(nameInput).toBeDisabled();
  expect(nameInput).toHaveValue(savedPlace.name);

  const nameAudioButton = screen.getByTestId(MOCK_AUDIO_BUTTON_ID);
  expect(nameAudioButton).toHaveAttribute(
    'data-href',
    pollingPlaceRoutes.audio({
      placeId: savedPlace.id,
      stringKey: ElectionStringKey.POLLING_PLACE_NAME,
    })
  );

  const placeTypes = screen.getAllByRole('radio');
  for (const type of placeTypes) expect(type).toBeDisabled();
  expect(placeTypes).toEqual([
    screen.getByRole('radio', {
      name: 'Early Voting',
      checked: true,
      hidden: true,
    }),
  ]);

  const precinctOptions = screen.getAllByRole('checkbox');
  expect(precinctOptions).toEqual([
    screen.getByRole('checkbox', {
      name: precinct2.name,
      checked: true,
      hidden: true,
    }),
  ]);

  expect(switchToEdit).not.toHaveBeenCalled();

  userEvent.click(screen.getButton('Edit'));
  expect(switchToEdit).toHaveBeenCalledOnce();
});

test('editing disabled when finalized', async () => {
  const api = createMockApiClient();
  setMockPrecincts(api, [precinct1, precinct2, precinct3]);
  setMockFinalizedState(api, true);

  const savedPlace: PollingPlace = {
    id: idFactory.next(),
    name: 'Saved Place',
    precincts: {
      [precinct2.id]: { type: 'whole' },
      [precinct3.id]: { type: 'whole' },
    },
    type: 'early_voting',
  };

  renderForm(
    api,
    <PollingPlaceForm
      editing={false}
      electionId={electionId}
      savedPlace={savedPlace}
      exit={unexpectedFnCall('exit')}
      switchToEdit={unexpectedFnCall('switchToEdit')}
      switchToView={unexpectedFnCall('switchToView')}
    />
  );

  await screen.findByRole('heading', { name: 'Polling Place Info' });
  api.assertComplete();

  expect(screen.queryButton(/edit/i)).not.toBeInTheDocument();
  expect(screen.queryButton(/delete/i)).not.toBeInTheDocument();

  expect(screen.getByLabelText('Name')).toBeDisabled();
  expect(screen.getByRole('radio')).toBeDisabled();

  for (const precinctOption of screen.getAllByRole('checkbox')) {
    expect(precinctOption).toBeDisabled();
  }

  screen.getByTestId(MOCK_AUDIO_BUTTON_ID);
});

test('edit polling place', async () => {
  const api = createMockApiClient();
  setMockPrecincts(api, [precinct1, precinct2, precinct3]);
  setMockFinalizedState(api, false);

  const savedPlace: PollingPlace = {
    id: idFactory.next(),
    name: 'Saved Place',
    precincts: { [precinct2.id]: { type: 'whole' } },
    type: 'early_voting',
  };

  const switchToView = vi.fn();
  renderForm(
    api,
    <PollingPlaceForm
      editing
      electionId={electionId}
      savedPlace={savedPlace}
      exit={unexpectedFnCall('exit')}
      switchToEdit={unexpectedFnCall('switchToEdit')}
      switchToView={switchToView}
    />
  );

  await screen.findByRole('heading', { name: 'Edit Polling Place' });

  // Cancel button should trigger `switchToView`:
  expect(switchToView).not.toHaveBeenCalled();
  userEvent.click(screen.getButton('Cancel'));
  expect(switchToView).toHaveBeenCalledExactlyOnceWith(savedPlace.id);
  switchToView.mockClear();

  const nameInput = screen.getByLabelText('Name');
  expect(nameInput).toBeEnabled();
  expect(nameInput).toHaveValue(savedPlace.name);

  expect(screen.getAllByRole('radio')).toEqual([
    screen.getByRole('radio', { name: 'Absentee Voting', checked: false }),
    screen.getByRole('radio', { name: 'Early Voting', checked: true }),
    screen.getByRole('radio', { name: 'Election Day', checked: false }),
  ]);
  expect(screen.getAllByRole('checkbox')).toEqual([
    screen.getByRole('checkbox', { name: precinct1.name, checked: false }),
    screen.getByRole('checkbox', { name: precinct2.name, checked: true }),
    screen.getByRole('checkbox', { name: precinct3.name, checked: false }),
  ]);

  userEvent.clear(nameInput);
  userEvent.type(nameInput, 'Updated Place');

  userEvent.click(screen.getByRole('radio', { name: 'Absentee Voting' }));

  // Select precinct1, de-select precinct2:
  userEvent.click(screen.getByRole('checkbox', { name: precinct1.name }));
  userEvent.click(screen.getByRole('checkbox', { name: precinct2.name }));

  expect(switchToView).not.toHaveBeenCalled();

  const expectedPlace: PollingPlace = {
    id: savedPlace.id,
    name: 'Updated Place',
    precincts: { [precinct1.id]: { type: 'whole' } },
    type: 'absentee',
  };

  api.setPollingPlace
    .expectCallWith({ electionId, place: expectedPlace })
    .resolves(ok());

  userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => api.assertComplete());
  expect(switchToView).toHaveBeenCalledOnce();
});

test('handles API validation errors', async () => {
  const api = createMockApiClient();
  setMockPrecincts(api, [precinct1, precinct2, precinct3]);
  setMockFinalizedState(api, false);

  const place: PollingPlace = {
    id: idFactory.next(),
    name: 'Saved Place',
    precincts: { [precinct2.id]: { type: 'whole' } },
    type: 'early_voting',
  };

  renderForm(
    api,
    <PollingPlaceForm
      editing
      electionId={electionId}
      savedPlace={place}
      exit={unexpectedFnCall('exit')}
      switchToEdit={unexpectedFnCall('switchToEdit')}
      switchToView={unexpectedFnCall('switchToView')}
    />
  );

  await screen.findByRole('heading', { name: 'Edit Polling Place' });

  const specs: Array<[SetPollingPlaceError, RegExp]> = [
    ['duplicate-name', /there is already a polling place with the same name/i],
    ['invalid-precinct', /please refresh the page and try again/i],
  ];

  for (const [code, message] of specs) {
    api.setPollingPlace
      .expectCallWith({ electionId, place })
      .resolves(err(code));

    userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => api.assertComplete());
    screen.getByText(message);
  }
});

test('delete polling place', async () => {
  const api = createMockApiClient();
  setMockPrecincts(api, [precinct1, precinct2, precinct3]);
  setMockFinalizedState(api, false);

  const savedPlace: PollingPlace = {
    id: idFactory.next(),
    name: 'Saved Place',
    precincts: { [precinct2.id]: { type: 'whole' } },
    type: 'early_voting',
  };

  const exit = vi.fn();
  renderForm(
    api,
    <PollingPlaceForm
      editing
      electionId={electionId}
      savedPlace={savedPlace}
      exit={exit}
      switchToEdit={unexpectedFnCall('switchToEdit')}
      switchToView={unexpectedFnCall('switchToView')}
    />
  );

  await screen.findByRole('heading', { name: 'Edit Polling Place' });

  userEvent.click(screen.getButton('Delete Polling Place'));
  let modal = within(screen.getByRole('alertdialog'));
  await modal.findByText(/Are you sure you want to delete this polling place/);

  userEvent.click(screen.getButton('Cancel'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  userEvent.click(screen.getButton('Delete Polling Place'));
  modal = within(screen.getByRole('alertdialog'));

  expect(exit).not.toHaveBeenCalled();

  api.deletePollingPlace
    .expectCallWith({ electionId, id: savedPlace.id })
    .resolves();

  userEvent.click(modal.getButton('Delete Polling Place'));
  await waitFor(() => api.assertComplete());
  expect(exit).toHaveBeenCalledOnce();
});

test('bulk selection button', async () => {
  const api = createMockApiClient();
  setMockPrecincts(api, [precinct1, precinct2, precinct3]);
  setMockFinalizedState(api, false);

  const savedPlace: PollingPlace = {
    id: idFactory.next(),
    name: 'Saved Place',
    precincts: { [precinct2.id]: { type: 'whole' } },
    type: 'early_voting',
  };

  const switchToView = vi.fn();
  renderForm(
    api,
    <PollingPlaceForm
      editing
      electionId={electionId}
      savedPlace={savedPlace}
      exit={unexpectedFnCall('exit')}
      switchToEdit={unexpectedFnCall('switchToEdit')}
      switchToView={switchToView}
    />
  );

  await screen.findByRole('heading', { name: 'Edit Polling Place' });

  expect(screen.getAllByRole('checkbox', { checked: true })).toEqual([
    screen.getByRole('checkbox', { name: precinct2.name }),
  ]);

  // Expect "Select All" state if there's a partial selection:
  userEvent.click(screen.getButton('Select All'));
  expect(screen.getAllByRole('checkbox', { checked: true })).toEqual([
    screen.getByRole('checkbox', { name: precinct1.name }),
    screen.getByRole('checkbox', { name: precinct2.name }),
    screen.getByRole('checkbox', { name: precinct3.name }),
  ]);

  userEvent.click(screen.getButton('Clear All'));
  expect(screen.queryAllByRole('checkbox', { checked: true })).toEqual([]);

  userEvent.click(screen.getButton('Select All'));
  expect(screen.getAllByRole('checkbox', { checked: true })).toEqual([
    screen.getByRole('checkbox', { name: precinct1.name }),
    screen.getByRole('checkbox', { name: precinct2.name }),
    screen.getByRole('checkbox', { name: precinct3.name }),
  ]);
});

function mockPrecinctNoSplits(
  partial: Partial<PrecinctWithoutSplits>
): PrecinctWithoutSplits {
  return partial as PrecinctWithoutSplits;
}

function mockPrecinctWithSplits(
  partial: Partial<PrecinctWithSplits>
): PrecinctWithSplits {
  return partial as PrecinctWithSplits;
}

function mockSplit(partial: Partial<PrecinctSplit>): PrecinctSplit {
  return partial as PrecinctSplit;
}

function renderForm(api: MockApiClient, ui: React.ReactNode) {
  return render(provideApi(api, ui));
}

function setMockFinalizedState(api: MockApiClient, finalized: boolean) {
  api.getBallotsFinalizedAt
    .expectRepeatedCallsWith({ electionId })
    .resolves(finalized ? new Date() : null);
}

function setMockPrecincts(api: MockApiClient, precincts: Precinct[]) {
  api.listPrecincts.expectRepeatedCallsWith({ electionId }).resolves(precincts);
}

function unexpectedFnCall(name: string) {
  return () => {
    throw new Error(`unexpected function call: ${name}`);
  };
}
