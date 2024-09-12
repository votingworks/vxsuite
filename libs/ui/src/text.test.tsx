import { render, screen } from '../test/react_testing_library';

import { Text, successTextGreen } from './text';

describe('renders Text', () => {
  test('as paragraph tag', () => {
    const text = 'paragraph';
    render(<Text>{text}</Text>);
    const element = screen.getByText(text);
    expect(element.tagName).toEqual('P');
    expect(element).toMatchSnapshot();
  });

  test('center muted', () => {
    const { container } = render(
      <Text center muted>
        center muted?
      </Text>
    );
    expect(container.firstChild).toHaveStyleRule('color', 'gray');
    expect(container.firstChild).toHaveStyleRule('color', 'black', {
      media: 'print',
    });
    expect(container.firstChild).toHaveStyleRule('text-align', 'center');
  });

  test('displays error style', () => {
    const { container } = render(<Text error>Error Text?</Text>);
    expect(container.firstChild).toHaveStyleRule('color', 'red');
    expect(container.firstChild).toHaveStyleRule('color', 'black', {
      media: 'print',
    });
  });

  test('displays success style', () => {
    const { container } = render(<Text success>Success Text?</Text>);
    expect(container.firstChild).toHaveStyleRule('color', successTextGreen);
    expect(container.firstChild).toHaveStyleRule('color', 'black', {
      media: 'print',
    });
  });

  test('narrow wordBreak warning', () => {
    const { container } = render(
      <Text narrow wordBreak warning>
        narrow wordBreak
      </Text>
    );

    // narrow
    expect(container.firstChild).toHaveStyleRule('margin-left', 'auto');
    expect(container.firstChild).toHaveStyleRule('margin-right', 'auto');
    expect(container.firstChild).toHaveStyleRule('max-width', '33ch');

    // wordBreak
    expect(container.firstChild).toHaveStyleRule('word-break', 'break-word');

    // warning
    expect(container.firstChild).toHaveStyleRule('color', 'darkorange');
    expect(container.firstChild).toHaveStyleRule('color', 'black', {
      media: 'print',
    });
  });

  test('vote icon', () => {
    const { container } = render(<Text voteIcon>vote!</Text>);
    expect(container.firstChild).toMatchSnapshot();
  });

  test('warning icon', () => {
    const { container } = render(<Text warningIcon>Warning</Text>);
    expect(container.firstChild).toMatchSnapshot();
  });

  test('warning icon/vote icon toggle', () => {
    const toggle = true;
    let { container } = render(
      <Text warningIcon={toggle} voteIcon={!toggle}>
        Warning
      </Text>
    );
    expect(container.firstChild).toHaveStyleRule('content', "'!'", {
      modifier: '::before',
    });
    expect(container.firstChild).toHaveStyleRule('background', 'darkorange', {
      modifier: '::before',
    });
    expect(container.firstChild).toHaveStyleRule('border-radius', '50%', {
      modifier: '::before',
    });

    ({ container } = render(
      <Text warningIcon={!toggle} voteIcon={toggle}>
        Success
      </Text>
    ));
    expect(container.firstChild).toHaveStyleRule('content', "'✓'", {
      modifier: '::before',
    });
    expect(container.firstChild).toHaveStyleRule('background', '#028099', {
      modifier: '::before',
    });
  });

  test('align left preLine normal italic', () => {
    const { container } = render(
      <Text left preLine normal italic>
        align left preLine
      </Text>
    );
    expect(container.firstChild).toHaveStyleRule('text-align', 'left');
    expect(container.firstChild).toHaveStyleRule('white-space', 'pre-line');
    expect(container.firstChild).toHaveStyleRule('font-weight', '400');
    expect(container.firstChild).toHaveStyleRule('font-style', 'italic');
  });

  test('align right nowrap light', () => {
    const { container } = render(
      <Text right noWrap light>
        align right nowrap
      </Text>
    );
    expect(container.firstChild).toHaveStyleRule('text-align', 'right');
    expect(container.firstChild).toHaveStyleRule('white-space', 'nowrap');
    expect(container.firstChild).toHaveStyleRule('font-weight', '300');
  });

  test('small white bold', () => {
    const { container } = render(
      <Text small white bold>
        small white bold
      </Text>
    );
    expect(container.firstChild).toHaveStyleRule('font-size', '0.8em');
    expect(container.firstChild).toHaveStyleRule('color', '#FFFFFF');
    expect(container.firstChild).toHaveStyleRule('color', '#FFFFFF', {
      media: 'print',
    });
    expect(container.firstChild).toHaveStyleRule('font-weight', '600');
  });
});
