import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/react_testing_library';
import {
  ResetVoterSessionButton,
  ResetVoterSessionButtonProps,
} from './deactivate_voter_session_button';
import * as api from '../api';

vi.mock(import('../api.js'));

function renderButton(
  button: JSX.Element,
  options: {
    buttonProps?: ResetVoterSessionButtonProps;
    isMutationInProgress: boolean;
  }
) {
  const { isMutationInProgress } = options;
  const mockMutate = vi.fn();

  vi.mocked(api.endCardlessVoterSession.useMutation).mockReturnValue({
    mutate: mockMutate,
    isLoading: isMutationInProgress,
  } as unknown as ReturnType<typeof api.endCardlessVoterSession.useMutation>);

  return {
    mockMutate,
    result: render(button),
  };
}

test('calls reset API on press', () => {
  const { mockMutate } = renderButton(<ResetVoterSessionButton />, {
    isMutationInProgress: false,
  });
  expect(mockMutate).not.toHaveBeenCalled();

  userEvent.click(screen.getButton(/deactivate/i));
  expect(mockMutate).toHaveBeenCalled();
});

test('is disabled while mutation is progress', () => {
  renderButton(<ResetVoterSessionButton />, { isMutationInProgress: true });
  expect(screen.getButton(/deactivate/i)).toBeDisabled();
});

test('is customizable', () => {
  renderButton(
    <ResetVoterSessionButton icon="Previous" variant="primary">
      Start Over
    </ResetVoterSessionButton>,
    { isMutationInProgress: false }
  );

  screen.getButton('Start Over');
  // TODO: Verify color/icon.
});
