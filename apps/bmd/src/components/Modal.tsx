import React from 'react'
import ReactModal from 'react-modal'

interface Props {
  isOpen: boolean
  ariaLabel?: string
}

const Modal: React.FC<Props> = ({
  children,
  ariaLabel = 'Alert Modal',
  isOpen,
}) => (
  <ReactModal
    appElement={document.getElementById('root') as HTMLElement}
    ariaHideApp={process.env.NODE_ENV !== 'test'}
    isOpen={isOpen}
    contentLabel={ariaLabel}
  >
    {children}
  </ReactModal>
)

export default Modal
