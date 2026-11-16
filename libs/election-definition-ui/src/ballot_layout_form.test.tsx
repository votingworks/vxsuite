import { afterEach, beforeEach, expect, test } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import type { StateFeaturesConfig } from '@votingworks/election-definition-backend';
import { HmpbBallotPaperSize } from '@votingworks/types';
import {
  createMockApiClient,
  type MockApiClient,
  provideApi,
} from '../test/api_helpers.js';
import { render, screen, within } from '../test/react_testing_library.js';
import {
  BallotLayoutForm,
  type BallotLayoutFormProps,
} from './ballot_layout_form.js';

const electionId = 'election-1';

let apiMock: MockApiClient;

beforeEach(() => {
  apiMock = createMockApiClient();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderForm(
  stateFeatures: StateFeaturesConfig = {},
  props: Partial<BallotLayoutFormProps> = {}
) {
  apiMock.getStateFeatures
    .expectCallWith({ electionId })
    .resolves(stateFeatures);
  apiMock.getBallotLayoutSettings
    .expectCallWith({ electionId })
    .resolves({ paperSize: HmpbBallotPaperSize.Letter, compact: false });
  render(
    provideApi(apiMock, <BallotLayoutForm electionId={electionId} {...props} />)
  );
}

test('edit paper size and density', async () => {
  renderForm();

  const paperSizeRadioGroup = await screen.findByRole('radiogroup', {
    name: 'Paper Size',
  });
  const paperSizeOptions = [
    '8.5 x 11 inches (Letter)',
    '8.5 x 14 inches (Legal)',
    '8.5 x 17 inches',
    '8.5 x 18 inches',
    '8.5 x 19 inches',
    '8.5 x 20 inches',
    '8.5 x 22 inches',
  ];
  expect(within(paperSizeRadioGroup).getAllByRole('radio')).toHaveLength(
    paperSizeOptions.length
  );
  for (const optionName of paperSizeOptions) {
    expect(
      within(paperSizeRadioGroup).getByRole('radio', { name: optionName })
    ).toBeDisabled();
  }
  expect(screen.getByLabelText('8.5 x 11 inches (Letter)')).toBeChecked();
  const densityRadioGroup = screen.getByRole('radiogroup', {
    name: 'Density',
  });
  for (const optionName of ['Default', 'Compact']) {
    expect(
      within(densityRadioGroup).getByRole('radio', { name: optionName })
    ).toBeDisabled();
  }
  expect(screen.getByLabelText('Default')).toBeChecked();
  expect(screen.queryByText(/longer paper size/)).not.toBeInTheDocument();

  await userEvent.click(screen.getButton('Edit'));
  await userEvent.click(screen.getByLabelText('8.5 x 17 inches'));
  await userEvent.click(screen.getByLabelText('Compact'));
  await userEvent.click(screen.getByLabelText('Default'));
  await userEvent.click(screen.getByLabelText('Compact'));

  apiMock.updateBallotLayoutSettings
    .expectCallWith({
      electionId,
      paperSize: HmpbBallotPaperSize.Custom17,
      compact: true,
    })
    .resolves();
  apiMock.getBallotLayoutSettings
    .expectCallWith({ electionId })
    .resolves({ paperSize: HmpbBallotPaperSize.Custom17, compact: true });
  await userEvent.click(screen.getButton('Save'));
  await screen.findButton('Edit');
  expect(screen.getByLabelText('8.5 x 17 inches')).toBeChecked();
  expect(screen.getByLabelText('Compact')).toBeChecked();
});

test('cancel discards changes', async () => {
  renderForm();

  await userEvent.click(await screen.findButton('Edit'));
  await userEvent.click(screen.getByLabelText('8.5 x 14 inches (Legal)'));
  await userEvent.click(screen.getByLabelText('Compact'));
  await userEvent.click(screen.getButton('Cancel'));

  screen.getButton('Edit');
  expect(screen.getByLabelText('8.5 x 11 inches (Letter)')).toBeChecked();
  expect(screen.getByLabelText('Default')).toBeChecked();
});

test('only letter and legal paper sizes', async () => {
  renderForm({ ONLY_LETTER_AND_LEGAL_PAPER_SIZES: true });

  const paperSizeRadioGroup = await screen.findByRole('radiogroup', {
    name: 'Paper Size',
  });
  expect(within(paperSizeRadioGroup).getAllByRole('radio')).toHaveLength(2);
  within(paperSizeRadioGroup).getByRole('radio', {
    name: '8.5 x 11 inches (Letter)',
  });
  within(paperSizeRadioGroup).getByRole('radio', {
    name: '8.5 x 14 inches (Legal)',
  });
  screen.getByText(
    'Reach out to VotingWorks support if you would prefer a longer paper size.'
  );
});

test('hideDensity hides the density setting', async () => {
  renderForm({}, { hideDensity: true });

  await screen.findByRole('radiogroup', { name: 'Paper Size' });
  expect(
    screen.queryByRole('radiogroup', { name: 'Density' })
  ).not.toBeInTheDocument();
});

test('isLocked disables editing', async () => {
  renderForm({}, { isLocked: true });

  expect(await screen.findButton('Edit')).toBeDisabled();
});
