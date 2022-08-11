import { assert } from '@votingworks/utils';
import React, { ReactNode } from 'react';
import ReactModal from 'react-modal';
import styled from 'styled-components';

import { Theme } from './themes';
import { ButtonBar } from './button_bar';

/**
 * Controls the maximum width the modal can expand to.
 */
export enum ModalWidth {
  Standard = '30rem',
  Wide = '55rem',
}

interface ReactModalContentInterface {
  fullscreen?: boolean;
  modalWidth?: ModalWidth;
  theme?: Theme;
}
const ReactModalContent = styled('div')<ReactModalContentInterface>`
  display: flex;
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
  font-size: ${({ theme }) => theme.fontSize};
  -webkit-overflow-scrolling: touch;
  @media (min-width: 480px) {
    position: static;
    border-radius: ${({ fullscreen }) => (fullscreen ? '0' : '0.25rem')};
    max-width: ${({ fullscreen, modalWidth = ModalWidth.Standard }) =>
      fullscreen ? '100%' : modalWidth};
    height: ${({ fullscreen }) => (fullscreen ? '100%' : 'auto')};
  }
  @media print {
    display: none;
  }
`;

interface ReactModalOverlayInterface {
  fullscreen?: boolean;
}
const ReactModalOverlay = styled('div')<ReactModalOverlayInterface>`
  display: flex;
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 999; /* Should be above all default UI */
  background: rgba(0, 0, 0, 0.75);
  @media (min-width: 480px) {
    padding: ${({ fullscreen }) => (fullscreen ? '0' : '0.5rem')};
  }
  @media print {
    display: none;
  }
`;

interface ModalContentInterface {
  centerContent?: boolean;
  fullscreen?: boolean;
}

const ModalContent = styled('div')<ModalContentInterface>`
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: ${({ centerContent = false }) =>
    centerContent ? 'center' : undefined};
  justify-content: ${({ centerContent = false }) =>
    centerContent ? 'center' : undefined};
  overflow: auto;
  padding: ${({ fullscreen }) => !fullscreen && '2rem'};
`;

interface Props {
  ariaLabel?: string;
  // If a Modal is created and destroyed too quickly it can screw up the aria
  // focus elements. In that case use ariaHideApp=true to disable the default
  // focusing behavior on the Modal. See https://github.com/votingworks/vxsuite/issues/988
  ariaHideApp?: boolean;
  content?: ReactNode;
  centerContent?: boolean;
  /**
   * Modal actions go here, most likely buttons. The primary action (such as
   * "Save") should be first under a fragment, and the secondary actions (such
   * as "Cancel") should be after that in the order they should be presented
   * from left to right.
   *
   * This ordering is primarily for accessibility. The primary action being
   * first makes it the easiest one to activate when using an accessible
   * controller. The first secondary action is likely a cancellation or
   * dismissal action and is still common, albeit less than the primary
   * action. Further actions are likely a variation on the primary action
   * (such as "Save As") and are less common.
   */
  actions?: ReactNode;
  onAfterOpen?: () => void;
  onOverlayClick?: () => void;
  fullscreen?: boolean;
  modalWidth?: ModalWidth;
  theme?: Theme;
}

/* istanbul ignore next - unclear why this isn't covered */
function focusModalAudio() {
  window.setTimeout(() => {
    const element = document.getElementById('modalaudiofocus');
    if (element) {
      element.focus();
      element.click();
    }
  }, 10);
}

export function Modal({
  actions,
  ariaLabel = 'Alert Modal',
  centerContent,
  content,
  fullscreen = false,
  ariaHideApp = true,
  onAfterOpen = focusModalAudio,
  onOverlayClick,
  modalWidth,
  theme,
}: Props): JSX.Element {
  /* istanbul ignore next - can't get document.getElementById working in test */
  const appElement =
    document.getElementById('root') ??
    (document.body.firstElementChild as HTMLElement);
  assert(appElement);
  return (
    <ReactModal
      appElement={appElement}
      ariaHideApp={ariaHideApp}
      aria-modal
      role="alertdialog"
      isOpen
      contentLabel={ariaLabel}
      onAfterOpen={onAfterOpen}
      onRequestClose={onOverlayClick}
      testId="modal"
      contentElement={(props, children) => (
        <ReactModalContent
          modalWidth={modalWidth}
          fullscreen={fullscreen}
          theme={theme}
          {...props}
        >
          {children}
        </ReactModalContent>
      )}
      overlayElement={(props, contentElement) => (
        <ReactModalOverlay fullscreen={fullscreen} {...props}>
          {contentElement}
        </ReactModalOverlay>
      )}
      // className properties are required to prevent react-modal
      // from overriding the styles defined in contentElement and overlayElement
      className="_"
      overlayClassName="_"
    >
      <ModalContent centerContent={centerContent} fullscreen={fullscreen}>
        {content}
      </ModalContent>
      {actions && <ButtonBar as="div">{actions}</ButtonBar>}
    </ReactModal>
  );
}
