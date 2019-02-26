import React, { ReactNode } from 'react'
import ReactModal from 'react-modal'
import styled from 'styled-components'

import './Modal.css'

import ButtonBar from './ButtonBar'

const ModalContent = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
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
  actions?: ReactNode
  onAfterOpen?: () => void
}

const Modal: React.FC<Props> = ({
  actions,
  content,
  ariaLabel = 'Alert Modal',
  isOpen,
  onAfterOpen,
}) => (
  <ReactModal
    appElement={document.getElementById('root') as HTMLElement}
    ariaHideApp={process.env.NODE_ENV !== 'test'}
    isOpen={isOpen}
    contentLabel={ariaLabel}
    portalClassName="modal-portal"
    className="modal-content"
    overlayClassName="modal-overlay"
    onAfterOpen={onAfterOpen}
  >
    <ModalContent>{content}</ModalContent>
    <ButtonBar as="div" dark={false}>
      {actions}
    </ButtonBar>
  </ReactModal>
)

export default Modal
