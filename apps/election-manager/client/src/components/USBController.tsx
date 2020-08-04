import React, { useState, useCallback } from 'react'

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
  const [recentlyUnmounted, setRecentlyUnmounted] = useState(false)

  const doUnmountAndSetRecentlyUnmounted = async () => {
    setRecentlyUnmounted(true)
    doUnmount()
  }

  const doMountIfNotRecentlyUnmounted = useCallback(async () => {
    if (!recentlyUnmounted) {
      await doMount()
    }
  }, [recentlyUnmounted])

  useInterval(
    () => {
      ;(async () => {
        const p = await isPresent()
        setPresent(p)
        if (p) {
          const m = await isMounted()
          setMounted(m)
          if (!m) {
            await doMountIfNotRecentlyUnmounted()
          }
        } else {
          setRecentlyUnmounted(false)
        }
      })()
    },
    available ? 2000 : false
  )

  if (!available) {
    return null
  }

  if (!present) {
    return <Text>No USB</Text>
  }

  if (!mounted) {
    return <Text>Connecting...</Text>
  }

  return (
    <Button small onPress={doUnmountAndSetRecentlyUnmounted}>
      Eject USB
    </Button>
  )
}

export default USBController
