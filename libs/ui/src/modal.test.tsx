import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal, ModalWidth } from './modal';
import { Button } from './button';
import { fontSizeTheme } from './themes';
import { FONT_SIZES, LARGE_DISPLAY_FONT_SIZE } from './globals';

describe('Modal', () => {
  it('renders a modal with content and actions', () => {
    render(
      <Modal
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
    expect(modal).toMatchInlineSnapshot(`
      .c0 {
        display: -webkit-box;
        display: -webkit-flex;
        display: -ms-flexbox;
        display: flex;
        -webkit-flex-direction: column;
        -ms-flex-direction: column;
        flex-direction: column;
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        margin: auto;
        outline: none;
        background: #ffffff;
        width: 100%;
        overflow: auto;
        -webkit-overflow-scrolling: touch;
      }

      .c1 {
        display: -webkit-box;
        display: -webkit-flex;
        display: -ms-flexbox;
        display: flex;
        -webkit-flex: 1;
        -ms-flex: 1;
        flex: 1;
        -webkit-flex-direction: column;
        -ms-flex-direction: column;
        flex-direction: column;
        -webkit-align-items: center;
        -webkit-box-align: center;
        -ms-flex-align: center;
        align-items: center;
        -webkit-box-pack: center;
        -webkit-justify-content: center;
        -ms-flex-pack: center;
        justify-content: center;
        overflow: auto;
        padding: 2rem;
      }

      @media (min-width:480px) {
        .c0 {
          position: static;
          border-radius: 0.25rem;
          max-width: 30rem;
          height: auto;
        }
      }

      @media print {
        .c0 {
          display: none;
        }
      }

      @media (min-width:480px) {

      }

      @media print {

      }

      <div
        aria-label="Alert Modal"
        aria-modal="true"
        class="c0 ReactModal__Content _"
        data-testid="modal"
        role="alertdialog"
        tabindex="-1"
      >
        <div
          class="c1"
        >
          Do you want to do the thing?
        </div>
      </div>
    `);
    const content = within(modal).getByText('Do you want to do the thing?');
    expect(content).toHaveStyle(`
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
    expect(modal).toMatchInlineSnapshot(`
      .c0 {
        display: -webkit-box;
        display: -webkit-flex;
        display: -ms-flexbox;
        display: flex;
        -webkit-flex-direction: column;
        -ms-flex-direction: column;
        flex-direction: column;
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        margin: auto;
        outline: none;
        background: #ffffff;
        width: 100%;
        overflow: auto;
        -webkit-overflow-scrolling: touch;
      }

      .c1 {
        display: -webkit-box;
        display: -webkit-flex;
        display: -ms-flexbox;
        display: flex;
        -webkit-flex: 1;
        -ms-flex: 1;
        flex: 1;
        -webkit-flex-direction: column;
        -ms-flex-direction: column;
        flex-direction: column;
        overflow: auto;
        padding: 2rem;
      }

      @media (min-width:480px) {
        .c0 {
          position: static;
          border-radius: 0.25rem;
          max-width: 55rem;
          height: auto;
        }
      }

      @media print {
        .c0 {
          display: none;
        }
      }

      @media (min-width:480px) {

      }

      @media print {

      }

      <div
        aria-label="Alert Modal"
        aria-modal="true"
        class="c0 ReactModal__Content _"
        data-testid="modal"
        role="alertdialog"
        tabindex="-1"
      >
        <div
          class="c1"
        >
          Do you want to do the thing?
        </div>
      </div>
    `);
  });

  it('can configure fullscreen', () => {
    render(<Modal fullscreen content="Do you want to do the thing?" />);

    const modal = screen.getByRole('alertdialog');
    expect(modal).toMatchInlineSnapshot(`
      .c0 {
        display: -webkit-box;
        display: -webkit-flex;
        display: -ms-flexbox;
        display: flex;
        -webkit-flex-direction: column;
        -ms-flex-direction: column;
        flex-direction: column;
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        margin: auto;
        outline: none;
        background: #ffffff;
        width: 100%;
        overflow: auto;
        -webkit-overflow-scrolling: touch;
      }

      .c1 {
        display: -webkit-box;
        display: -webkit-flex;
        display: -ms-flexbox;
        display: flex;
        -webkit-flex: 1;
        -ms-flex: 1;
        flex: 1;
        -webkit-flex-direction: column;
        -ms-flex-direction: column;
        flex-direction: column;
        overflow: auto;
      }

      @media (min-width:480px) {
        .c0 {
          position: static;
          border-radius: 0;
          max-width: 100%;
          height: 100%;
        }
      }

      @media print {
        .c0 {
          display: none;
        }
      }

      @media (min-width:480px) {

      }

      @media print {

      }

      <div
        aria-label="Alert Modal"
        aria-modal="true"
        class="c0 ReactModal__Content _"
        data-testid="modal"
        role="alertdialog"
        tabindex="-1"
      >
        <div
          class="c1"
        >
          Do you want to do the thing?
        </div>
      </div>
    `);

    const content = within(modal).getByText('Do you want to do the thing?');
    expect(content).not.toHaveStyle({ padding: '2rem' });
  });

  it('can use theme', () => {
    render(
      <Modal
        theme={fontSizeTheme.large}
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
