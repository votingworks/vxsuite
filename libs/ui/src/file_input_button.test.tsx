import { expect, test, vi } from 'vitest';
import { userEvent } from './user_event.js';
import { render, screen } from '../test/react_testing_library.js';
import { FileInputButton } from './file_input_button.js';

const mockFile = new File(['mock contents'], 'mock-file.txt', {
  type: 'text/plain',
});

test('uses hidden file input', async () => {
  const onChange = vi.fn();
  render(<FileInputButton onChange={onChange}>Select file</FileInputButton>);

  const input = screen.getByLabelText('Select file');
  expect(input).toHaveAttribute('type', 'file');

  await userEvent.upload(input, mockFile);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(Array.from(onChange.mock.calls[0]![0].target.files)).toEqual([
    mockFile,
  ]);
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

  await userEvent.upload(input, mockFile);
  expect(onChange).not.toHaveBeenCalled();
});
