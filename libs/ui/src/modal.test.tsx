import { beforeEach, describe, expect, test, vi } from 'vitest';
import React from 'react';
import { userEvent } from './user_event.js';
import {
  fireEvent,
  render,
  screen,
  within,
} from '../test/react_testing_library.js';
import { Modal, ModalWidth } from './modal.js';
import { Button } from './button.js';
import { ReadOnLoad, ReadOnLoadProps } from './ui_strings/read_on_load.js';
import { UiStringsAudioContextProvider } from './ui_strings/audio_context.js';
import {
  UiStringsReactQueryApi,
  createUiStringsApi,
} from './hooks/ui_strings_api.js';
import { FocusableAudio, FocusableAudioProps } from './focusable_audio.js';

vi.mock(import('./ui_strings/read_on_load.js'), async (importActual) => ({
  ...(await importActual()),
  ReadOnLoad: vi.fn(),
}));

const mockReadOnLoad = vi.mocked(ReadOnLoad);
const MOCK_READ_ON_LOAD_TEST_ID = 'mockReadOnLoad';

vi.mock(import('./focusable_audio.js'), async (importActual) => ({
  ...(await importActual()),
  FocusableAudio: vi.fn(),
}));

const mockFocusableAudio = vi.mocked(FocusableAudio<'div'>);
const MOCK_FOCUSABLE_AUDIO_TEST_ID = 'mockFocusableAudio';

beforeEach(() => {
  mockReadOnLoad.mockImplementation((props: ReadOnLoadProps) => (
    <div data-testid={MOCK_READ_ON_LOAD_TEST_ID} {...props} />
  ));

  mockFocusableAudio.mockImplementation((props: FocusableAudioProps<'div'>) => {
    const { as: _unused1, readOnLoad: _unused2, ...rest } = props;
    return <div data-testid={MOCK_FOCUSABLE_AUDIO_TEST_ID} {...rest} />;
  });
});

