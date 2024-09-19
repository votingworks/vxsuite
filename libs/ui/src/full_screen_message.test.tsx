import { FullScreenMessage } from './full_screen_message';
import { render, screen } from '../test/react_testing_library';
import { InsertCardImage } from './smart_card_images';

describe('FullScreenMessage', () => {
  test('renders in landscape', () => {
    const { container } = render(
      <FullScreenMessage title="Insert card" image={<InsertCardImage />}>
        Put the card into the reader
      </FullScreenMessage>
    );
    screen.getByRole('heading', { name: 'Insert card' });
    screen.getByText('Put the card into the reader');
    expect(container.getElementsByTagName('svg')).toHaveLength(1);
    expect(container.firstChild).toHaveStyle({ flexDirection: 'row' });
  });

  test('renders in portrait', () => {
    const landscapeHeight = window.innerHeight;
    const landscapeWidth = window.innerWidth;
    window.innerHeight = landscapeWidth;
    window.innerWidth = landscapeHeight;

    const { container } = render(
      <FullScreenMessage title="Insert card" image={<InsertCardImage />}>
        Put the card into the reader
      </FullScreenMessage>
    );
    screen.getByRole('heading', { name: 'Insert card' });
    screen.getByText('Put the card into the reader');
    expect(container.getElementsByTagName('svg')).toHaveLength(1);
    expect(container.firstChild).toHaveStyle({ flexDirection: 'column' });

    window.innerHeight = landscapeHeight;
    window.innerWidth = landscapeWidth;
  });
});
