import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';

import { PollsState } from '@votingworks/types';
import { ElectionInfoBar, ElectionInfoBarProps } from '@votingworks/ui';
import { assertDefined } from '@votingworks/basics';
import { render, screen } from '../../test/react_testing_library';
import { InsertCardScreen } from './insert_card_screen';

vi.mock(import('@votingworks/ui'), async (importActual) => ({
  ...(await importActual()),
  ElectionInfoBar: vi.fn(),
}));
const MOCK_ELECTION_INFO_BAR_ID = 'MockElectionInfoBar';
const MockElectionInfoBar = vi.mocked(ElectionInfoBar);

const electionDefinition = readElectionGeneralDefinition();

beforeEach(() => {
  MockElectionInfoBar.mockReturnValue(
    <div data-testid={MOCK_ELECTION_INFO_BAR_ID} />
  );
});

describe('polls states', () => {
  interface Spec {
    pollsState: PollsState;
    heading: string;
  }

  const specs: Spec[] = [
    { pollsState: 'polls_closed_initial', heading: 'Polls Closed' },
    { pollsState: 'polls_open', heading: 'Insert Card' },
    { pollsState: 'polls_paused', heading: 'Voting Paused' },
    { pollsState: 'polls_closed_final', heading: 'Polls Closed' },
  ];

  for (const spec of specs) {
    test(`with pollsState = ${spec.pollsState}`, () => {
      render(
        <InsertCardScreen
          appPrecinct={ALL_PRECINCTS_SELECTION}
          pollingPlaceId="a-polling-place"
          electionDefinition={electionDefinition}
          electionPackageHash="package-hash"
          isLiveMode
          pollsState={spec.pollsState}
        />
      );

      screen.getByRole('heading', { name: spec.heading });
      expect(screen.queryByText(/test ballot mode/i)).not.toBeInTheDocument();
    });
  }
});

test('renders election info bar', () => {
  render(
    <InsertCardScreen
      appPrecinct={ALL_PRECINCTS_SELECTION}
      pollingPlaceId="a-polling-place"
      electionDefinition={electionDefinition}
      electionPackageHash="package-hash"
      isLiveMode
      pollsState="polls_open"
    />
  );

  screen.getByTestId(MOCK_ELECTION_INFO_BAR_ID);
  const props = assertDefined(MockElectionInfoBar.mock.lastCall)[0];
  expect(props).toEqual<ElectionInfoBarProps>({
    electionDefinition,
    electionPackageHash: 'package-hash',
    pollingPlaceId: 'a-polling-place',
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
});

test('renders test mode banner in test mode', () => {
  render(
    <InsertCardScreen
      appPrecinct={ALL_PRECINCTS_SELECTION}
      pollingPlaceId="a-polling-place"
      electionDefinition={electionDefinition}
      electionPackageHash="package-hash"
      isLiveMode={false}
      pollsState="polls_open"
    />
  );

  screen.getByText(/test ballot mode/i);
});
