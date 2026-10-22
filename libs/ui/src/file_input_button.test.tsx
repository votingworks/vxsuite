import type { ChangeEvent } from 'react';
import { expect, test, vi } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library.js';
import { FileInputButton } from './file_input_button.js';

const mockFile = new File(['mock contents'], 'mock-file.txt', {
  type: 'text/plain',
});

test('uses hidden file input', async () => {
  const onChange = vi.fn((event: ChangeEvent<HTMLInputElement>) => [
    ...event.target.files!,
  ]);
  render(<FileInputButton onChange={onChange}>Select file</FileInputButton>);

  const input = screen.getByLabelText('Select file');
  expect(input).toHaveAttribute('type', 'file');

  await userEvent.setup({ applyAccept: false }).upload(input, mockFile);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.results[0]!.value).toEqual([mockFile]);
});

test('can be disabled', async () => {
  const onChange = vi.fn();
  render(
    <FileInputButton disabled onChange={onChange}>
      Select file
    </FileInputButton>
  );

  const input = screen.getByLabelText('Select file');
  expect(input).toBeDisabled();

  await userEvent.setup({ applyAccept: false }).upload(input, mockFile);
  expect(onChange).not.toHaveBeenCalled();
});
