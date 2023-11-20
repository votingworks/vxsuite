import userEvent from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library';
import { FileInputButton } from './file_input_button';

const mockFile = new File(['mock contents'], 'mock-file.txt', {
  type: 'text/plain',
});

test('uses hidden file input', () => {
  const onChange = jest.fn();
  render(<FileInputButton onChange={onChange}>Select file</FileInputButton>);

  const input = screen.getByLabelText('Select file');
  expect(input).toHaveAttribute('type', 'file');

  userEvent.upload(input, mockFile);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(Array.from(onChange.mock.calls[0][0].target.files)).toEqual([
    mockFile,
  ]);
});

test('can be disabled', () => {
  const onChange = jest.fn();
  render(
    <FileInputButton disabled onChange={onChange}>
      Select file
    </FileInputButton>
  );

  const input = screen.getByLabelText('Select file');
  expect(input).toBeDisabled();

  userEvent.upload(input, mockFile);
  expect(onChange).not.toHaveBeenCalled();
});
