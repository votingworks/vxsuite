import {
  Voter,
  VoterIdentificationMethod,
} from '@votingworks/pollbook-backend';
import { expect, test, beforeEach, afterEach, vi } from 'vitest';
import { electionMultiPartyPrimaryFixtures } from '@votingworks/fixtures';
import { Election } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { ApiMock, createApiMock } from '../test/mock_api_client';
import { renderInAppContext } from '../test/render_in_app_context';
import { SelectPartyScreen } from './select_party_screen';
import { screen } from '../test/react_testing_library';

let apiMock: ApiMock;
let unmount: () => void;
const mockVoterId = '123';
let onBack: ReturnType<typeof vi.fn>;
let onConfirmCheckIn: ReturnType<typeof vi.fn>;

const electionDefinition =
  electionMultiPartyPrimaryFixtures.readElectionDefinition();
const precinct = electionDefinition.election.precincts[0].id;
const mockIdentificationMethod: VoterIdentificationMethod = { type: 'default' };

beforeEach(() => {
  vi.clearAllMocks();
  onBack = vi.fn();
  onConfirmCheckIn = vi.fn();
  apiMock = createApiMock();
  apiMock.setElection(electionDefinition, precinct);
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
  unmount();
});

async function renderComponent({
  voterOverride,
}: {
  isAbsenteeMode?: boolean;
  configuredPrecinctId?: string;
  voterOverride?: Voter;
  election?: Election;
} = {}) {
  if (voterOverride) {
    apiMock.expectGetVoter(voterOverride);
  }

  const renderResult = renderInAppContext(
    <SelectPartyScreen
      voterId={mockVoterId}
      onBack={onBack}
      onConfirmCheckIn={onConfirmCheckIn}
      identificationMethod={mockIdentificationMethod}
    />,
    {
      apiMock,
    }
  );
  unmount = renderResult.unmount;

  await screen.findByRole('heading', { name: 'Select Party' });
}

test('confirm button is disabled when party is not selected', async () => {
  await renderComponent();

  const confirmButton = screen.getButton('Confirm Check-In');
  expect(confirmButton).toBeDisabled();
});

const parties = [
  {
    party: 'DEM',
    label: 'Democratic',
    otherLabel: 'Republican',
  },
  {
    party: 'REP',
    label: 'Republican',
    otherLabel: 'Democratic',
  },
];

test.each(parties)('can select $label party', async ({ party, label }) => {
  await renderComponent();

  userEvent.click(screen.getButton(label));

  const confirmButton = screen.getButton('Confirm Check-In');
  await vi.waitFor(() => expect(confirmButton).not.toBeDisabled());

  userEvent.click(confirmButton);

  expect(onConfirmCheckIn).toHaveBeenCalledOnce();
  expect(onConfirmCheckIn).toHaveBeenLastCalledWith(
    mockVoterId,
    mockIdentificationMethod,
    party
  );
});

test.each(parties)(
  'can switch from $otherLabel to $label party',
  async ({ otherLabel, party, label }) => {
    await renderComponent();

    const firstPartyButton = screen.getButton(otherLabel);
    // Check background color as a proxy for selected state. It would be
    // more idiomatic to use a styled radio input for this component but
    // `Button` gives us the styles we want out of the box.
    expect(firstPartyButton).toHaveStyle('background-color: transparent');
    userEvent.click(firstPartyButton);
    // After selection, the button's background should be filled, not transparent
    await vi.waitFor(() =>
      expect(firstPartyButton).not.toHaveStyle('background-color: transparent')
    );

    const secondPartyButton = screen.getButton(label);
    expect(secondPartyButton).toHaveStyle('background-color: transparent');
    userEvent.click(secondPartyButton);
    await vi.waitFor(() =>
      expect(secondPartyButton).not.toHaveStyle('background-color: transparent')
    );

    const confirmButton = screen.getButton('Confirm Check-In');
    await vi.waitFor(() => expect(confirmButton).not.toBeDisabled());

    userEvent.click(confirmButton);

    expect(onConfirmCheckIn).toHaveBeenCalledOnce();
    expect(onConfirmCheckIn).toHaveBeenLastCalledWith(
      mockVoterId,
      mockIdentificationMethod,
      party
    );
  }
);

test('onBack is called when "Back" is clicked', async () => {
  await renderComponent();

  userEvent.click(screen.getButton('Back'));
  expect(onBack).toHaveBeenCalledOnce();
});
