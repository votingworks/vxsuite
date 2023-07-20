import userEvent from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library';
import { SegmentedButton, SegmentedButtonOption } from './segmented_button';

type TestOptionId = 'a' | 'b' | 'c';

const TEST_OPTIONS: ReadonlyArray<SegmentedButtonOption<TestOptionId>> = [
  { id: 'a', label: 'Option A' },
  { id: 'b', label: 'Option B' },
  { id: 'c', label: 'Option C', ariaLabel: 'Enable Option C' },
];

test('renders all provided options ', async () => {
  const onChange = jest.fn();

  render(
    <SegmentedButton
      label="Test Label"
      onChange={onChange}
      options={TEST_OPTIONS}
      selectedOptionId="b"
    />
  );

  expect(onChange).not.toHaveBeenCalled();

  // Verify the label is rendered:
  screen.getByText('Test Label');

  // Verify the options are rendered in an accessible listbox:
  screen.getByRole('listbox', { name: 'Test Label' });

  //
  // Verify all option clicks work as expected:
  //
  await userEvent.click(
    screen.getByRole('option', { name: 'Option A', selected: false })
  );
  expect(onChange).toHaveBeenCalledWith<[TestOptionId]>('a');

  await userEvent.click(
    screen.getByRole('option', { name: 'Option B', selected: true })
  );
  expect(onChange).toHaveBeenCalledWith<[TestOptionId]>('b');

  await userEvent.click(
    screen.getByRole('option', { name: 'Enable Option C', selected: false })
  );
  expect(onChange).toHaveBeenCalledWith<[TestOptionId]>('c');
});

test('optionally hides label', () => {
  const onChange = jest.fn();

  render(
    <SegmentedButton
      hideLabel
      label="Test Label"
      onChange={onChange}
      options={TEST_OPTIONS}
      vertical
    />
  );

  // Verify the label is not rendered:
  expect(screen.queryByText('Test Label')).not.toBeInTheDocument();

  // Verify the options are still rendered in an accessible listbox:
  screen.getByRole('listbox', { name: 'Test Label' });
});
