import { createMemoryHistory } from 'history';
import { expect, test } from 'vitest';
import { Router, Route } from 'react-router-dom';

import { within } from '@testing-library/react';
import { Precinct, PrecinctSplit } from '@votingworks/types';
import userEvent from '@testing-library/user-event';

import { createMockApiClient, provideApi } from '../test/api_helpers';
import { PrecinctList } from './precincts_list';
import { electionParamRoutes, routes } from './routes';
import { render, screen } from '../test/react_testing_library';

const electionId = 'election1';
const precinctRoutes = routes.election(electionId).precincts;
const precinctParamRoutes = electionParamRoutes.precincts;

const withNoDistricts: Precinct = {
  districtIds: [],
  id: 'withNoDistricts',
  name: 'Precinct With No Districts',
};

const with1District: Precinct = {
  districtIds: ['district1'],
  id: 'with1District',
  name: 'Precinct With One District',
};

const with2Districts: Precinct = {
  districtIds: ['district1', 'district2'],
  id: 'with2Districts',
  name: 'Precinct With Two Districts',
};

const with3Splits: Precinct = {
  id: 'with3Splits',
  name: 'Precinct With Three Splits',
  splits: [
    mockSplit({ id: 'split1' }),
    mockSplit({ id: 'split2' }),
    mockSplit({ id: 'split3' }),
  ],
};

test('renders callout when empty', async () => {
  renderList({ precincts: [] });

  await screen.findByText(/you haven't added any precincts/i);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
});

test('renders precinct names and district/split counts', async () => {
  renderList({
    precincts: [withNoDistricts, with1District, with2Districts, with3Splits],
  });

  expect(await findList()).toEqual([
    getOption(withNoDistricts, '0 Districts'),
    getOption(with1District, '1 District'),
    getOption(with2Districts, '2 Districts'),
    getOption(with3Splits, '3 Splits'),
  ]);
});

test('renders selected precinct based on URL, navigates on select', async () => {
  const { history } = renderList({
    initialRoute: precinctRoutes.view(with1District.id).path,
    precincts: [with1District, with2Districts, with3Splits],
  });

  expect(await findList()).toEqual([
    getOption(with1District, '1 District', { selected: true }),
    getOption(with2Districts, '2 Districts'),
    getOption(with3Splits, '3 Splits'),
  ]);

  userEvent.click(
    getOption(with2Districts, '2 Districts', { selected: false })
  );

  getOption(with2Districts, '2 Districts', { selected: true });
  getOption(with1District, '1 District', { selected: false });
  expect(history.location.pathname).toEqual(
    precinctRoutes.view(with2Districts.id).path
  );

  userEvent.click(getOption(with3Splits, '3 Splits', { selected: false }));

  getOption(with3Splits, '3 Splits', { selected: true });
  getOption(with2Districts, '2 Districts', { selected: false });
  expect(history.location.pathname).toEqual(
    precinctRoutes.view(with3Splits.id).path
  );
});

function getOption(
  precinct: Precinct,
  caption: string,
  opts: { selected?: boolean } = {}
) {
  return screen.getByRole('option', {
    ...opts,
    name: [precinct.name, caption].join(' '),
  });
}

async function findList() {
  return within(await screen.findByRole('listbox')).getAllByRole('option');
}

function mockSplit(partial: Partial<PrecinctSplit>) {
  return partial as PrecinctSplit;
}

function renderList(p: { precincts: Precinct[]; initialRoute?: string }) {
  const mockApi = createMockApiClient();
  mockApi.listPrecincts.expectCallWith({ electionId }).resolves(p.precincts);

  const history = createMemoryHistory({
    initialEntries: [p.initialRoute || precinctRoutes.root.path],
  });

  const result = render(
    provideApi(
      mockApi,
      <Router history={history}>
        <Route exact path={precinctParamRoutes.view(':precinctId').path}>
          <PrecinctList />
        </Route>
        <Route exact path={precinctParamRoutes.root.path}>
          <PrecinctList />
        </Route>
      </Router>
    )
  );

  mockApi.assertComplete();

  return { history, mockApi, result };
}
