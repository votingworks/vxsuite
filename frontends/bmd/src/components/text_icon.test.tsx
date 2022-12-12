import React from 'react';
import { render, screen } from '@testing-library/react';
import { TextIcon } from './text_icon';

// test('it works', () => {
//   const tree = renderer.create(<Button />).toJSON()
//   expect(tree).toMatchSnapshot()
//   expect(tree).toHaveStyleRule('color', 'red')
// })

test('Arrow Left', () => {
  render(<TextIcon arrowLeft>Arrow Left</TextIcon>);
  expect(screen.getByText('Arrow Left')).toHaveStyleRule('width', '1.375rem', {
    modifier: '::before',
  });
});

test('Arrow Left small', () => {
  render(
    <TextIcon arrowLeft small>
      Arrow Left
    </TextIcon>
  );
  expect(screen.getByText('Arrow Left')).toHaveStyleRule('width', '1rem', {
    modifier: '::before',
  });
});

test('Arrow Right', () => {
  render(<TextIcon arrowRight>Arrow Right</TextIcon>);
  expect(screen.getByText('Arrow Right')).toHaveStyleRule('width', '1.375rem', {
    modifier: '::after',
  });
});

test('Arrow Right small white', () => {
  render(
    <TextIcon arrowRight small white>
      Arrow Right
    </TextIcon>
  );
  const arrow = screen.getByText('Arrow Right');
  expect(arrow).toHaveStyleRule('width', '1rem', {
    modifier: '::after',
  });
  expect(arrow).toHaveStyleRule(
    'background',
    "url('/images/arrow-right-open-white.svg') no-repeat",
    {
      modifier: '::after',
    }
  );
});
