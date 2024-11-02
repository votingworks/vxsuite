import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sleep } from '@votingworks/basics';
import { hasTextAcrossElements } from '@votingworks/test-utils';

import { SignedHashValidationQrCodeValue } from '@votingworks/types';
import { newTestContext } from '../test/test_context';
import { SignedHashValidationButton } from './signed_hash_validation_button';

const { mockApiClient, render } = newTestContext();

function mockSignedHashValidationQrCodeGeneration(
  qrCodeInputs: Partial<SignedHashValidationQrCodeValue['qrCodeInputs']> = {}
) {
  mockApiClient.generateSignedHashValidationQrCodeValue.mockImplementation(
    async () => {
      await sleep(500);
      return {
        qrCodeValue: 'qr-code-value',
        qrCodeInputs: {
          combinedElectionHash: 'combined-election-hash',
          date: new Date('1/1/2024, 12:00:00 PM'),
          machineId: 'machine-id',
          softwareVersion: 'software-version',
          systemHash: ''.padEnd(44, '='),
          ...qrCodeInputs,
        },
      };
    }
  );
}

beforeEach(() => {
  mockSignedHashValidationQrCodeGeneration();
});

test('SignedHashValidationButton', async () => {
  render(<SignedHashValidationButton apiClient={mockApiClient} />);

  const expectedLoadingMessage = 'Hashing system state and signing the hash...';
  const expectedSuccessMessage =
    'Scan this QR code at https://check.voting.works';

  userEvent.click(
    await screen.findByRole('button', { name: 'Signed Hash Validation' })
  );
  let modal = await screen.findByRole('alertdialog');

  within(modal).getByText(expectedLoadingMessage);
  expect(
    within(modal).queryByText(hasTextAcrossElements(expectedSuccessMessage))
  ).not.toBeInTheDocument();

  await within(modal).findByText(hasTextAcrossElements(expectedSuccessMessage));
  expect(
    within(modal).queryByText(expectedLoadingMessage)
  ).not.toBeInTheDocument();

  screen.getByText(hasTextAcrossElements(`System Hash:${''.padEnd(44, '=')}`));
  screen.getByText(hasTextAcrossElements('Version: software-version'));
  screen.getByText(hasTextAcrossElements('Machine ID: machine-id'));
  screen.getByText(
    hasTextAcrossElements('Election ID: combined-election-hash')
  );
  screen.getByText(hasTextAcrossElements('Date: 1/1/2024'));
  screen.getByText(hasTextAcrossElements('Time: 12:00:00 PM'));

  userEvent.click(within(modal).getByRole('button', { name: 'Done' }));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );

  mockSignedHashValidationQrCodeGeneration({
    combinedElectionHash: '',
    date: new Date('1/1/2024, 12:01:00 PM'),
  });

  userEvent.click(
    screen.getByRole('button', { name: 'Signed Hash Validation' })
  );
  modal = await screen.findByRole('alertdialog');

  await within(modal).findByText(hasTextAcrossElements(expectedSuccessMessage));

  screen.getByText(hasTextAcrossElements(`System Hash:${''.padEnd(44, '=')}`));
  screen.getByText(hasTextAcrossElements('Version: software-version'));
  screen.getByText(hasTextAcrossElements('Machine ID: machine-id'));
  screen.getByText(hasTextAcrossElements('Election ID: None'));
  screen.getByText(hasTextAcrossElements('Date: 1/1/2024'));
  screen.getByText(hasTextAcrossElements('Time: 12:01:00 PM'));
});
