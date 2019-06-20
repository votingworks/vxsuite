import React, { ReactNode } from 'react'
import ReactModal from 'react-modal'
import styled from 'styled-components'

import './Modal.css'

import ButtonBar from './ButtonBar'

interface ModalContentInterface {
  centerContent?: boolean
}

const ModalContent = styled('div')<ModalContentInterface>`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: ${({ centerContent = false }) =>
    centerContent ? 'center' : undefined};
  overflow: auto;
  padding: 1rem 0.5rem;
  @media (min-width: 480px) {
    padding: 2rem 1rem;
  }
`

interface Props {
  isOpen: boolean
  ariaLabel?: string
  content?: ReactNode
  centerContent?: boolean
  actions?: ReactNode
  onAfterOpen?: () => void
}

const Modal: React.FC<Props> = ({
  actions,
  content,
  centerContent,
  ariaLabel = 'Alert Modal',
  isOpen,
  onAfterOpen = () => {
    window.setTimeout(() => {
      const element = document.getElementById('modalaudiofocus')
      if (element) {
        element.focus()
        element.click()
      }
    }, 10)
  },
}: Props) => (
  <ReactModal
    appElement={
      document.getElementById('root')! || document.body.firstElementChild
    }
    ariaHideApp
    role="none"
    isOpen={isOpen}
    contentLabel={ariaLabel}
    portalClassName="modal-portal"
    className="modal-content"
    overlayClassName="modal-overlay"
    onAfterOpen={onAfterOpen}
  >
    <ModalContent centerContent={centerContent} data-testid="modal-content">
      {content}
    </ModalContent>
    {actions && (
      <ButtonBar as="div" dark={false}>
        {actions}
      </ButtonBar>
    )}
  </ReactModal>
)

export default Modal
