import React, { useContext, useState } from 'react'

import Button, { StyledButtonProps } from './Button'
import Modal from './Modal'
import Loading from './Loading'
import Prose from './Prose'
import { PrintOptions } from '../utils/printer'
import AppContext from '../contexts/AppContext'

interface ConfirmModal {
  content: React.ReactNode
  confirmButtonLabel?: string
}

interface PrintButtonProps extends StyledButtonProps {
  title?: string
  afterPrint?: () => void
  copies?: number
  sides: PrintOptions['sides']
  confirmModal?: ConfirmModal
}

const PrintButton: React.FC<React.PropsWithChildren<PrintButtonProps>> = ({
  title,
  afterPrint,
  children,
  copies,
  sides,
  confirmModal,
  ...rest
}) => {
  const { printer } = useContext(AppContext)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [showPrintingError, setShowPrintingError] = useState(false)

  const print = async () => {
    if (window.kiosk != null) {
      const printers = await window.kiosk.getPrinterInfo()
      if (!printers.some((p) => p.connected)) {
        setShowPrintingError(true)
        return
      }
    }

    setIsPrinting(true)
    setTimeout(() => {
      setIsPrinting(false)
    }, 3000)
    const documentTitle = document.title
    if (title) {
      document.title = title
    }
    await printer.print({ sides, copies })
    if (title) {
      document.title = documentTitle
    }

    afterPrint?.()
  }

  const donePrintingError = () => {
    setShowPrintingError(false)
  }

  const initConfirmModal = () => {
    setIsConfirming(true)
  }

  const cancelPrint = () => {
    setIsConfirming(false)
  }

  const confirmPrint = async () => {
    setIsConfirming(false)
    await print()
  }

  return (
    <>
      <Button onPress={(confirmModal != null) ? initConfirmModal : print} {...rest}>
        {children}
      </Button>
      {isPrinting && (
        <Modal centerContent content={<Loading>Printing</Loading>} />
      )}
      {isConfirming && (
        <Modal
          centerContent
          content={confirmModal?.content}
          actions={
            <>
              <Button onPress={cancelPrint}>Cancel</Button>
              <Button onPress={confirmPrint} primary>
                {confirmModal?.confirmButtonLabel ?? 'Print'}
              </Button>
            </>
          }
        />
      )}
      {showPrintingError && (
        <Modal
          content={
            <Prose>
              <h2>The printer is not connected.</h2>
              <p>Please connect the printer and try again.</p>
            </Prose>
          }
          actions={
            <>
              <Button onPress={donePrintingError}>OK</Button>
            </>
          }
        />
      )}
    </>
  )
}

export default PrintButton
