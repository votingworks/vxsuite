import {
  ChangePrecinctButton,
  PollingPlacePicker,
  PollingPlacePickerMode,
} from '@votingworks/ui';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Election, PollsState } from '@votingworks/types';
import { electionGeneralFixtures } from '@votingworks/fixtures';
import { assertDefined } from '@votingworks/basics';
import { LocationPicker } from './location_picker';
import { render, screen } from '../../test/react_testing_library';

vi.mock('@votingworks/ui', async (importActual) => ({
  ...(await importActual()),
  ChangePrecinctButton: vi.fn(),
  PollingPlacePicker: vi.fn(),
}));
const MOCK_POLLING_PLACE_PICKER_ID = 'MockPollingPlacePicker';
const MockPollingPlacePicker = vi.mocked(PollingPlacePicker);
const MockPrecinctPicker = vi.mocked(ChangePrecinctButton);

const election = electionGeneralFixtures.readElection();
const places = assertDefined(election.pollingPlaces);
const [precinct1] = election.precincts;
const [place1] = places;

const mockSelectPollingPlace = vi.fn();

beforeEach(() => {
  MockPollingPlacePicker.mockReturnValue(
    <div data-testid={MOCK_POLLING_PLACE_PICKER_ID} />
  );
  MockPrecinctPicker.mockImplementation(() => {
    throw new Error('unexpected render - precinct picker is tested via apps');
  });
});

describe('picker modes', () => {
  const expectedModes: Record<PollsState, PollingPlacePickerMode> = {
    polls_closed_initial: 'default',
    polls_open: 'default',
    polls_paused: 'default',
    polls_closed_final: 'disabled',
  };

  for (const [pollsState, mode] of Object.entries(expectedModes)) {
    test(`polls state ${pollsState}: picker shown in ${mode} mode`, () => {
      render(
        <LocationPicker
          election={election}
          pollingPlaceId={place1.id}
          pollsState={pollsState as PollsState}
          selectPollingPlace={mockSelectPollingPlace}
        />
      );

      screen.getByTestId(MOCK_POLLING_PLACE_PICKER_ID);
      expect(MockPollingPlacePicker.mock.lastCall?.[0]).toEqual({
        mode,
        places,
        selectedId: place1.id,
        selectPlace: mockSelectPollingPlace,
      });
    });
  }
});

test('omits location picker if only one location is available', () => {
  const singleLocationElection = mockElection({
    precincts: [precinct1],
    pollingPlaces: [place1],
  });

  const { container } = render(
    <LocationPicker
      election={singleLocationElection}
      pollingPlaceId={place1.id}
      pollsState="polls_closed_initial"
      selectPollingPlace={mockSelectPollingPlace}
    />
  );

  expect(container.childNodes).toHaveLength(0);
});

test('omits location picker if empty (degrades gracefully for old elections)', () => {
  const noPollingPlaceElection = mockElection({
    precincts: election.precincts,
    pollingPlaces: undefined,
  });

  const { container } = render(
    <LocationPicker
      election={noPollingPlaceElection}
      pollsState="polls_closed_initial"
      selectPollingPlace={mockSelectPollingPlace}
    />
  );

  expect(container.childNodes).toHaveLength(0);
});

function mockElection(partial: Partial<Election>) {
  return partial as Election;
}
