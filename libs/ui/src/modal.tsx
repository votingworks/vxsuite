import React, { ReactNode } from 'react';
import ReactModal from 'react-modal';
import styled from 'styled-components';
import { rgba } from 'polished';

import { assert } from '@votingworks/basics';

import { Theme } from './themes';
import { ButtonBar } from './button_bar';
import { H2 } from './typography';
import { ReadOnLoad } from './ui_strings/read_on_load';

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
  themeDeprecated?: Theme;
}
const ReactModalContent = styled('div')<ReactModalContentInterface>`
  display: flex;
  flex-direction: column;
  position: absolute;
  inset: 0;
  margin: auto;
  outline: none;
  background: ${(p) => p.theme.colors.background};
  width: 100%;
  max-height: 100%;
  overflow: auto;
  font-size: ${({ themeDeprecated }) => themeDeprecated?.fontSize};
  -webkit-overflow-scrolling: touch;

  @media (min-width: 480px) {
    position: static;
    border-radius: ${({ fullscreen }) => (fullscreen ? '0' : '0.5rem')};
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
  inset: 0;
  z-index: 999; /* Should be above all default UI */
  background: ${(p) => rgba(p.theme.colors.inverseBackground, 0.9)};

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
  padding: ${({ fullscreen }) => !fullscreen && '1rem'};
`;

const ReadOnOpen = styled(ReadOnLoad)`
  align-items: inherit;
  display: flex;
  flex-direction: column;
  justify-content: inherit;
`;

/** Props for {@link Modal}. */
export interface ModalProps {
  ariaLabel?: string;
  // If a Modal is created and destroyed too quickly it can screw up the aria
  // focus elements. In that case use ariaHideApp=true to disable the default
  // focusing behavior on the Modal. See https://github.com/votingworks/vxsuite/issues/988
  ariaHideApp?: boolean;
  content?: ReactNode;
  centerContent?: boolean;
  /**
   * Disables automatic audio readout of the modal title and content on open.
   *
   * Useful if only a portion of the modal content needs to be read out. Clients
   * can manually mark the appropriate content with {@link ReadOnLoad} in that
   * case.
   */
  disableAutoplayAudio?: boolean;
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
  onAfterClose?: () => void;
  onOverlayClick?: () => void;
  fullscreen?: boolean;
  modalWidth?: ModalWidth;
  themeDeprecated?: Theme;
  title?: ReactNode;
}

export function Modal({
  actions,
  ariaLabel = 'Alert Modal',
  centerContent,
  content,
  disableAutoplayAudio,
  fullscreen = false,
  ariaHideApp = true,
  onAfterOpen,
  onAfterClose,
  onOverlayClick,
  modalWidth,
  themeDeprecated,
  title,
}: ModalProps): JSX.Element {
  const modalContent = (
    <React.Fragment>
      {title && <H2 as="h1">{title}</H2>}
      {content}
    </React.Fragment>
  );

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
      onAfterClose={onAfterClose}
      onRequestClose={onOverlayClick}
      testId="modal"
      // eslint-disable-next-line react/no-unstable-nested-components
      contentElement={(props, children) => (
        <ReactModalContent
          modalWidth={modalWidth}
          fullscreen={fullscreen}
          themeDeprecated={themeDeprecated}
          {...props}
        >
          {children}
        </ReactModalContent>
      )}
      // eslint-disable-next-line react/no-unstable-nested-components
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
        {disableAutoplayAudio ? (
          modalContent
        ) : (
          <ReadOnOpen>{modalContent}</ReadOnOpen>
        )}
      </ModalContent>
      {actions && <ButtonBar as="div">{actions}</ButtonBar>}
    </ReactModal>
  );
}
