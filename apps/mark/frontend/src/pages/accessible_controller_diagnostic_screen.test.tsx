import { beforeEach, describe, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { DateTime } from 'luxon';
import { mockUseAudioControls } from '@votingworks/test-utils';
import { Keybinding, ReadOnLoad } from '@votingworks/ui';
import { render, screen, within } from '../../test/react_testing_library';
import {
  AccessibleControllerDiagnosticScreen,
  AccessibleControllerDiagnosticProps,
} from './accessible_controller_diagnostic_screen';

const mockAudioControls = mockUseAudioControls(vi.fn);

vi.mock(import('@votingworks/ui'), async (importActual) => ({
  ...(await importActual()),
  ReadOnLoad: vi.fn(),
  useAudioControls: () => mockAudioControls,
}));

const now = DateTime.fromISO('2022-03-23T11:23:00.000Z');

function renderScreen(
  props: Partial<AccessibleControllerDiagnosticProps> = {}
) {
  return render(
    <AccessibleControllerDiagnosticScreen
      onComplete={vi.fn()}
      onCancel={vi.fn()}
      {...props}
    />
  );
}

const MOCK_READ_ON_LOAD_TEST_ID = 'mockReadOnLoad';

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
  });
  vi.mocked(ReadOnLoad).mockImplementation((props) => (
    <div data-testid={MOCK_READ_ON_LOAD_TEST_ID} {...props} />
  ));
});

