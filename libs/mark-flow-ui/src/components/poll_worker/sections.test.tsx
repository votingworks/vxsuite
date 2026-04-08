import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  ALL_PRECINCTS_SELECTION,
  BooleanEnvironmentVariableName as Feature,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  Election,
  getAllPrecinctsAndSplits,
  hasSplits,
  PollingPlace,
  pollingPlaceMembers,
} from '@votingworks/types';
import { assert, assertDefined } from '@votingworks/basics';
import { render, screen } from '../../../test/react_testing_library';
import { SectionSessionStart } from './sections';
import {
  BallotStyleSelect,
  BallotStyleSelectProps,
} from './ballot_style_select';

const fixtures = electionFamousNames2021Fixtures;
const electionDefinition = fixtures.readElectionDefinition();
const { election } = electionDefinition;

const featureFlagMock = getFeatureFlagMock();
vi.mock('@votingworks/utils', async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (f: Feature) => featureFlagMock.isEnabled(f),
}));

vi.mock('./ballot_style_select');
const MOCK_BALLOT_STYLE_SELECT_ID = 'MockBallotStyleSelect';
const MockBallotStyleSelect = vi.mocked(BallotStyleSelect);

beforeEach(() => {
  MockBallotStyleSelect.mockImplementation(() => (
    <div data-testid={MOCK_BALLOT_STYLE_SELECT_ID} />
  ));
});

describe('SectionSessionStart', () => {
  test('with AllPrecincts selection', () => {
    setPollingPlacesEnabled(false);

    const onSelect = vi.fn();
    render(
      <SectionSessionStart
        election={election}
        onChooseBallotStyle={onSelect}
        precinctSelection={ALL_PRECINCTS_SELECTION}
      />
    );

    screen.getByText('Start a New Voting Session');
    screen.getByTestId(MOCK_BALLOT_STYLE_SELECT_ID);

    const props = MockBallotStyleSelect.mock.lastCall?.[0];
    expect(props).toEqual<BallotStyleSelectProps>({
      configuredPrecinctsAndSplits: getAllPrecinctsAndSplits(election),
      election,
      onSelect,
    });
  });

  test('with single-precinct selection', () => {
    setPollingPlacesEnabled(false);

    const [precinct] = election.precincts;
    assert(!hasSplits(precinct));

    const onSelect = vi.fn();
    render(
      <SectionSessionStart
        election={election}
        onChooseBallotStyle={onSelect}
        precinctSelection={singlePrecinctSelectionFor(precinct.id)}
      />
    );

    screen.getByText('Start a New Voting Session');
    screen.getByTestId(MOCK_BALLOT_STYLE_SELECT_ID);

    const props = MockBallotStyleSelect.mock.lastCall?.[0];
    expect(props).toEqual<BallotStyleSelectProps>({
      configuredPrecinctsAndSplits: [{ precinct }],
      election,
      onSelect,
    });
  });

  test('with single-precinct polling place', () => {
    setPollingPlacesEnabled(true);

    const [place] = assertDefined(election.pollingPlaces);
    const [precinct] = pollingPlaceMembers(election, place);

    const onSelect = vi.fn();
    render(
      <SectionSessionStart
        election={election}
        onChooseBallotStyle={onSelect}
        pollingPlaceId={place.id}
      />
    );

    screen.getByText('Start a New Voting Session');
    screen.getByTestId(MOCK_BALLOT_STYLE_SELECT_ID);

    const props = MockBallotStyleSelect.mock.lastCall?.[0];
    expect(props).toEqual<BallotStyleSelectProps>({
      configuredPrecinctsAndSplits: [precinct],
      election,
      onSelect,
    });
  });

  test('with multi-precinct polling place', () => {
    setPollingPlacesEnabled(true);

    const place: PollingPlace = {
      id: 'allPrecincts1',
      name: 'All Precincts',
      precincts: Object.fromEntries(
        election.precincts.map((p) => [p.id, { type: 'whole' }])
      ),
      type: 'early_voting',
    };

    const electionMod: Election = {
      ...election,
      pollingPlaces: [...assertDefined(election.pollingPlaces), place],
    };

    const onSelect = vi.fn();
    render(
      <SectionSessionStart
        election={electionMod}
        onChooseBallotStyle={onSelect}
        pollingPlaceId={place.id}
      />
    );

    screen.getByText('Start a New Voting Session');
    screen.getByTestId(MOCK_BALLOT_STYLE_SELECT_ID);

    const props = MockBallotStyleSelect.mock.lastCall?.[0];
    expect(props).toEqual<BallotStyleSelectProps>({
      configuredPrecinctsAndSplits: pollingPlaceMembers(electionMod, place),
      election: electionMod,
      onSelect,
    });
  });
});

function setPollingPlacesEnabled(enabled: boolean) {
  if (enabled) {
    featureFlagMock.enableFeatureFlag(Feature.ENABLE_POLLING_PLACES);
  } else {
    featureFlagMock.disableFeatureFlag(Feature.ENABLE_POLLING_PLACES);
  }
}
