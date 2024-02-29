import userEvent from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library';
import { ContestChoiceButton } from './contest_choice_button';

test('renders with default accessible name', () => {
  render(
    <ContestChoiceButton
      label="Cleopatra"
      caption="Ptolemaic"
      choice="cleo"
      onPress={jest.fn()}
    />
  );

  screen.getByRole('option', { name: 'Cleopatra Ptolemaic' });
});

test('uses optional ariaLabel as accessible name', () => {
  render(
    <ContestChoiceButton
      ariaLabel="The Queen of Kings"
      label="Cleopatra"
      choice="cleo"
      onPress={jest.fn()}
    />
  );

  screen.getByRole('option', { name: 'The Queen of Kings' });
});

test('fires press event with choice value', () => {
  const onPress = jest.fn();

  render(
    <ContestChoiceButton label="Cleopatra" choice="cleo" onPress={onPress} />
  );

  expect(onPress).not.toBeCalled();

  userEvent.click(screen.getByRole('option'));

  expect(onPress).toBeCalledWith('cleo');
});

test('has accessible "selected" state', () => {
  render(
    <ContestChoiceButton
      isSelected
      label="Cleopatra"
      choice="cleo"
      onPress={jest.fn()}
    />
  );

  userEvent.click(
    screen.getByRole('option', { name: 'Cleopatra', selected: true })
  );
});
