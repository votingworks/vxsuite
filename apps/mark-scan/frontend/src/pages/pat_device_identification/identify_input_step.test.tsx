import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/react_testing_library';
import { IdentifyInputStep, InputBehavior } from './identify_input_step';

const testSpecs: Array<{
  desiredInput: InputBehavior;
  otherInput: InputBehavior;
  desiredKey: string;
  otherKey: string;
}> = [
  {
    desiredInput: 'Move',
    desiredKey: '1',
    otherInput: 'Select',
    otherKey: '2',
  },
  {
    desiredInput: 'Select',
    desiredKey: '2',
    otherInput: 'Move',
    otherKey: '1',
  },
];

test.each(testSpecs)(
  'confirms when $desiredInput is triggered',
  ({ desiredInput, desiredKey }) => {
    const onStepCompleted = vi.fn();
    render(
      <IdentifyInputStep
        inputName={desiredInput}
        onStepCompleted={onStepCompleted}
      />
    );

    screen.getByRole('heading', {
      name: `Identify the "${desiredInput}" Input`,
    });
    userEvent.keyboard(desiredKey);
    screen.getByRole('heading', {
      name: `Input Identified: "${desiredInput}"`,
    });
    screen.getByText('Activate the input again to continue.');

    expect(onStepCompleted).not.toHaveBeenCalled();
    userEvent.keyboard(desiredKey);
    expect(onStepCompleted).toHaveBeenCalled();
  }
);

test.each(testSpecs)(
  'when desired input is $desiredInput, warns when $otherInput is triggered',
  ({ desiredInput, desiredKey, otherInput, otherKey }) => {
    const onStepCompleted = vi.fn();
    render(
      <IdentifyInputStep
        inputName={desiredInput}
        onStepCompleted={onStepCompleted}
      />
    );

    screen.getByRole('heading', {
      name: `Identify the "${desiredInput}" Input`,
    });
    userEvent.keyboard(otherKey);
    screen.getByRole('heading', { name: `Input Activated: "${otherInput}"` });
    screen.getByText('Activate the other input.');

    userEvent.keyboard(desiredKey);
    screen.getByRole('heading', {
      name: `Input Identified: "${desiredInput}"`,
    });
    screen.getByText('Activate the input again to continue.');
  }
);

test('non-PAT keys are ignored', () => {
  const onStepCompleted = vi.fn();
  render(
    <IdentifyInputStep inputName="Move" onStepCompleted={onStepCompleted} />
  );

  userEvent.keyboard('3');
  screen.getByRole('heading', { name: 'Identify the "Move" Input' });
  expect(onStepCompleted).not.toBeCalled();
});
