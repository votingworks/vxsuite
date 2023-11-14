import userEvent from '@testing-library/user-event';
import { CheckboxGroup } from './checkbox_group';
import { render, screen, within } from '../test/react_testing_library';

test('renders and selects/unselects options', () => {
  const onChange = jest.fn();

  render(
    <CheckboxGroup
      label="Pick cards:"
      onChange={onChange}
      options={[
        { value: 'hearts-4', label: 'Four of Hearts' },
        { value: 'clubs-6', label: 'Six of Clubs' },
        { value: 'diamonds-jack', label: 'Jack of Diamonds' },
        { value: 'spades-2', label: 'Two of Spades' },
      ]}
      value={['diamonds-jack', 'clubs-6']}
    />
  );

  screen.getByText('Pick cards:');

  const groupElement = screen.getByRole('group', { name: 'Pick cards:' });

  const withinGroup = within(groupElement);
  withinGroup.getByRole('checkbox', { name: 'Four of Hearts', checked: false });
  withinGroup.getByRole('checkbox', { name: 'Six of Clubs', checked: true });
  withinGroup.getByRole('checkbox', {
    name: 'Jack of Diamonds',
    checked: true,
  });
  withinGroup.getByRole('checkbox', { name: 'Two of Spades', checked: false });

  userEvent.click(
    withinGroup.getByRole('checkbox', { name: 'Four of Hearts' })
  );
  expect(onChange).toHaveBeenLastCalledWith([
    'diamonds-jack',
    'clubs-6',
    'hearts-4',
  ]);

  userEvent.click(withinGroup.getByRole('checkbox', { name: 'Six of Clubs' }));
  expect(onChange).toHaveBeenLastCalledWith(['diamonds-jack']);
});

test('disabled', () => {
  const onChange = jest.fn();

  render(
    <CheckboxGroup
      label="Pick cards:"
      onChange={onChange}
      options={[
        { value: 'hearts-4', label: 'Four of Hearts' },
        { value: 'clubs-6', label: 'Six of Clubs' },
      ]}
      value={['hearts-4']}
      disabled
    />
  );

  const option = screen.getByRole('checkbox', { name: 'Six of Clubs' });
  userEvent.click(option);

  expect(onChange).not.toHaveBeenCalled();
});

test('label is not visible if `hideLabel == true`', () => {
  const onChange = jest.fn();

  render(
    <CheckboxGroup
      hideLabel
      label="Pick cards:"
      onChange={onChange}
      options={[
        { value: 'hearts-4', label: 'Four of Hearts' },
        { value: 'clubs-6', label: 'Six of Clubs' },
      ]}
      value={['hearts-4']}
    />
  );

  expect(screen.queryByText('Pick cards:')).not.toBeInTheDocument();

  // Verify the container is still labelled appropriately.
  screen.getByRole('group', { name: 'Pick cards:' });
});
