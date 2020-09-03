import React, { useState } from 'react'

import Button, { StyledButtonProps } from './Button'
import Modal from './Modal'
import Loading from './Loading'
import Prose from './Prose'

interface PrintButtonProps extends StyledButtonProps {
  title?: string
  afterPrint?: () => void
  copies?: number
}

const PrintButton = ({
  title,
  afterPrint,
  children,
  copies,
  ...rest
}: React.PropsWithChildren<PrintButtonProps>) => {
  const [isPrinting, setIsPrinting] = useState(false)
  const [showPrintingError, setShowPrintingError] = useState(false)

  const print = async () => {
    if (window.kiosk) {
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
    if (window.kiosk) {
      await window.kiosk.print({ copies })
    } else {
      copies &&
        copies > 1 &&
        console.error(
          'Printing more than 1 copy can only be done with KioskBrowser.'
        )
      window.print()
    }
    if (title) {
      document.title = documentTitle
    }

    afterPrint?.()
  }

  const donePrintingError = () => {
    setShowPrintingError(false)
  }

  return (
    <React.Fragment>
      <Button onPress={print} {...rest}>
        {children}
      </Button>
      <Modal
        isOpen={isPrinting}
        centerContent
        content={<Loading>Printing</Loading>}
      />
      <Modal
        isOpen={showPrintingError}
        content={
          <Prose>
            <h2>The printer is not connected.</h2>
            <p>Please connect the printer and try again.</p>
          </Prose>
        }
        actions={
          <React.Fragment>
            <Button onPress={donePrintingError}>OK</Button>
          </React.Fragment>
        }
      />
    </React.Fragment>
  )
}

export default PrintButton
