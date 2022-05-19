import React from 'react';
import { render } from '@testing-library/react';
import 'jest-styled-components';

import { Text, TextWithLineBreaks } from './text';

describe('renders Text', () => {
  test('as paragraph tag', () => {
    const text = 'paragraph';
    const { getByText } = render(<Text>{text}</Text>);
    const element = getByText(text);
    expect(element.tagName).toEqual('P');
    expect(element).toMatchSnapshot();
  });

  test('center muted', () => {
    const { container } = render(
      <Text center muted>
        center muted?
      </Text>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  test('displays error style', () => {
    const { container } = render(<Text error>Error Text?</Text>);
    expect(container.firstChild).toMatchSnapshot();
  });

  test('displays success style', () => {
    const { container } = render(<Text success>Error Text?</Text>);
    expect(container.firstChild).toMatchSnapshot();
  });

  test('narrow wordBreak warning', () => {
    const { container } = render(
      <Text narrow wordBreak warning>
        narrow wordBreak
      </Text>
    );
    expect(container.firstChild).toMatchSnapshot();
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
    expect(container.firstChild).toMatchSnapshot();
  });

  test('align right nowrap light', () => {
    const { container } = render(
      <Text right noWrap light>
        align right nowrap
      </Text>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  test('small white bold', () => {
    const { container } = render(
      <Text small white bold>
        small white bold
      </Text>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('converts line-breaks into <p> and <br/> tags', () => {
    const { container } = render(
      <TextWithLineBreaks
        text={'I’m a paragraph.\n\nAnd I’m a paragraph with a\nline break.'}
      />
    );
    expect(container).toMatchInlineSnapshot(`
      @media print {

      }

      <div>
        <p
          class=""
        >
          <span>
            I’m a paragraph.
          </span>
        </p>
        <p
          class=""
        >
          <span>
            And I’m a paragraph with a
          </span>
          <br />
          <span>
            line break.
          </span>
        </p>
      </div>
    `);
  });
});
