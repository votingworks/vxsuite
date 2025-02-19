import { test } from 'vitest';
import { screen } from '../../test/react_testing_library';
import { render } from '../../test/test_utils';
import { ReplaceJammedSheetScreen } from './replace_jammed_sheet_screen';

test('jam_cleared state', () => {
  render(<ReplaceJammedSheetScreen stateMachineState="jam_cleared" />);

  screen.getByRole('heading', { name: /jam cleared/i });
  screen.getByText(/please wait/i);
});

test('resetting_state_machine_after_jam  state', () => {
  render(
    <ReplaceJammedSheetScreen stateMachineState="resetting_state_machine_after_jam" />
  );

  screen.getByRole('heading', { name: /jam cleared/i });
  screen.getByText(/please wait/i);
});

test('accepting_paper_after_jam  state', () => {
  render(
    <ReplaceJammedSheetScreen stateMachineState="accepting_paper_after_jam" />
  );

  screen.getByRole('heading', { name: /jam cleared/i });
  screen.getByText(/load a new sheet/i);
});

test('loading_paper_after_jam  state', () => {
  render(
    <ReplaceJammedSheetScreen stateMachineState="loading_paper_after_jam" />
  );

  screen.getByRole('heading', { name: /jam cleared/i });
  screen.getByText(/loading new sheet/i);
});
