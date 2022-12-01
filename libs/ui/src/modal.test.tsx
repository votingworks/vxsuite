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
