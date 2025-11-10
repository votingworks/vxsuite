import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { render, screen } from '../test/react_testing_library';
import { NumberInput } from './number_input';


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

test('calls onChange when valid number is entered', () => {
  const onChange = vi.fn();
  render(<ControllerNumberInput initialValue={42} onChange={onChange} />);

  expect(screen.getByDisplayValue('42')).toBeInTheDocument();
  const input = screen.getByRole('textbox');
  userEvent.clear(input);
  userEvent.type(input, '123');

  expect(onChange).toHaveBeenLastCalledWith(123);
});

test('ignores invalid input', () => {
  const onChange = vi.fn();
  render(<ControllerNumberInput initialValue="" onChange={onChange} />);

  const input = screen.getByRole('textbox');
  userEvent.type(input, 'abc');

  expect(onChange).not.toHaveBeenCalled();
});
