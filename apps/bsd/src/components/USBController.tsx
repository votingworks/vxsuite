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
        console.log('checking...', p)
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

  console.log('rendering')

  return (
    <React.Fragment>
      {mounted ? (
        <Button onPress={doUnmount}>Eject USB</Button>
      ) : (
        <Button onPress={doMount}>Mount USB</Button>
      )}
    </React.Fragment>
  )
}

export default USBController
