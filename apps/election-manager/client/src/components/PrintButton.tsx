import React, { useState } from 'react'

import Button, { ButtonInterface } from './Button'
import Modal from './Modal'
import Loading from './Loading'

interface PrintButtonProps extends ButtonInterface {
  title?: string
}

const PrintButton = ({
  title,
  children,
  ...rest
}: React.PropsWithChildren<PrintButtonProps>) => {
  const [isPrinting, setIsPrinting] = useState(false)

  const print = async () => {
    setIsPrinting(true)
    setTimeout(() => {
      setIsPrinting(false)
    }, 3000)
    const documentTitle = document.title
    if (title) {
      document.title = title
    }
    await (window.kiosk ?? window).print()
    if (title) {
      document.title = documentTitle
    }
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
    </React.Fragment>
  )
}

export default PrintButton