describe('Modal', () => {
  test('renders a modal with content and actions', () => {
    render(
      <Modal
        title="Are you sure?"
        content={<div>Do you want to do the thing?</div>}
        actions={
          <React.Fragment>
            <Button onPress={() => undefined}>Cancel</Button>
            <Button onPress={() => undefined}>Confirm</Button>
          </React.Fragment>
        }
      />
    );

    const modal = screen.getByRole('alertdialog');
    within(modal).getByRole('heading', { name: 'Are you sure?' });
    within(modal).getByText('Do you want to do the thing?');
    within(modal).getByRole('button', { name: 'Cancel' });
    within(modal).getByRole('button', { name: 'Confirm' });
    expect(modal).toHaveAttribute('aria-label', 'Alert Modal');
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(modal).toHaveFocus();
  });

  test('centers content', () => {
    render(<Modal content="Do you want to do the thing?" centerContent />);

    const modal = screen.getByRole('alertdialog');
    const content = within(modal).getByText('Do you want to do the thing?');
    expect(content).toHaveStyle(`
      align-items: center;
      justify-content: center;
    `);
  });

  test('can configure a wider max width', () => {
    render(
      <Modal
        modalWidth={ModalWidth.Wide}
        content="Do you want to do the thing?"
      />
    );

    const modal = screen.getByRole('alertdialog');
    expect(modal).toMatchSnapshot();
  });

  test('can configure fullscreen', () => {
    render(<Modal fullscreen content="Do you want to do the thing?" />);

    const modal = screen.getByRole('alertdialog');
    expect(modal).toMatchSnapshot();

    const content = within(modal).getByText('Do you want to do the thing?');
    expect(content).not.toHaveStyle({ padding: '2rem' });
  });

  test('handles overlay click', () => {
    const onOverlayClick = vi.fn();
    render(<Modal content="Content" onOverlayClick={onOverlayClick} />);

    userEvent.click(screen.getByText('Content'));
    expect(onOverlayClick).not.toHaveBeenCalled();

    userEvent.click(screen.getByRole('alertdialog'));
    expect(onOverlayClick).toHaveBeenCalledTimes(1);
  });

  test('treats clicks on the dialog box itself as inside', () => {
    const onOverlayClick = vi.fn();
    render(<Modal content="Content" onOverlayClick={onOverlayClick} />);
    const dialog = screen.getByRole('alertdialog');
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 200,
      top: 100,
      bottom: 200,
    } as unknown as DOMRect);

    for (const [clientX, clientY] of [
      [150, 150],
      [150, 50],
      [150, 250],
    ]) {
      fireEvent.mouseDown(dialog, { clientX, clientY });
      fireEvent.click(dialog, { clientX, clientY });
    }
    expect(onOverlayClick).toHaveBeenCalledTimes(2);
  });

  test('ignores overlay click without a handler', () => {
    render(<Modal content="Content" />);
    userEvent.click(screen.getByRole('alertdialog'));
    screen.getByRole('alertdialog');
  });

  test('handles the Escape key', () => {
    const onOverlayClick = vi.fn();
    const onParentKeyDown = vi.fn();
    render(
      <div role="presentation" onKeyDown={onParentKeyDown}>
        <Modal content="Content" onOverlayClick={onOverlayClick} />
      </div>
    );

    userEvent.keyboard('a');
    expect(onParentKeyDown).toHaveBeenCalledTimes(1);

    userEvent.keyboard('{Escape}');
    expect(onOverlayClick).toHaveBeenCalledTimes(1);
    expect(onParentKeyDown).toHaveBeenCalledTimes(1);
  });

  test('ignores the Escape key without a handler', () => {
    render(<Modal content="Content" />);
    userEvent.keyboard('{Escape}');
    screen.getByRole('alertdialog');
  });

  test('stays open when the browser requests to close it', () => {
    render(<Modal content="Content" />);
    const cancelEvent = new Event('cancel', { cancelable: true });
    fireEvent(screen.getByRole('alertdialog'), cancelEvent);
    expect(cancelEvent.defaultPrevented).toEqual(true);
    screen.getByRole('alertdialog');
  });

  test('keeps focus on an already-focused descendant', () => {
    render(
      <Modal
        content="Content"
        actions={
          <React.Fragment>
            <Button onPress={() => undefined} autoFocus>
              Save
            </Button>
            <Button onPress={() => undefined}>Cancel</Button>
          </React.Fragment>
        }
      />
    );

    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute(
      'autofocus'
    );
  });

  test('focuses the dialog when effects are double-invoked in strict mode', () => {
    render(
      <React.StrictMode>
        <Modal
          content="Content"
          actions={<Button onPress={() => undefined}>Save</Button>}
        />
      </React.StrictMode>
    );
    expect(screen.getByRole('alertdialog')).toHaveFocus();
  });

  test('restores focus to the previously focused element on close', () => {
    function TestComponent(): JSX.Element {
      const [isOpen, setIsOpen] = React.useState(false);
      return (
        <React.Fragment>
          <Button onPress={() => setIsOpen(true)}>Open</Button>
          {isOpen && (
            <Modal
              content="Content"
              actions={<Button onPress={() => setIsOpen(false)}>Close</Button>}
            />
          )}
        </React.Fragment>
      );
    }

    render(<TestComponent />);
    userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('alertdialog')).toHaveFocus();

    userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  test('does not restore focus to an element that has been removed', () => {
    function TestComponent(): JSX.Element {
      const [isOpen, setIsOpen] = React.useState(false);
      return (
        <React.Fragment>
          {!isOpen && <Button onPress={() => setIsOpen(true)}>Open</Button>}
          {isOpen && (
            <Modal
              content="Content"
              actions={<Button onPress={() => setIsOpen(false)}>Close</Button>}
            />
          )}
        </React.Fragment>
      );
    }

    render(<TestComponent />);
    userEvent.click(screen.getByRole('button', { name: 'Open' }));
    userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.body).toHaveFocus();
  });

  test('makes content outside the modal inaccessible while open', () => {
    render(<Button onPress={() => undefined}>Outside</Button>);
    screen.getByRole('button', { name: 'Outside' });

    const { unmount } = render(
      <Modal
        content="Content"
        actions={<Button onPress={() => undefined}>Inside</Button>}
      />
    );
    screen.getByRole('button', { name: 'Inside' });
    expect(
      screen.queryByRole('button', { name: 'Outside' })
    ).not.toBeInTheDocument();

    unmount();
    screen.getByRole('button', { name: 'Outside' });
  });
});

