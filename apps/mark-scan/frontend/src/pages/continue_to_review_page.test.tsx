import { test } from 'vitest';
import { render, screen } from '../../test/react_testing_library.js';
import { ContinueToReviewPage } from './continue_to_review_page.js';

test('renders', () => {
  render(<ContinueToReviewPage />);
  screen.getByText('Ready to Review');
});
