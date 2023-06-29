import { render, screen } from '../test/react_testing_library';

import { Loading } from './loading';

test('Renders Loading with defaults', () => {
  const { container } = render(<Loading />);
  screen.getByText('Loading');
  expect(container.firstChild).toMatchSnapshot();
});

test('Renders Loading with: fullscreen, tag, and label', () => {
  const { container } = render(
    <Loading isFullscreen as="p">
      Printing
    </Loading>
  );
  expect(container.firstChild).toHaveStyleRule('display', 'flex');
  expect(container.firstChild).toHaveStyleRule('flex', '1');

  const progressEllipsis = screen.getByText('Printing');
  expect(progressEllipsis.tagName).toEqual('P');
});