test('no automatic screen reader in non-voter-audio context', () => {
  render(
    <Modal
      disableAutoplayAudio
      title={<span>TITLE</span>}
      content={<span>Content!</span>}
    />
  );

  screen.getByText('TITLE');
  screen.getByText('Content!');
  expect(
    screen.queryByTestId(MOCK_READ_ON_LOAD_TEST_ID)
  ).not.toBeInTheDocument();
});

describe('when in voter audio context', () => {
  const mockUiStringsApi: UiStringsReactQueryApi = createUiStringsApi(() => ({
    getAudioClips: vi.fn(),
    getAvailableLanguages: vi.fn(),
    getUiStringAudioIds: vi.fn(),
    getUiStrings: vi.fn(),
  }));

  test('triggers screen reader for title and content by default', () => {
    render(
      <UiStringsAudioContextProvider api={mockUiStringsApi}>
        <Modal
          title={<span>TITLE</span>}
          content={<span>Content!</span>}
          actions={<span>Do not read this</span>}
        />
      </UiStringsAudioContextProvider>
    );

    const readOnLoadElement = screen.getByTestId(MOCK_READ_ON_LOAD_TEST_ID);

    expect(readOnLoadElement).toHaveTextContent(/^TITLE.?Content!$/);

    expect(
      screen.queryByTestId(MOCK_FOCUSABLE_AUDIO_TEST_ID)
    ).not.toBeInTheDocument();
  });

  test("doesn't trigger screen reader when autoplay is disabled", () => {
    render(
      <UiStringsAudioContextProvider api={mockUiStringsApi}>
        <Modal
          disableAutoplayAudio
          title={<span>TITLE</span>}
          content={<span>Content!</span>}
          actions={<span>Do not read this</span>}
        />
      </UiStringsAudioContextProvider>
    );

    expect(
      screen.queryByTestId(MOCK_READ_ON_LOAD_TEST_ID)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(MOCK_FOCUSABLE_AUDIO_TEST_ID)
    ).not.toBeInTheDocument();
    screen.getByText('TITLE');
    screen.getByText('Content!');
  });
});

describe('when focusable audio content is enabled', () => {
  const mockUiStringsApi: UiStringsReactQueryApi = createUiStringsApi(() => ({
    getAudioClips: vi.fn(),
    getAvailableLanguages: vi.fn(),
    getUiStringAudioIds: vi.fn(),
    getUiStrings: vi.fn(),
  }));

  test('renders content in focusable block', () => {
    render(
      <UiStringsAudioContextProvider api={mockUiStringsApi}>
        <Modal
          focusableAudioContent
          title={<span>TITLE</span>}
          content={<span>Content</span>}
          actions={<span>Do not read this</span>}
        />
      </UiStringsAudioContextProvider>
    );

    const readOnLoadElement = screen.getByTestId(MOCK_FOCUSABLE_AUDIO_TEST_ID);
    expect(readOnLoadElement).toHaveTextContent(/^TITLE.?Content$/);

    const props = mockFocusableAudio.mock.lastCall?.[0];
    expect(props).toEqual<FocusableAudioProps<'div'>>(
      expect.objectContaining({
        readOnLoad: true,
      })
    );
  });

  test("doesn't trigger screen reader when autoplay is disabled", () => {
    render(
      <UiStringsAudioContextProvider api={mockUiStringsApi}>
        <Modal
          disableAutoplayAudio
          focusableAudioContent
          title={<span>TITLE</span>}
          content={<span>Content</span>}
          actions={<span>Do not read this</span>}
        />
      </UiStringsAudioContextProvider>
    );

    const readOnLoadElement = screen.getByTestId(MOCK_FOCUSABLE_AUDIO_TEST_ID);
    expect(readOnLoadElement).toHaveTextContent(/^TITLE.?Content$/);

    const props = mockFocusableAudio.mock.lastCall?.[0];
    expect(props).toEqual<FocusableAudioProps<'div'>>(
      expect.objectContaining({
        readOnLoad: false,
      })
    );
  });
});
