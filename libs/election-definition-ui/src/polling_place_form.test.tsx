import { beforeEach, expect, test, vi } from 'vitest';
import { makeIdFactory } from '@votingworks/test-utils';
import type { SetPollingPlaceError } from '@votingworks/election-definition-backend';
import {
  ElectionStringKey,
  type PollingPlace,
  type Precinct,
  type PrecinctSplit,
  type PrecinctWithSplits,
  type PrecinctWithoutSplits,
} from '@votingworks/types';
import { userEvent } from '@testing-library/user-event';
import { err, ok } from '@votingworks/basics';
import type React from 'react';
import { createMemoryHistory } from 'history';
import {
  createMockApiClient,
  type MockApiClient,
  provideApi,
} from '../test/api_helpers.js';
import {
  render,
  screen,
  waitFor,
  within,
} from '../test/react_testing_library.js';
import { withRoute } from '../test/routing_helpers.js';
import { PollingPlaceForm } from './polling_place_form.js';

const idFactory = makeIdFactory();

const electionId = 'election1';
const rootPath = `/elections/${electionId}/polling-places`;

function audioUrl(params: { id: string; stringKey: string }): string {
  return `${rootPath}/${params.id}/audio/${params.stringKey}`;
}

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
  await userEvent.click(screen.getButton('Cancel'));
  expect(exit).toHaveBeenCalledOnce();
  exit.mockClear();

  expect(screen.queryButton('Preview or Edit Audio')).not.toBeInTheDocument();
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

  await userEvent.type(screen.getByLabelText('Name'), 'New Place');
  await userEvent.click(screen.getByRole('radio', { name: 'Early Voting' }));
  await userEvent.click(screen.getByRole('checkbox', { name: precinct3.name }));
  await userEvent.click(screen.getByRole('checkbox', { name: precinct2.name }));

  expect(switchToView).not.toHaveBeenCalled();

  idFactory.next(); // Discarded by StrictMode's double render of the blank form
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

  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
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
  setMockAudioEnabled(api);

  const savedPlace: PollingPlace = {
    id: idFactory.next(),
    name: 'Saved Place',
    precincts: { [precinct2.id]: { type: 'whole' } },
    type: 'early_voting',
  };

  const switchToEdit = vi.fn();
  const { history } = renderForm(
    api,
    <PollingPlaceForm
      audioUrl={audioUrl}
      editing={false}
      electionId={electionId}
      savedPlace={savedPlace}
      exit={unexpectedFnCall('exit')}
      switchToEdit={switchToEdit}
      switchToView={unexpectedFnCall('switchToView')}
    />
  );

  await screen.findByRole('heading', { name: 'Polling Place Info' });

  const nameInput = screen.getByDisplayValue(savedPlace.name);
  expect(nameInput).toBeDisabled();

  await userEvent.click(await screen.findButton('Preview or Edit Audio'));
  expect(history.location.pathname).toEqual(
    audioUrl({
      id: savedPlace.id,
      stringKey: ElectionStringKey.POLLING_PLACE_NAME,
    })
  );
  api.assertComplete();

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

  await userEvent.click(screen.getButton('Edit'));
  expect(switchToEdit).toHaveBeenCalledOnce();
});

test('editing disabled when locked', async () => {
  const api = createMockApiClient();
  setMockPrecincts(api, [precinct1, precinct2, precinct3]);
  setMockAudioEnabled(api);

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
      audioUrl={audioUrl}
      editing={false}
      electionId={electionId}
      isLocked
      savedPlace={savedPlace}
      exit={unexpectedFnCall('exit')}
      switchToEdit={unexpectedFnCall('switchToEdit')}
      switchToView={unexpectedFnCall('switchToView')}
    />
  );

  await screen.findByRole('heading', { name: 'Polling Place Info' });
  api.assertComplete();

  expect(screen.queryButton('Edit')).not.toBeInTheDocument();
  expect(screen.queryButton(/delete/i)).not.toBeInTheDocument();

  expect(screen.getByDisplayValue(savedPlace.name)).toBeDisabled();
  expect(screen.getByRole('radio')).toBeDisabled();

  for (const precinctOption of screen.getAllByRole('checkbox')) {
    expect(precinctOption).toBeDisabled();
  }

  await screen.findButton('Preview or Edit Audio');
});

test('edit polling place', async () => {
  const api = createMockApiClient();
  setMockPrecincts(api, [precinct1, precinct2, precinct3]);

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
  await userEvent.click(screen.getButton('Cancel'));
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

  await userEvent.clear(nameInput);
  await userEvent.type(nameInput, 'Updated Place');

  await userEvent.click(screen.getByRole('radio', { name: 'Absentee Voting' }));

  // Select precinct1, de-select precinct2:
  await userEvent.click(screen.getByRole('checkbox', { name: precinct1.name }));
  await userEvent.click(screen.getByRole('checkbox', { name: precinct2.name }));

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

  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => api.assertComplete());
  expect(switchToView).toHaveBeenCalledOnce();
});

test('handles API validation errors', async () => {
  const api = createMockApiClient();
  setMockPrecincts(api, [precinct1, precinct2, precinct3]);

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

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => api.assertComplete());
    screen.getByText(message);
  }
});

test('delete polling place', async () => {
  const api = createMockApiClient();
  setMockPrecincts(api, [precinct1, precinct2, precinct3]);

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

  await userEvent.click(screen.getButton('Delete Polling Place'));
  let modal = within(screen.getByRole('alertdialog'));
  await modal.findByText(/Are you sure you want to delete this polling place/);

  await userEvent.click(screen.getButton('Cancel'));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

  await userEvent.click(screen.getButton('Delete Polling Place'));
  modal = within(screen.getByRole('alertdialog'));

  expect(exit).not.toHaveBeenCalled();

  api.deletePollingPlace
    .expectCallWith({ electionId, id: savedPlace.id })
    .resolves();

  await userEvent.click(modal.getButton('Delete Polling Place'));
  await waitFor(() => api.assertComplete());
  expect(exit).toHaveBeenCalledOnce();
});

test('bulk selection button', async () => {
  const api = createMockApiClient();
  setMockPrecincts(api, [precinct1, precinct2, precinct3]);

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
  await userEvent.click(screen.getButton('Select All'));
  expect(screen.getAllByRole('checkbox', { checked: true })).toEqual([
    screen.getByRole('checkbox', { name: precinct1.name }),
    screen.getByRole('checkbox', { name: precinct2.name }),
    screen.getByRole('checkbox', { name: precinct3.name }),
  ]);

  await userEvent.click(screen.getButton('Clear All'));
  expect(screen.queryAllByRole('checkbox', { checked: true })).toEqual([]);

  await userEvent.click(screen.getButton('Select All'));
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

function renderForm(api: MockApiClient, ui: React.ReactElement) {
  const history = createMemoryHistory({ initialEntries: [rootPath] });
  const result = render(
    provideApi(
      api,
      withRoute(ui, { paramPath: '/elections/:electionId', history })
    )
  );
  return { history, result };
}

function setMockAudioEnabled(api: MockApiClient) {
  api.getStateFeatures
    .expectRepeatedCallsWith({ electionId })
    .resolves({ AUDIO_ENABLED: true });
}

function setMockPrecincts(api: MockApiClient, precincts: Precinct[]) {
  api.listPrecincts.expectRepeatedCallsWith({ electionId }).resolves(precincts);
}

function unexpectedFnCall(name: string) {
  return () => {
    throw new Error(`unexpected function call: ${name}`);
  };
}
