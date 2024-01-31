import userEvent from '@testing-library/user-event';
import { DateTime } from 'luxon';
import { fakeUseAudioControls, mockOf } from '@votingworks/test-utils';
import { ReadOnLoad } from '@votingworks/ui';
import { render, screen, within } from '../../test/react_testing_library';
import {
  AccessibleControllerDiagnosticScreen,
  AccessibleControllerDiagnosticProps,
} from './accessible_controller_diagnostic_screen';

const mockAudioControls = fakeUseAudioControls();

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => ({
  ...jest.requireActual('@votingworks/ui'),
  ReadOnLoad: jest.fn(),
  useAudioControls: () => mockAudioControls,
}));

const now = DateTime.fromISO('2022-03-23T11:23:00.000Z');

function renderScreen(
  props: Partial<AccessibleControllerDiagnosticProps> = {}
) {
  return render(
    <AccessibleControllerDiagnosticScreen
      onComplete={jest.fn()}
      onCancel={jest.fn()}
      {...props}
    />
  );
}

const MOCK_READ_ON_LOAD_TEST_ID = 'mockReadOnLoad';

beforeEach(() => {
  mockOf(ReadOnLoad).mockImplementation((props) => (
    <div data-testid={MOCK_READ_ON_LOAD_TEST_ID} {...props} />
  ));
});

describe('Accessible Controller Diagnostic Screen', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(now.toISO()));
  });

  it('yields a success result when all steps are completed', async () => {
    const onComplete = jest.fn();
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
    userEvent.keyboard('{ArrowDown}');
    screen.getByText(/Step 1 of 6/);
    // Then press the up button.
    // We have to wrap key presses in act to avoid a warning. This may be due to
    // the fact that the keyDown listener is attached to the document instead of
    // a React component.
    userEvent.keyboard('{ArrowUp}');

    await screen.findByText(/Step 2 of 6/);
    screen.getByText('Press the down button.');
    expectToHaveIllustrationHighlight('down-button');
    userEvent.keyboard('{ArrowDown}');

    await screen.findByText(/Step 3 of 6/);
    screen.getByText('Press the left button.');
    expectToHaveIllustrationHighlight('left-button');
    userEvent.keyboard('{ArrowLeft}');

    await screen.findByText(/Step 4 of 6/);
    screen.getByText('Press the right button.');
    expectToHaveIllustrationHighlight('right-button');
    userEvent.keyboard('{ArrowRight}');

    await screen.findByText(/Step 5 of 6/);
    screen.getByText('Press the select button.');
    expectToHaveIllustrationHighlight('select-button');
    userEvent.keyboard('{Enter}');

    await screen.findByText(/Step 6 of 6/);
    screen.getByText('Confirm sound is working.');
    expectToHaveIllustrationHighlight('right-button', true);
    expectToHaveIllustrationHighlight('headphones', true);
    // Try pressing the select button before playing sound to make sure it
    // doesn't work
    userEvent.keyboard('{Enter}');
    expect(onComplete).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId(MOCK_READ_ON_LOAD_TEST_ID)
    ).not.toBeInTheDocument();

    // Then play sound and confirm
    userEvent.keyboard('{ArrowRight}');
    expect(mockAudioControls.setIsEnabled).toHaveBeenCalledTimes(1);
    expect(mockAudioControls.setIsEnabled).toHaveBeenCalledWith(true);
    expect(screen.getByTestId(MOCK_READ_ON_LOAD_TEST_ID)).toHaveTextContent(
      'Press the select button to confirm sound is working.'
    );

    userEvent.keyboard('{Enter}');

    expect(onComplete).toHaveBeenCalledWith({
      passed: true,
      completedAt: now,
    });
  });

  async function passUntilStep(step: number) {
    if (step === 1) return;
    screen.getByText(/Step 1 of 6/);
    userEvent.keyboard('{ArrowUp}');

    if (step === 2) return;
    await screen.findByText(/Step 2 of 6/);
    userEvent.keyboard('{ArrowDown}');

    if (step === 3) return;
    await screen.findByText(/Step 3 of 6/);
    userEvent.keyboard('{ArrowLeft}');

    if (step === 4) return;
    await screen.findByText(/Step 4 of 6/);
    userEvent.keyboard('{ArrowRight}');

    if (step === 5) return;
    await screen.findByText(/Step 5 of 6/);
    userEvent.keyboard('{Enter}');

    if (step === 6) return;
    throw new Error('Step must be between 1 and 6');
  }

  const buttons = ['Up', 'Down', 'Left', 'Right', 'Select'];
  for (const [index, button] of buttons.entries()) {
    it(`yields a failure result when ${button} button is not working`, async () => {
      const onComplete = jest.fn();
      renderScreen({ onComplete });

      await passUntilStep(index + 1);
      userEvent.click(
        screen.getByRole('button', { name: `${button} Button is Not Working` })
      );

      expect(onComplete).toHaveBeenCalledWith({
        passed: false,
        completedAt: now,
        message: `${button} button is not working.`,
      });
    });
  }

  it('yields a failure result when sound is not working', async () => {
    const onComplete = jest.fn();
    renderScreen({ onComplete });

    await passUntilStep(6);
    userEvent.click(
      screen.getByRole('button', { name: `Sound is Not Working` })
    );

    expect(onComplete).toHaveBeenCalledWith({
      passed: false,
      completedAt: now,
      message: `Sound is not working.`,
    });
  });

  it('cancels the test when the cancel button is pressed', () => {
    const onCancel = jest.fn();
    const onComplete = jest.fn();
    renderScreen({ onCancel, onComplete });

    userEvent.click(screen.getByRole('button', { name: 'Cancel Test' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('renders with default screen reader', async () => {
    render(
      <AccessibleControllerDiagnosticScreen
        onComplete={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    await passUntilStep(6);
  });
});
