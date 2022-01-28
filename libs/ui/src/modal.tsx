import { assert } from '@votingworks/utils';
import React, { ReactNode } from 'react';
import ReactModal from 'react-modal';
import styled from 'styled-components';

import { ButtonBar } from './button_bar';

const ReactModalContent = styled.div`
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
  -webkit-overflow-scrolling: touch;
  @media (min-width: 480px) {
    position: static;
    border-radius: 0.25rem;
    max-width: 30rem;
  }
  @media print {
    display: none;
  }
`;

const ReactModalOverlay = styled.div`
  display: flex;
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 999; /* Should be above all default UI */
  background: rgba(0, 0, 0, 0.75);
  @media (min-width: 480px) {
    padding: 0.5rem;
  }
  @media print {
    display: none;
  }
`;

interface ModalContentInterface {
  centerContent?: boolean;
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
  padding: 2rem;
`;

interface Props {
  ariaLabel?: string;
  ariaHideApp?: boolean;
  content?: ReactNode;
  centerContent?: boolean;
  actions?: ReactNode;
  onAfterOpen?: () => void;
  onOverlayClick?: () => void;
}

export function Modal({
  actions,
  ariaLabel = 'Alert Modal',
  centerContent,
  content,
  ariaHideApp = true,

  onAfterOpen = () => {
    /* istanbul ignore next - unclear why this isn't covered */
    window.setTimeout(() => {
      const element = document.getElementById('modalaudiofocus');
      if (element) {
        element.focus();
        element.click();
      }
    }, 10);
  },
  onOverlayClick,
}: Props): JSX.Element {
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
        <ReactModalContent {...props}>{children}</ReactModalContent>
      )}
      overlayElement={(props, contentElement) => (
        <ReactModalOverlay {...props}>{contentElement}</ReactModalOverlay>
      )}
      // className properties are required to prevent react-modal
      // from overriding the styles defined in contentElement and overlayElement
      className="_"
      overlayClassName="_"
    >
      <ModalContent centerContent={centerContent}>{content}</ModalContent>
      {actions && <ButtonBar as="div">{actions}</ButtonBar>}
    </ReactModal>
  );
}
