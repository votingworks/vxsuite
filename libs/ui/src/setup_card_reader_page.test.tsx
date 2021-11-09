import React from 'react';
import { render } from '@testing-library/react';

import { SetupCardReaderPage } from './setup_card_reader_page';

describe('renders SetupCardReaderPage', () => {
  test('with no useEffect trigger as expected', async () => {
    const { container } = render(<SetupCardReaderPage />);
    expect(container.firstChild).toMatchSnapshot();
  });

  test('triggers useEffect property', async () => {
    const triggerFn = jest.fn();
    const { container } = render(
      <SetupCardReaderPage useEffectToggleLargeDisplay={triggerFn} />
    );
    expect(container.firstChild).toMatchSnapshot();
    expect(triggerFn).toHaveBeenCalled();
  });
});
