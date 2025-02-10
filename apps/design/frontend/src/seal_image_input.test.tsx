import { expect, test, vi } from 'vitest';
import { render, screen } from '../test/react_testing_library';
import { SealImageInput } from './seal_image_input';

test('uses "Upload Seal Image" button label', () => {
  render(<SealImageInput onChange={vi.fn()} />);
  expect(screen.getByText('Upload Seal Image')).toBeInTheDocument();
});

test('uses "Remove Seal Image" remove button label', () => {
  render(<SealImageInput onChange={vi.fn()} value="<svg />" />);
  expect(screen.getByText('Remove Seal Image')).toBeInTheDocument();
});
