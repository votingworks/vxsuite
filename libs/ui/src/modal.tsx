import React, {
  ReactNode,
  useLayoutEffect,
  useRef,
  MouseEvent as ReactMouseEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { DefaultTheme } from 'styled-components';
import { rgba } from 'polished';

import { assertDefined } from '@votingworks/basics';

import { SizeMode } from '@votingworks/types';
import { styled } from './styled.js';
import { H2 } from './typography.js';
import { ReadOnLoad } from './ui_strings/read_on_load.js';
import { useAudioContext } from './ui_strings/audio_context.js';
import { FocusableAudio } from './focusable_audio.js';
import { registerOpenDialog } from './top_layer.js';

/**
 * Controls the maximum width the modal can expand to.
 */
export enum ModalWidth {
  Standard = '30rem',
  Wide = '55rem',
}

const CONTENT_SPACING_VALUES_REM: Readonly<Record<SizeMode, number>> = {
  desktop: 0.75,
  print: 0.75,
  touchSmall: 0.5,
  touchMedium: 0.5,
  touchLarge: 0.25,
  touchExtraLarge: 0.2,
};

function getSpacingValueRem(p: { theme: DefaultTheme }) {
  return CONTENT_SPACING_VALUES_REM[p.theme.sizeMode];
}

function getViewportMarginCssValue(p: {
  theme: DefaultTheme;
  fullscreen?: boolean;
}) {
  return p.fullscreen ? '0rem' : `${getSpacingValueRem(p) * 2}rem`;
}

interface DialogInterface {
  fullscreen?: boolean;
  modalWidth?: ModalWidth;
}
const Dialog = styled('dialog')<DialogInterface>`
  position: fixed;
  inset: 0;
  margin: auto;
  border: none;
  padding: 0;
  outline: none;
  background: ${(p) => p.theme.colors.background};
  color: inherit;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  overflow: auto;
  -webkit-overflow-scrolling: touch;

  &[open] {
    display: flex;
    flex-direction: column;
  }

  &::backdrop {
    background: ${(p) => rgba(p.theme.colors.inverseBackground, 0.9)};
  }

  @media (min-width: 480px) {
    border-radius: ${({ fullscreen }) => (fullscreen ? '0' : '0.5rem')};
    height: ${({ fullscreen }) => (fullscreen ? '100%' : 'fit-content')};
    max-width: ${({ modalWidth = ModalWidth.Standard, ...p }) =>
      p.fullscreen
        ? '100%'
        : `min(${modalWidth}, calc(100% - ${getViewportMarginCssValue(p)}))`};
    max-height: calc(100% - ${(p) => getViewportMarginCssValue(p)});
  }

  @media print {
    &[open],
    &::backdrop {
      display: none;
    }
  }
`;

function getButtonSpacingCssValue(p: { theme: DefaultTheme }) {
  const {
    sizes: { minTouchAreaSeparationPx },
  } = p.theme;

  return `max(${minTouchAreaSeparationPx}px, ${getSpacingValueRem(p)}rem)`;
}

export const ButtonBar = styled('div')`
  align-items: center;
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${(p) => p.theme.colors.outline};
  display: flex;
  flex-wrap: wrap-reverse;
  gap: ${(p) => getButtonSpacingCssValue(p)};
  justify-content: flex-end;
  padding: ${(p) => getButtonSpacingCssValue(p)};

  & > * {
    flex-grow: 1;
  }

  & > *:first-child {
    min-width: 40%;
    order: 2;
  }

  & > *:only-child {
    @media (min-width: 480px) {
      flex-grow: initial;
    }
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
  padding: ${(p) => (p.fullscreen ? 0 : getSpacingValueRem(p))}rem;
`;

const AudioContent = styled.div`
  align-items: inherit;
  display: flex;
  flex-direction: column;
  justify-content: inherit;
`;

/** Props for {@link Modal}. */
export interface ModalProps {
  'aria-label'?: string;
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
  /** Called when the backdrop is clicked or the Escape key is pressed. */
  onOverlayClick?: () => void;
  focusableAudioContent?: boolean;
  fullscreen?: boolean;
  modalWidth?: ModalWidth;
  title?: ReactNode;
  className?: string;
}

function isOutsideDialog(event: ReactMouseEvent<HTMLDialogElement>): boolean {
  const rect = event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX >= rect.right ||
    event.clientY < rect.top ||
    event.clientY >= rect.bottom
  );
}

