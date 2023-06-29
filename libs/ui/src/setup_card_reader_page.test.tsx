import { render, screen } from '../test/react_testing_library';

import { SetupCardReaderPage } from './setup_card_reader_page';

describe('renders SetupCardReaderPage', () => {
  test('with no useEffect trigger as expected', () => {
    const { container } = render(<SetupCardReaderPage />);
    screen.getByText('Card Reader Not Detected');
    screen.getByText('Please ask a poll worker to connect card reader.');
    expect(container.firstChild).toMatchSnapshot();
  });

  test('renders SetupCardReaderPage with usePollWorkerLanguage set to false', () => {
    render(<SetupCardReaderPage usePollWorkerLanguage={false} />);
    screen.getByText('Card Reader Not Detected');
    screen.getByText('Please connect the card reader to continue.');
    expect(
      screen.queryByText('Please ask a poll worker to connect card reader.')
    ).not.toBeInTheDocument();
  });
});
