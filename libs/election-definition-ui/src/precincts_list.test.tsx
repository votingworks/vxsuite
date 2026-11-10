import { createMemoryHistory } from 'history';
import { expect, test } from 'vitest';
import { Route, Switch } from 'react-router-dom';

import type { Precinct, PrecinctSplit } from '@votingworks/types';
import { userEvent } from '@testing-library/user-event';

import { createMockApiClient, provideApi } from '../test/api_helpers.js';
import { render, screen, within } from '../test/react_testing_library.js';
import { withRoute } from '../test/routing_helpers.js';
import { useListDetailRoutes } from './list_detail_routes.js';
import { PrecinctList } from './precincts_list.js';

const electionId = 'election1';
const rootPath = `/elections/${electionId}/precincts`;

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
    initialRoute: `${rootPath}/${with1District.id}`,
    precincts: [with1District, with2Districts, with3Splits],
  });

  expect(await findList()).toEqual([
    getOption(with1District, '1 District', { selected: true }),
    getOption(with2Districts, '2 Districts'),
    getOption(with3Splits, '3 Splits'),
  ]);

  await userEvent.click(
    getOption(with2Districts, '2 Districts', { selected: false })
  );

  getOption(with2Districts, '2 Districts', { selected: true });
  getOption(with1District, '1 District', { selected: false });
  expect(history.location.pathname).toEqual(`${rootPath}/${with2Districts.id}`);

  await userEvent.click(
    getOption(with3Splits, '3 Splits', { selected: false })
  );

  getOption(with3Splits, '3 Splits', { selected: true });
  getOption(with2Districts, '2 Districts', { selected: false });
  expect(history.location.pathname).toEqual(`${rootPath}/${with3Splits.id}`);
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

function RoutedPrecinctList(): JSX.Element {
  const precinctRoutes = useListDetailRoutes(
    'precinctId',
    ':stringKey/:subkey'
  );
  return (
    <Switch>
      <Route exact path={precinctRoutes.viewPath}>
        <PrecinctList electionId={electionId} precinctRoutes={precinctRoutes} />
      </Route>
      <Route exact path={precinctRoutes.rootPath}>
        <PrecinctList electionId={electionId} precinctRoutes={precinctRoutes} />
      </Route>
    </Switch>
  );
}

function renderList(p: { precincts: Precinct[]; initialRoute?: string }) {
  const mockApi = createMockApiClient();
  mockApi.listPrecincts.expectCallWith({ electionId }).resolves(p.precincts);

  const history = createMemoryHistory({
    initialEntries: [p.initialRoute || rootPath],
  });

  const result = render(
    provideApi(
      mockApi,
      withRoute(<RoutedPrecinctList />, {
        paramPath: '/elections/:electionId/precincts',
        history,
      })
    )
  );

  mockApi.assertComplete();

  return { history, mockApi, result };
}
