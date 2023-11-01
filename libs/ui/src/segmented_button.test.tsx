import userEvent from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library';
import { SegmentedButton, SegmentedButtonOption } from './segmented_button';
import { makeTheme } from './themes/make_theme';

type TestOptionId = 'a' | 'b' | 'c';

const TEST_OPTIONS: ReadonlyArray<SegmentedButtonOption<TestOptionId>> = [
  { id: 'a', label: 'Option A' },
  { id: 'b', label: 'Option B' },
  { id: 'c', label: 'Option C', ariaLabel: 'Enable Option C' },
];

test('renders all provided options ', () => {
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
  userEvent.click(
    screen.getByRole('option', { name: 'Option A', selected: false })
  );
  expect(onChange).toHaveBeenCalledWith<[TestOptionId]>('a');

  userEvent.click(
    screen.getByRole('option', { name: 'Option B', selected: true })
  );
  expect(onChange).toHaveBeenCalledWith<[TestOptionId]>('b');

  userEvent.click(
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

test('with desktop theme', () => {
  render(
    <SegmentedButton
      label="Test Label"
      onChange={jest.fn()}
      options={TEST_OPTIONS}
      selectedOptionId="b"
    />,
    { vxTheme: makeTheme({ sizeMode: 'desktop', colorMode: 'desktop' }) }
  );
  screen.getByRole('listbox', { name: 'Test Label' });
  screen.getByRole('option', { name: 'Option A', selected: false });
  screen.getByRole('option', { name: 'Option B', selected: true });
  screen.getByRole('option', { name: 'Enable Option C', selected: false });
});

test('with desktop theme, vertical', () => {
  render(
    <SegmentedButton
      label="Test Label"
      onChange={jest.fn()}
      options={TEST_OPTIONS}
      selectedOptionId="b"
      vertical
    />,
    { vxTheme: makeTheme({ sizeMode: 'desktop', colorMode: 'desktop' }) }
  );
  screen.getByRole('listbox', { name: 'Test Label' });
  screen.getByRole('option', { name: 'Option A', selected: false });
  screen.getByRole('option', { name: 'Option B', selected: true });
  screen.getByRole('option', { name: 'Enable Option C', selected: false });
});
