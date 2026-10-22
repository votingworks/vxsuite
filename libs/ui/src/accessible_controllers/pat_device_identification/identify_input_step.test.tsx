import { expect, test, vi } from 'vitest';
import { userEvent } from '../../user_event.js';
import { render, screen } from '../../../test/react_testing_library.js';
import {
  IdentifyInputStep,
  type InputBehavior,
} from './identify_input_step.js';

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
  async ({ desiredInput, desiredKey }) => {
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
    await userEvent.keyboard(desiredKey);
    screen.getByRole('heading', {
      name: `Input Identified: "${desiredInput}"`,
    });
    screen.getByText('Activate the input again to continue.');

    expect(onStepCompleted).not.toHaveBeenCalled();
    await userEvent.keyboard(desiredKey);
    expect(onStepCompleted).toHaveBeenCalled();
  }
);

test.each(testSpecs)(
  'when desired input is $desiredInput, warns when $otherInput is triggered',
  async ({ desiredInput, desiredKey, otherInput, otherKey }) => {
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
    await userEvent.keyboard(otherKey);
    screen.getByRole('heading', { name: `Input Activated: "${otherInput}"` });
    screen.getByText('Activate the other input.');

    await userEvent.keyboard(desiredKey);
    screen.getByRole('heading', {
      name: `Input Identified: "${desiredInput}"`,
    });
    screen.getByText('Activate the input again to continue.');
  }
);

test('non-PAT keys are ignored', async () => {
  const onStepCompleted = vi.fn();
  render(
    <IdentifyInputStep inputName="Move" onStepCompleted={onStepCompleted} />
  );

  await userEvent.keyboard('3');
  screen.getByRole('heading', { name: 'Identify the "Move" Input' });
  expect(onStepCompleted).not.toBeCalled();
});
