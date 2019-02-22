import React, { ReactNode } from 'react'
import ReactModal from 'react-modal'
import styled from 'styled-components'

import './Modal.css'

const ModalContent = styled.div`
  padding: 2rem 1rem;
`
const ModalActions = styled.div`
  display: flex;
  flex-direction: row-reverse;
  justify-content: space-between;
  flex-wrap: wrap;
  border-top: 1px solid rgba(0, 0, 0, 0.25);
  padding: 1rem;
  background: rgba(0, 0, 0, 0.05);
  & > button {
    min-width: 8rem;
  }
  & > button:only-child {
    margin: auto;
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
    <ModalActions>{actions}</ModalActions>
  </ReactModal>
)

export default Modal
