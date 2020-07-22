import React, { useState } from 'react'

import useInterval from 'use-interval'

import Button from './Button'
import Text from './Text'
import {
  isPresent,
  isMounted,
  doMount,
  doUnmount,
  isAvailable,
} from '../lib/usbstick'

const USBController = () => {
  const available = isAvailable()
  const [present, setPresent] = useState(false)
  const [mounted, setMounted] = useState(false)

  useInterval(
    () => {
      ;(async () => {
        const p = await isPresent()
        setPresent(p)
        if (p) setMounted(await isMounted())
      })()
    },
    available ? 1000 : false
  )

  if (!available) {
    return null
  }

  if (!present) {
    return <Text>No USB</Text>
  }

  return (
    <React.Fragment>
      {mounted ? (
        <Button onClick={doUnmount}>Eject USB</Button>
      ) : (
        <Button onClick={doMount}>Mount USB</Button>
      )}
    </React.Fragment>
  )
}

export default USBController
