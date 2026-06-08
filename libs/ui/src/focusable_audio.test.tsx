import { beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { fireEvent, render, screen } from '../test/react_testing_library.js';
import { FocusableAudio, FOCUSABLE_AUDIO_CLASS_NAME } from './focusable_audio';
import { ReadOnLoad, ReadOnLoadProps } from './ui_strings/read_on_load';

vi.mock(import('./ui_strings/read_on_load.js'), async (importActual) => ({
  ...(await importActual()),
  ReadOnLoad: vi.fn(),
}));

const mockReadOnLoad = vi.mocked(ReadOnLoad);
const MOCK_READ_ON_LOAD_TEST_ID = 'mockReadOnLoad';

beforeEach(() => {
  mockReadOnLoad.mockImplementation((props: ReadOnLoadProps) => (
    <div data-testid={MOCK_READ_ON_LOAD_TEST_ID} {...props} />
  ));
});

test('renders with <ReadOnLoad> when `readOnLoad === true`', () => {
  render(<FocusableAudio readOnLoad>some audio content</FocusableAudio>);

  const readOnLoadContainer = screen.getByTestId(MOCK_READ_ON_LOAD_TEST_ID);
  expect(readOnLoadContainer).toHaveTextContent('some audio content');
  expect(readOnLoadContainer).toHaveAttribute('tabindex', '0');
});

test('renders without <ReadOnLoad> when `readOnLoad === false`', () => {
  render(<FocusableAudio>some audio content</FocusableAudio>);

  const container = screen.getByText('some audio content');
  expect(container).toHaveAttribute('tabindex', '0');

  const readOnLoadContainer = screen.queryByTestId(MOCK_READ_ON_LOAD_TEST_ID);
  expect(readOnLoadContainer).not.toBeInTheDocument();
});

test('suppresses the focus outline by default', () => {
  render(<FocusableAudio>some audio content</FocusableAudio>);

  expect(screen.getByText('some audio content')).toHaveStyle({
    outline: 'none',
  });
});

test('shows the focus outline when `showFocusIndicator` is set', () => {
  render(
    <FocusableAudio showFocusIndicator style={{ color: 'red' }}>
      some audio content
    </FocusableAudio>
  );

  const container = screen.getByText('some audio content');
  expect(container).not.toHaveStyle({ outline: 'none' });
  // Caller-provided styles are preserved.
  expect(container).toHaveStyle({ color: 'red' });
});

function trackBlockFocusTargets(block: Element): EventTarget[] {
  const focusTargets: EventTarget[] = [];
  block.addEventListener(
    'focus',
    (event) => {
      if (event.target) {
        focusTargets.push(event.target);
      }
    },
    { capture: true }
  );
  return focusTargets;
}

test('suppresses the outline during the read-on-load focus, then enables it', () => {
  render(
    <FocusableAudio readOnLoad showFocusIndicator>
      some audio content
    </FocusableAudio>
  );

  // The block grabs focus on mount to read its audio; the outline is suppressed
  // for that initial focus so it doesn't flash on page load.
  const container = screen.getByTestId(MOCK_READ_ON_LOAD_TEST_ID);
  expect(container).toHaveStyle({ outline: 'none' });

  // Once focus leaves the block, subsequent (user-driven) focus shows the
  // indicator.
  fireEvent.blur(container);
  expect(container).not.toHaveStyle({ outline: 'none' });
});

test('replays the whole block on click when `replayOnClick` is set', () => {
  render(
    <FocusableAudio replayOnClick>
      <button type="button">child</button>
    </FocusableAudio>
  );

  const block = document.querySelector(`.${FOCUSABLE_AUDIO_CLASS_NAME}`)!;
  const focusTargets = trackBlockFocusTargets(block);

  // Clicking a descendant re-targets a focus event at the block itself, so the
  // screen reader reads the whole block rather than just the clicked element.
  userEvent.click(screen.getButton('child'));
  expect(focusTargets).toContain(block);
});

test('does not re-target focus on click without `replayOnClick`', () => {
  render(
    <FocusableAudio>
      <button type="button">child</button>
    </FocusableAudio>
  );

  const block = document.querySelector(`.${FOCUSABLE_AUDIO_CLASS_NAME}`)!;
  const focusTargets = trackBlockFocusTargets(block);

  userEvent.click(screen.getButton('child'));
  expect(focusTargets).not.toContain(block);
});
