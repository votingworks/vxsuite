import React from 'react';
import userEvent from '@testing-library/user-event';
import { mockOf } from '@votingworks/test-utils';
import { render, screen, within } from '../test/react_testing_library';
import { Modal, ModalWidth } from './modal';
import { Button } from './button';
import { fontSizeTheme } from './themes';
import { FONT_SIZES, LARGE_DISPLAY_FONT_SIZE } from './globals';
import { ReadOnLoad, ReadOnLoadProps } from './ui_strings/read_on_load';

jest.mock(
  './ui_strings/read_on_load',
  (): typeof import('./ui_strings/read_on_load') => ({
    ...jest.requireActual('./ui_strings/read_on_load'),
    ReadOnLoad: jest.fn(),
  })
);

const mockReadOnLoad = mockOf(ReadOnLoad);
const MOCK_READ_ON_LOAD_TEST_ID = 'mockReadOnLoad';

beforeEach(() => {
  mockReadOnLoad.mockImplementation((props: ReadOnLoadProps) => (
    <div data-testid={MOCK_READ_ON_LOAD_TEST_ID} {...props} />
  ));
});

describe('Modal', () => {
  it('renders a modal with content and actions', () => {
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

  it('centers content', () => {
    render(<Modal content="Do you want to do the thing?" centerContent />);

    const modal = screen.getByRole('alertdialog');
    const content = within(modal).getByText('Do you want to do the thing?');
    expect(content).toHaveStyle(`
      align-items: inherit;
      justify-content: inherit;
    `);
    expect(content.parentElement).toHaveStyle(`
      align-items: center;
      justify-content: center;
    `);
  });

  it('can configure a wider max width', () => {
    render(
      <Modal
        modalWidth={ModalWidth.Wide}
        content="Do you want to do the thing?"
      />
    );

    const modal = screen.getByRole('alertdialog');
    expect(modal).toMatchSnapshot();
  });

  it('can configure fullscreen', () => {
    render(<Modal fullscreen content="Do you want to do the thing?" />);

    const modal = screen.getByRole('alertdialog');
    expect(modal).toMatchSnapshot();

    const content = within(modal).getByText('Do you want to do the thing?');
    expect(content).not.toHaveStyle({ padding: '2rem' });
  });

  it('can use theme', () => {
    render(
      <Modal
        themeDeprecated={fontSizeTheme.large}
        content="Do you want to do the thing?"
      />
    );

    const modal = screen.getByRole('alertdialog');
    expect(modal).toHaveStyle({
      fontSize: `${FONT_SIZES[LARGE_DISPLAY_FONT_SIZE]}px`,
    });
  });

  it('handles overlay click', () => {
    const onOverlayClick = jest.fn();
    const { baseElement } = render(
      <Modal content="Content" onOverlayClick={onOverlayClick} />
    );
    userEvent.click(
      baseElement.getElementsByClassName('ReactModal__Overlay')[0]
    );
    expect(onOverlayClick).toHaveBeenCalledTimes(1);
  });

  it('handles after open', () => {
    // Work around a react-modal bug: https://github.com/reactjs/react-modal/issues/903
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(1);
      return 1;
    });
    const onAfterOpen = jest.fn();
    render(<Modal content="Content" onAfterOpen={onAfterOpen} />);
    expect(onAfterOpen).toHaveBeenCalledTimes(1);
    (window.requestAnimationFrame as jest.Mock).mockRestore();
  });
});

it('triggers screen reader for title and content by default', () => {
  render(
    <Modal
      title={<span>TITLE</span>}
      content={<span>Content!</span>}
      actions={<span>Do not read this</span>}
    />
  );

  const readOnLoadElement = screen.getByTestId(MOCK_READ_ON_LOAD_TEST_ID);

  expect(readOnLoadElement).toHaveTextContent(/^TITLE.?Content!$/);
});

it("doesn't trigger screen reader when autoplay is disabled", () => {
  render(
    <Modal
      disableAutoplayAudio
      title={<span>TITLE</span>}
      content={<span>Content!</span>}
      actions={<span>Do not read this</span>}
    />
  );

  expect(
    screen.queryByTestId(MOCK_READ_ON_LOAD_TEST_ID)
  ).not.toBeInTheDocument();
  screen.getByText('TITLE');
  screen.getByText('Content!');
});
