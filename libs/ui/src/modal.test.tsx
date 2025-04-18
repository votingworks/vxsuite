import { beforeEach, describe, expect, test, vi } from 'vitest';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen, within } from '../test/react_testing_library';
import { Modal, ModalWidth } from './modal';
import { Button } from './button';
import { ReadOnLoad, ReadOnLoadProps } from './ui_strings/read_on_load';
import { UiStringsAudioContextProvider } from './ui_strings/audio_context';
import {
  UiStringsReactQueryApi,
  createUiStringsApi,
} from './hooks/ui_strings_api';

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
    const { baseElement } = render(
      <Modal content="Content" onOverlayClick={onOverlayClick} />
    );
    userEvent.click(
      baseElement.getElementsByClassName('ReactModal__Overlay')[0]
    );
    expect(onOverlayClick).toHaveBeenCalledTimes(1);
  });

  test('handles after open', () => {
    // Work around a react-modal bug: https://github.com/reactjs/react-modal/issues/903
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (cb: FrameRequestCallback) => {
        cb(1);
        return 1;
      }
    );
    const onAfterOpen = vi.fn();
    render(<Modal content="Content" onAfterOpen={onAfterOpen} />);
    expect(onAfterOpen).toHaveBeenCalledTimes(1);
    vi.mocked(window.requestAnimationFrame).mockRestore();
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
    screen.getByText('TITLE');
    screen.getByText('Content!');
  });
});

test('aria-hidden is set and cleared properly', () => {
  // ensure there is a root element
  render(<div id="test-root" />);

  const root = document.body.firstElementChild;

  const { unmount, rerender } = render(
    <div>
      <Modal
        title={<span>TITLE</span>}
        content={<span>Content!</span>}
        actions={<span>Do not read this</span>}
      />
    </div>
  );

  expect(root).toHaveAttribute('aria-hidden', 'true');

  // cause the `appElement` to change if it's not cached
  rerender(
    <div>
      <Modal
        title={<span>TITLE</span>}
        content={<span>Content!</span>}
        actions={<span>Do not read this</span>}
      />
    </div>
  );

  // unmount should clear the aria-hidden attribute
  unmount();
  expect(root).not.toHaveAttribute('aria-hidden');
});
