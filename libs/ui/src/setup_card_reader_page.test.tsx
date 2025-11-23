import { test } from 'vitest';
import { render, screen } from '../test/react_testing_library';

import { SetupCardReaderPage } from './setup_card_reader_page';

test('SetupCardReaderPage', () => {
  render(<SetupCardReaderPage />);
  screen.getByText('Card Reader Not Detected');
  screen.getByText('Please restart the machine.');
  screen.getByText(
    'If problems persist after restarting, ask your election official to contact VotingWorks support.'
  );
});
