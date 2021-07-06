import React, { ReactNode } from 'react'
import ReactModal from 'react-modal'
import styled from 'styled-components'

import { ButtonBar } from '@votingworks/ui'

import './Modal.css'

interface ModalContentInterface {
  centerContent?: boolean
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
`

interface Props {
  ariaLabel?: string
  className?: string
  content?: ReactNode
  centerContent?: boolean
  actions?: ReactNode
  onAfterOpen?: () => void
}

const Modal: React.FC<Props> = ({
  actions,
  ariaLabel = 'Alert Modal',
  centerContent,
  className = '',
  content,
  onAfterOpen = () => {
    /* istanbul ignore next - unclear why this isn't covered */
    window.setTimeout(() => {
      const element = document.getElementById('modalaudiofocus')
      if (element) {
        element.focus()
        element.click()
      }
    }, 10)
  },
}) => (
  <ReactModal
    appElement={
      (document.getElementById('root') ?? document.body.firstElementChild)!
    }
    ariaHideApp
    aria-modal
    role="alertdialog"
    isOpen
    contentLabel={ariaLabel}
    portalClassName="modal-portal"
    className={`modal-content ${className}`}
    overlayClassName="modal-overlay"
    onAfterOpen={onAfterOpen}
    testId="modal"
  >
    <ModalContent centerContent={centerContent}>{content}</ModalContent>
    {actions && <ButtonBar as="div">{actions}</ButtonBar>}
  </ReactModal>
)

export default Modal