/**
 * `showModal()` moves focus to the first focusable descendant. Instead, keep
 * focus where it is if already inside the dialog, and otherwise focus the
 * dialog itself so that screen readers announce it as a whole.
 */
function showModal(dialog: HTMLDialogElement) {
  const { activeElement } = document;
  if (
    activeElement &&
    activeElement !== dialog &&
    dialog.contains(activeElement)
  ) {
    activeElement.setAttribute('autofocus', '');
    dialog.showModal();
    activeElement.removeAttribute('autofocus');
    return;
  }

  for (const child of dialog.children) {
    child.setAttribute('inert', '');
  }
  dialog.showModal();
  for (const child of dialog.children) {
    child.removeAttribute('inert');
  }
}

export function Modal({
  actions,
  'aria-label': ariaLabel = 'Alert Modal',
  centerContent,
  content,
  disableAutoplayAudio,
  focusableAudioContent,
  fullscreen = false,
  onOverlayClick,
  modalWidth,
  title,
  className,
}: ModalProps): JSX.Element {
  const isInVoterAudioContext = !!useAudioContext();
  const shouldPlayAudioOnOpen = isInVoterAudioContext && !disableAutoplayAudio;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const previouslyFocusedElementRef = useRef<Element | null>(null);
  const isBackdropMouseDownRef = useRef(false);

  useLayoutEffect(() => {
    previouslyFocusedElementRef.current = document.activeElement;
    const dialog = assertDefined(dialogRef.current);
    dialog.setAttribute('closedby', 'none');
    showModal(dialog);
    const unregister = registerOpenDialog(dialog);

    return () => {
      unregister();
      dialog.close();
      const previouslyFocusedElement = previouslyFocusedElementRef.current;
      if (
        previouslyFocusedElement instanceof HTMLElement &&
        previouslyFocusedElement.isConnected
      ) {
        previouslyFocusedElement.focus();
      }
    };
  }, []);

  function onMouseDown(event: ReactMouseEvent<HTMLDialogElement>) {
    isBackdropMouseDownRef.current =
      event.target === event.currentTarget && isOutsideDialog(event);
  }

  function onClick(event: ReactMouseEvent<HTMLDialogElement>) {
    if (
      isBackdropMouseDownRef.current &&
      event.target === event.currentTarget
    ) {
      onOverlayClick?.();
    }
    isBackdropMouseDownRef.current = false;
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onOverlayClick?.();
    }
  }

  let modalContent = (
    <React.Fragment>
      {title && <H2 as="h1">{title}</H2>}
      {content}
    </React.Fragment>
  );

  if (focusableAudioContent) {
    modalContent = (
      <FocusableAudio as={AudioContent} readOnLoad={shouldPlayAudioOnOpen}>
        {modalContent}
      </FocusableAudio>
    );
  } else if (shouldPlayAudioOnOpen) {
    modalContent = <ReadOnLoad as={AudioContent}>{modalContent}</ReadOnLoad>;
  }

  return createPortal(
    <Dialog
      ref={dialogRef}
      role="alertdialog"
      aria-label={ariaLabel}
      aria-modal
      tabIndex={-1}
      data-testid="modal"
      className={className}
      fullscreen={fullscreen}
      modalWidth={modalWidth}
      onCancel={(event) => event.preventDefault()}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
    >
      <ModalContent centerContent={centerContent} fullscreen={fullscreen}>
        {modalContent}
      </ModalContent>
      {actions && <ButtonBar as="div">{actions}</ButtonBar>}
    </Dialog>,
    document.body
  );
}
