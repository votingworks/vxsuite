import userEvent from '@testing-library/user-event';
import { render, screen, within } from '../test/react_testing_library';
import { RadioGroup } from '.';
import { makeTheme } from './themes/make_theme';

test('renders all provided options', () => {
  const onChange = jest.fn();

  render(
    <RadioGroup
      label="Pick a card:"
      onChange={onChange}
      options={[
        { value: 'hearts-4', label: 'Four of Hearts' },
        { value: 'clubs-6', label: 'Six of Clubs' },
        { value: 'diamonds-jack', label: 'Jack of Diamonds' },
        { value: 'spades-2', label: 'Two of Spades' },
      ]}
      value="diamonds-jack"
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

test('disabled', () => {
  const onChange = jest.fn();

  render(
    <RadioGroup
      label="Pick a card:"
      onChange={onChange}
      options={[
        { value: 'hearts-4', label: 'Four of Hearts' },
        { value: 'clubs-6', label: 'Six of Clubs' },
      ]}
      disabled
      value="hearts-4"
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
        { value: 'hearts-4', label: 'Four of Hearts' },
        { value: 'clubs-6', label: 'Six of Clubs' },
      ]}
      value="hearts-4"
    />
  );

  expect(screen.queryByText('Pick a card:')).not.toBeInTheDocument();

  // Verify the radiogroup role is still labelled appropriately.
  screen.getByRole('radiogroup', { name: 'Pick a card:' });
});

// For coverage of styles
test('desktop, inverse', () => {
  const theme = makeTheme({ colorMode: 'desktop', sizeMode: 'desktop' });
  render(
    <RadioGroup
      label="Pick a card:"
      onChange={jest.fn()}
      options={[
        { value: 'hearts-4', label: 'Four of Hearts' },
        { value: 'clubs-6', label: 'Six of Clubs' },
        { value: 'diamonds-jack', label: 'Jack of Diamonds' },
        { value: 'spades-2', label: 'Two of Spades' },
      ]}
      value="diamonds-jack"
      inverse
    />,
    { vxTheme: theme }
  );

  const option = screen.getByRole('radio', {
    name: 'Four of Hearts',
  }).nextSibling; // Select the button that has the styling
  expect(option).toHaveStyle(`color: ${theme.colors.onInverse}`);
  expect(option).toHaveStyle(`border-width: ${theme.sizes.bordersRem.thin}rem`);
});

test('works with accessible controller interaction pattern', () => {
  const onChange = jest.fn();

  render(
    <RadioGroup
      label="Pick a card:"
      onChange={onChange}
      options={[
        { value: 'hearts-4', label: 'Four of Hearts' },
        { value: 'diamonds-jack', label: 'Jack of Diamonds' },
      ]}
      value="diamonds-jack"
    />,
    { vxTheme: { screenType: 'elo15' } }
  );

  expect(
    screen.queryByRole('radio', { hidden: false })
  ).not.toBeInTheDocument();
  expect(screen.getAllByRole('radio', { hidden: true })).toHaveLength(2);

  screen.getButton('Jack of Diamonds');
  userEvent.click(screen.getButton('Four of Hearts'));
  expect(onChange).toBeCalledWith('hearts-4');
});
