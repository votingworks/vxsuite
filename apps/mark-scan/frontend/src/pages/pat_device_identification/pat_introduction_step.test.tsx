import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/react_testing_library';
import { PatIntroductionStep } from './pat_introduction_step';

test('calls provided onStepCompleted fn when valid input is pressed', () => {
  const onStepCompleted = vi.fn();

  render(<PatIntroductionStep onStepCompleted={onStepCompleted} />);

  screen.getByText('Test Your Device');
  expect(onStepCompleted).not.toHaveBeenCalled();
  userEvent.keyboard('1');
  expect(onStepCompleted).toHaveBeenCalled();
});
