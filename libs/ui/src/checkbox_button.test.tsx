import userEvent from '@testing-library/user-event';
import { render, screen } from '../test/react_testing_library';
import { CheckboxButton } from './checkbox_button';

test('checks', () => {
  const onChange = jest.fn();

  render(<CheckboxButton label="Yes?" onChange={onChange} isChecked={false} />);

  userEvent.click(
    screen.getByRole('checkbox', { name: 'Yes?', checked: false })
  );
  expect(onChange).toHaveBeenLastCalledWith(true);
});

test('unchecks', () => {
  const onChange = jest.fn();

  render(<CheckboxButton label="Yes?" onChange={onChange} isChecked />);

  userEvent.click(
    screen.getByRole('checkbox', { name: 'Yes?', checked: true })
  );
  expect(onChange).toHaveBeenLastCalledWith(false);
});

test('disabled', () => {
  const onChange = jest.fn();

  render(
    <CheckboxButton label="Yes?" onChange={onChange} isChecked disabled />
  );

  userEvent.click(screen.getByRole('checkbox', { name: 'Yes?' }));
  expect(onChange).not.toHaveBeenCalled();
});