describe('Accessible Controller Diagnostic Screen', () => {
  beforeEach(() => {
    const date = new Date(now.toISO());
    vi.setSystemTime(date);
  });

  test('yields a success result when all steps are completed', async () => {
    const onComplete = vi.fn();
    renderScreen({ onComplete });

    screen.getByText('Accessible Controller Test');

    function expectToHaveIllustrationHighlight(
      highlightTestId: string,
      hasHeadphones?: boolean
    ) {
      const illustration = screen
        .getByTitle('Accessible Controller Illustration')
        .closest('svg') as unknown as HTMLElement;
      const path = within(illustration).getByTestId(highlightTestId);
      expect(path).toHaveAttribute('fill', '#985aa3');
      if (!hasHeadphones) {
        expect(
          within(illustration).queryByTestId('headphones')
        ).not.toBeInTheDocument();
      }
    }

    screen.getByText(/Step 1 of 6/);
    screen.getByText('Press the up button.');
    expectToHaveIllustrationHighlight('up-button');
    // Try out pressing an incorrect button to make sure we actually detect the
    // right button.
    userEvent.keyboard(`{${Keybinding.FOCUS_NEXT}}`);
    screen.getByText(/Step 1 of 6/);
    // Then press the up button.
    // We have to wrap key presses in act to avoid a warning. This may be due to
    // the fact that the keyDown listener is attached to the document instead of
    // a React component.
    userEvent.keyboard(`{${Keybinding.FOCUS_PREVIOUS}}`);

    await screen.findByText(/Step 2 of 6/);
    screen.getByText('Press the down button.');
    expectToHaveIllustrationHighlight('down-button');
    userEvent.keyboard(`{${Keybinding.FOCUS_NEXT}}`);

    await screen.findByText(/Step 3 of 6/);
    screen.getByText('Press the left button.');
    expectToHaveIllustrationHighlight('left-button');
    userEvent.keyboard(`{${Keybinding.PAGE_PREVIOUS}}`);

    await screen.findByText(/Step 4 of 6/);
    screen.getByText('Press the right button.');
    expectToHaveIllustrationHighlight('right-button');
    userEvent.keyboard(`{${Keybinding.PAGE_NEXT}}`);

    await screen.findByText(/Step 5 of 6/);
    screen.getByText('Press the select button.');
    expectToHaveIllustrationHighlight('select-button');
    userEvent.keyboard(`{${Keybinding.SELECT}}`);

    await screen.findByText(/Step 6 of 6/);
    screen.getByText('Confirm sound is working.');
    expectToHaveIllustrationHighlight('right-button', true);
    expectToHaveIllustrationHighlight('headphones', true);
    // Try pressing the select button before playing sound to make sure it
    // doesn't work
    userEvent.keyboard(`{${Keybinding.SELECT}}`);
    expect(onComplete).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId(MOCK_READ_ON_LOAD_TEST_ID)
    ).not.toBeInTheDocument();

    // Then play sound and confirm
    userEvent.keyboard(`{${Keybinding.PAGE_NEXT}}`);
    expect(mockAudioControls.setIsEnabled).toHaveBeenCalledTimes(1);
    expect(mockAudioControls.setIsEnabled).toHaveBeenCalledWith(true);
    expect(screen.getByTestId(MOCK_READ_ON_LOAD_TEST_ID)).toHaveTextContent(
      'Press the select button to confirm sound is working.'
    );

    userEvent.keyboard(`{${Keybinding.SELECT}}`);

    // Get a new time for `completedAt` rather than using `now` because the test
    // has progressed since the initial render and the `vi.waitFor` calls
    // advance the time.
    const completedAt = DateTime.now();

    expect(onComplete).toHaveBeenCalledWith({
      passed: true,
      completedAt,
    });
  });

  async function passUntilStep(step: number) {
    if (step === 1) return;
    screen.getByText(/Step 1 of 6/);
    userEvent.keyboard(`{${Keybinding.FOCUS_PREVIOUS}}`);

    if (step === 2) return;
    await screen.findByText(/Step 2 of 6/);
    userEvent.keyboard(`{${Keybinding.FOCUS_NEXT}}`);

    if (step === 3) return;
    await screen.findByText(/Step 3 of 6/);
    userEvent.keyboard(`{${Keybinding.PAGE_PREVIOUS}}`);

    if (step === 4) return;
    await screen.findByText(/Step 4 of 6/);
    userEvent.keyboard(`{${Keybinding.PAGE_NEXT}}`);

    if (step === 5) return;
    await screen.findByText(/Step 5 of 6/);
    userEvent.keyboard(`{${Keybinding.SELECT}}`);

    if (step === 6) return;
    throw new Error('Step must be between 1 and 6');
  }

  test.each([
    { button: 'Up', index: 0 },
    { button: 'Down', index: 1 },
    { button: 'Left', index: 2 },
    { button: 'Right', index: 3 },
    { button: 'Select', index: 4 },
  ])(
    'yields a failure result when $button is not working',
    async ({ button, index }) => {
      const onComplete = vi.fn();
      renderScreen({ onComplete });

      await passUntilStep(index + 1);

      // Get a new time for `completedAt` rather than using `now` because the test
      // has progressed since the initial render and the `vi.waitFor` calls
      // advance the time.
      const completedAt = DateTime.now();

      userEvent.click(
        screen.getByRole('button', { name: `${button} Button is Not Working` })
      );

      expect(onComplete).toHaveBeenCalledWith({
        passed: false,
        completedAt,
        message: `${button} button is not working.`,
      });
    }
  );

  test('yields a failure result when sound is not working', async () => {
    const onComplete = vi.fn();
    renderScreen({ onComplete });

    await passUntilStep(6);

    // Get a new time for `completedAt` rather than using `now` because the test
    // has progressed since the initial render and the `vi.waitFor` calls
    // advance the time.
    const completedAt = DateTime.now();

    userEvent.click(
      screen.getByRole('button', { name: `Sound is Not Working` })
    );

    expect(onComplete).toHaveBeenCalledWith({
      passed: false,
      completedAt,
      message: `Sound is not working.`,
    });
  });

  test('cancels the test when the cancel button is pressed', () => {
    const onCancel = vi.fn();
    const onComplete = vi.fn();
    renderScreen({ onCancel, onComplete });

    userEvent.click(screen.getByRole('button', { name: 'Cancel Test' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('renders with default screen reader', async () => {
    render(
      <AccessibleControllerDiagnosticScreen
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await passUntilStep(6);
  });
});
