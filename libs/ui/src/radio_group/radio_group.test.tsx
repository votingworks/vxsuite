import React from 'react';

import userEvent from '@testing-library/user-event';
import { render, screen, within } from '../../test/react_testing_library';
import { RadioGroup } from '.';

test('renders all provided options', () => {
  const onChange = jest.fn();

  render(
    <RadioGroup
      label="Pick a card:"
      onChange={onChange}
      options={[
        { id: 'hearts-4', label: 'Four of Hearts' },
        { id: 'clubs-6', label: 'Six of Clubs' },
        { id: 'diamonds-jack', label: 'Jack of Diamonds' },
        { id: 'spades-2', label: 'Two of Spades' },
      ]}
      selectedOptionId="diamonds-jack"
    />
  );

  screen.getByText('Pick a card:');

  const groupElement = screen.getByRole('radiogroup', { name: 'Pick a card:' });

  const withinGroup = within(groupElement);
  withinGroup.getByRole('radio', { name: 'Four of Hearts', checked: false });
  withinGroup.getByRole('radio', { name: 'Six of Clubs', checked: false });
  withinGroup.getByRole('radio', { name: 'Jack of Diamonds', checked: true });
  withinGroup.getByRole('radio', { name: 'Two of Spades', checked: false });

  userEvent.click(withinGroup.getByRole('radio', { name: 'Four of Hearts' }));
  expect(onChange).toBeCalledWith('hearts-4');
});

test('a11y for disabled options', () => {
  const onChange = jest.fn();

  render(
    <RadioGroup
      label="Pick a card:"
      onChange={onChange}
      options={[
        { id: 'hearts-4', label: 'Four of Hearts' },
        { id: 'clubs-6', label: 'Six of Clubs', disabled: true },
      ]}
      selectedOptionId="hearts-4"
    />
  );

  const disabledOption = screen.getByRole('radio', { name: 'Six of Clubs' });
  userEvent.click(disabledOption);

  expect(onChange).not.toHaveBeenCalled();
});

test('label is not visible if `hideLabel == true`', () => {
  const onChange = jest.fn();

  render(
    <RadioGroup
      hideLabel
      label="Pick a card:"
      onChange={onChange}
      options={[
        { id: 'hearts-4', label: 'Four of Hearts' },
        { id: 'clubs-6', label: 'Six of Clubs' },
      ]}
      selectedOptionId="hearts-4"
    />
  );

  expect(screen.queryByText('Pick a card:')).not.toBeInTheDocument();

  // Verify the radiogroup role is still labelled appropriately.
  screen.getByRole('radiogroup', { name: 'Pick a card:' });
});
