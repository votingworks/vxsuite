import { beforeEach, describe, expect, test, vi } from 'vitest';

import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  Election,
  PollingPlace,
  pollingPlaceMembers,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { render, screen } from '../../../test/react_testing_library.js';
import { SectionSessionStart } from './sections.js';
import {
  BallotStyleSelect,
  BallotStyleSelectProps,
} from './ballot_style_select.js';

const fixtures = electionFamousNames2021Fixtures;
const electionDefinition = fixtures.readElectionDefinition();
const { election } = electionDefinition;

vi.mock('./ballot_style_select');
const MOCK_BALLOT_STYLE_SELECT_ID = 'MockBallotStyleSelect';
const MockBallotStyleSelect = vi.mocked(BallotStyleSelect);

beforeEach(() => {
  MockBallotStyleSelect.mockImplementation(() => (
    <div data-testid={MOCK_BALLOT_STYLE_SELECT_ID} />
  ));
});

describe('SectionSessionStart', () => {
  test('with single-precinct polling place', () => {
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
