import { test } from 'vitest';
import { render, screen } from '../../test/react_testing_library';
import { ContinueToReviewPage } from './continue_to_review_page';

test('renders', () => {
  render(<ContinueToReviewPage />);
  screen.getByText('Ready to Review');
});
