import React from 'react';
import { render, screen } from '@testing-library/react';
import { Sheet } from './sheet';

test('renders', async () => {
  render(
    <Sheet
      sheetId="abc123"
      markThresholds={{ marginal: 0.05, definite: 0.08 }}
      frontMarks={[]}
      backMarks={[]}
      onSwap={jest.fn()}
      onRotate={jest.fn()}
    />
  );

  await screen.findByAltText('Scanned front of ballot');
  await screen.findByAltText('Scanned back of ballot');
});

test('clicking swap button calls onSwap', async () => {
  const onSwap = jest.fn();
  render(
    <Sheet
      sheetId="abc123"
      markThresholds={{ marginal: 0.05, definite: 0.08 }}
      frontMarks={[]}
      backMarks={[]}
      onSwap={onSwap}
      onRotate={jest.fn()}
    />
  );

  await screen.findByAltText('Scanned front of ballot');
  await screen.findByAltText('Scanned back of ballot');

  const swapButton = screen.getByText('Swap');
  swapButton.click();

  expect(onSwap).toHaveBeenCalledTimes(1);
});

test('clicking rotate button calls onRotate', async () => {
  const onRotate = jest.fn();
  render(
    <Sheet
      sheetId="abc123"
      markThresholds={{ marginal: 0.05, definite: 0.08 }}
      frontMarks={[]}
      backMarks={[]}
      onSwap={jest.fn()}
      onRotate={onRotate}
    />
  );

  await screen.findByAltText('Scanned front of ballot');
  await screen.findByAltText('Scanned back of ballot');

  const rotateButton = screen.getByText('Rotate');
  rotateButton.click();

  expect(onRotate).toHaveBeenCalledTimes(1);
});
