import { expect, test, vi } from 'vitest';
import { userEvent } from './user_event.js';
import { render, screen } from '../test/react_testing_library.js';
import { CheckboxButton } from './checkbox_button.js';

test('checks', async () => {
  const onChange = vi.fn();

  render(<CheckboxButton label="Yes?" onChange={onChange} isChecked={false} />);

  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Yes?', checked: false })
  );
  expect(onChange).toHaveBeenLastCalledWith(true);
});

test('unchecks', async () => {
  const onChange = vi.fn();

  render(<CheckboxButton label="Yes?" onChange={onChange} isChecked />);

  await userEvent.click(
    screen.getByRole('checkbox', { name: 'Yes?', checked: true })
  );
  expect(onChange).toHaveBeenLastCalledWith(false);
});

test('disabled', async () => {
  const onChange = vi.fn();

  render(
    <CheckboxButton label="Yes?" onChange={onChange} isChecked disabled />
  );

  await userEvent.click(screen.getByRole('checkbox', { name: 'Yes?' }));
  expect(onChange).not.toHaveBeenCalled();
});
