import { expect, test, vi } from 'vitest';
import { useState } from 'react';
import { userEvent } from './user_event.js';
import { render, screen } from '../test/react_testing_library.js';
import { NumberInput } from './number_input.js';

function ControllerNumberInput({
  onChange,
  initialValue = '',
}: {
  onChange: (v: number | '') => void;
  initialValue?: number | '';
}) {
  const [value, setValue] = useState<number | ''>(initialValue);
  return (
    <NumberInput
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
    />
  );
}

test('calls onChange when valid number is entered', async () => {
  const onChange = vi.fn();
  render(<ControllerNumberInput initialValue={42} onChange={onChange} />);

  expect(screen.getByDisplayValue('42')).toBeInTheDocument();
  const input = screen.getByRole('textbox');
  await userEvent.clear(input);
  await userEvent.type(input, '123');

  expect(onChange).toHaveBeenLastCalledWith(123);
});

test('ignores invalid input', async () => {
  const onChange = vi.fn();
  render(<ControllerNumberInput initialValue="" onChange={onChange} />);

  const input = screen.getByRole('textbox');
  await userEvent.type(input, 'abc');

  expect(onChange).not.toHaveBeenCalled();
});
