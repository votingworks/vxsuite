import React, { useState } from 'react'
import useInterval from 'use-interval'

import {
  isPresent,
  isMounted,
  doMount,
  doUnmount,
  isAvailable,
} from '../lib/usbstick'

import Button from './Button'

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
    return (
      <Button
        small
        disabled
        onPress={() => {
          console.log('No USB')
        }}
      >
        No USB
      </Button>
    )
  }

  if (mounted) {
    return (
      <Button small onPress={doUnmount}>
        Eject USB
      </Button>
    )
  }

  return (
    <Button small onPress={doMount}>
      Mount USB
    </Button>
  )
}

export default USBController
