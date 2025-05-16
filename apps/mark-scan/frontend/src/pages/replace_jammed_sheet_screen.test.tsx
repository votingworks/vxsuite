import { beforeEach, test, vi } from 'vitest';
import { screen } from '../../test/react_testing_library';
import { render } from '../../test/test_utils';
import { ReplaceJammedSheetScreen } from './replace_jammed_sheet_screen';
import { ResetVoterSessionButton } from '../components/deactivate_voter_session_button';

vi.mock('../components/deactivate_voter_session_button');

const MOCK_RESET_BUTTON_CONTENT = 'MockResetVoterSessionButton';

beforeEach(() => {
  vi.mocked(ResetVoterSessionButton).mockReturnValue(
    // eslint-disable-next-line react/button-has-type
    <button>{MOCK_RESET_BUTTON_CONTENT}</button>
  );
});

test('jam_cleared state', () => {
  render(<ReplaceJammedSheetScreen stateMachineState="jam_cleared" />);

  screen.getByRole('heading', { name: /jam cleared/i });
  screen.getByText(/please wait/i);
  screen.getButton(MOCK_RESET_BUTTON_CONTENT);
});

test('resetting_state_machine_after_jam  state', () => {
  render(
    <ReplaceJammedSheetScreen stateMachineState="resetting_state_machine_after_jam" />
  );

  screen.getByRole('heading', { name: /jam cleared/i });
  screen.getByText(/please wait/i);
  screen.getButton(MOCK_RESET_BUTTON_CONTENT);
});

test('accepting_paper_after_jam  state', () => {
  render(
    <ReplaceJammedSheetScreen stateMachineState="accepting_paper_after_jam" />
  );

  screen.getByRole('heading', { name: /jam cleared/i });
  screen.getByText(/load a new sheet/i);
  screen.getButton(MOCK_RESET_BUTTON_CONTENT);
});

test('loading_paper_after_jam  state', () => {
  render(
    <ReplaceJammedSheetScreen stateMachineState="loading_paper_after_jam" />
  );

  screen.getByRole('heading', { name: /jam cleared/i });
  screen.getByText(/loading new sheet/i);
  screen.getButton(MOCK_RESET_BUTTON_CONTENT);
});
