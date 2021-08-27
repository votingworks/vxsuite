import { render, screen } from '@testing-library/react'
import { electionSample, electionSampleDefinition } from '@votingworks/fixtures'
import {
  makeAdminCard,
  advanceTimersAndPromises,
  makeVoterCard,
  makePollWorkerCard,
} from '@votingworks/test-utils'
import { MemoryCard, MemoryHardware } from '@votingworks/utils'
import React, { useEffect, useState } from 'react'
import {
  CARD_POLLING_INTERVAL,
  useSmartcard,
  UseSmartcardProps,
} from './useSmartcard'

beforeEach(() => {
  jest.useFakeTimers()
})

const TestComponent: React.FC<UseSmartcardProps> = ({ card, hardware }) => {
  const [smartcard, hasCardReader] = useSmartcard({ card, hardware })
  return (
    <div>
      {hasCardReader ? smartcard?.data?.t ?? 'no card' : 'no card reader'}
    </div>
  )
}

test('no card reader attached', async () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()

  render(<TestComponent card={card} hardware={hardware} />)
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)
  screen.getByText('no card reader')
})

test('with card reader but no card', async () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()

  await hardware.setCardReaderConnected(true)

  render(<TestComponent card={card} hardware={hardware} />)
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)
  screen.getByText('no card')
})

test('with card reader and a voter card', async () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()

  await hardware.setCardReaderConnected(true)
  card.insertCard(makeVoterCard(electionSample))

  render(<TestComponent card={card} hardware={hardware} />)
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)
  screen.getByText('voter')
})

test('with card reader and a pollworker card', async () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()

  await hardware.setCardReaderConnected(true)
  card.insertCard(makePollWorkerCard(electionSampleDefinition.electionHash))

  render(<TestComponent card={card} hardware={hardware} />)
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)
  screen.getByText('pollworker')
})

test('with card reader and an admin card', async () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()

  await hardware.setCardReaderConnected(true)
  card.insertCard(makeAdminCard(electionSampleDefinition.electionHash))

  render(<TestComponent card={card} hardware={hardware} />)
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)
  screen.getByText('admin')
})

test('with card reader and a gibberish card', async () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()

  await hardware.setCardReaderConnected(true)
  card.insertCard('not JSON')

  render(<TestComponent card={card} hardware={hardware} />)
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)
  screen.getByText('no card')
})

test('writing short value succeeds', async () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()

  await hardware.setCardReaderConnected(true)
  card.insertCard()

  const ThisTestComponent = () => {
    const [smartcard, hasCardReader] = useSmartcard({ card, hardware })
    const [error, setError] = useState<Error>()

    useEffect(() => {
      void (async () => {
        const result = await smartcard?.writeShortValue(
          JSON.stringify(makeVoterCard(electionSample))
        )
        setError(result?.err())
      })()
    }, [!smartcard])

    return (
      <div>
        {error?.message}{' '}
        {hasCardReader ? smartcard?.data?.t ?? 'no card' : 'no card reader'}
      </div>
    )
  }

  render(<ThisTestComponent />)

  // trigger & complete write
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)

  // update status
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)

  screen.getByText('voter')
})

test('writing short value fails', async () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()

  await hardware.setCardReaderConnected(true)
  card.insertCard()

  const ThisTestComponent = () => {
    const [smartcard] = useSmartcard({ card, hardware })
    const [error, setError] = useState<Error>()

    useEffect(() => {
      void (async () => {
        const result = await smartcard?.writeShortValue(
          JSON.stringify(makeVoterCard(electionSample))
        )
        setError(result?.err())
      })()
    }, [!smartcard])

    return <div>{error?.message}</div>
  }

  jest.spyOn(card, 'writeShortValue').mockRejectedValue(new Error('oh no'))
  render(<ThisTestComponent />)

  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)

  // update status
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)
  screen.getByText('oh no')
})

test('reading long string value succeeds', async () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()

  await hardware.setCardReaderConnected(true)
  card.insertCard()
  await card.writeLongObject({ some: 'object' })

  const ThisTestComponent = () => {
    const [longData, setLongData] = useState<string>()
    const [smartcard] = useSmartcard({ card, hardware })

    useEffect(() => {
      void (async () => {
        setLongData((await smartcard?.readLongString())?.ok())
      })()
    }, [!smartcard])

    return <div>{longData}</div>
  }

  render(<ThisTestComponent />)

  // read short
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)

  // read long
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)

  screen.getByText('{"some":"object"}')
})

test('reading long binary value succeeds', async () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()

  await hardware.setCardReaderConnected(true)
  card.insertCard()
  await card.writeLongUint8Array(Uint8Array.of(1, 2, 3))

  const ThisTestComponent = () => {
    const [longData, setLongData] = useState<Uint8Array>()
    const [smartcard] = useSmartcard({ card, hardware })

    useEffect(() => {
      void (async () => {
        setLongData((await smartcard?.readLongUint8Array())?.ok())
      })()
    }, [!smartcard])

    return <div>{longData?.join(',')}</div>
  }

  render(<ThisTestComponent />)

  // read short
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)

  // read long
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)

  screen.getByText('1,2,3')
})

test('reading long string value fails', async () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()

  await hardware.setCardReaderConnected(true)
  card.insertCard()

  const ThisTestComponent = () => {
    const [error, setError] = useState<string>()
    const [smartcard] = useSmartcard({ card, hardware })

    useEffect(() => {
      void (async () => {
        setError((await smartcard?.readLongString())?.err()?.message)
      })()
    }, [!smartcard])

    return <div>{error}</div>
  }

  jest.spyOn(card, 'readLongString').mockRejectedValue(new Error('oh no'))
  render(<ThisTestComponent />)

  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)
  screen.getByText('oh no')
})

test('reading long binary value fails', async () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()

  await hardware.setCardReaderConnected(true)
  card.insertCard()

  const ThisTestComponent = () => {
    const [error, setError] = useState<string>()
    const [smartcard] = useSmartcard({ card, hardware })

    useEffect(() => {
      void (async () => {
        setError((await smartcard?.readLongUint8Array())?.err()?.message)
      })()
    }, [!smartcard])

    return <div>{error}</div>
  }

  jest.spyOn(card, 'readLongUint8Array').mockRejectedValue(new Error('oh no'))
  render(<ThisTestComponent />)

  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)
  screen.getByText('oh no')
})

test('writing long object value succeeds', async () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()

  await hardware.setCardReaderConnected(true)
  card.insertCard()

  const ThisTestComponent = () => {
    const [longData, setLongData] = useState<string>()
    const [smartcard] = useSmartcard({ card, hardware })

    useEffect(() => {
      void (async () => {
        ;(await smartcard?.writeLongValue({ some: 'object' }))?.unsafeUnwrap()
        setLongData((await smartcard?.readLongString())?.ok())
      })()
    }, [!smartcard])

    return <div>{longData}</div>
  }

  render(<ThisTestComponent />)
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)
  screen.getByText('{"some":"object"}')
})

test('writing long binary value succeeds', async () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()

  await hardware.setCardReaderConnected(true)
  card.insertCard()

  const ThisTestComponent = () => {
    const [longData, setLongData] = useState<Uint8Array>()
    const [smartcard] = useSmartcard({ card, hardware })

    useEffect(() => {
      void (async () => {
        ;(
          await smartcard?.writeLongValue(Uint8Array.of(1, 2, 3))
        )?.unsafeUnwrap()
        setLongData((await smartcard?.readLongUint8Array())?.ok())
      })()
    }, [!smartcard])

    return <div>{longData?.join(',')}</div>
  }

  render(<ThisTestComponent />)
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)
  screen.getByText('1,2,3')
})

test('writing long object value fails', async () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()

  await hardware.setCardReaderConnected(true)
  card.insertCard()

  const ThisTestComponent = () => {
    const [smartcard] = useSmartcard({ card, hardware })
    const [error, setError] = useState<Error>()

    useEffect(() => {
      void (async () => {
        const result = await smartcard?.writeLongValue({ some: 'object' })
        setError(result?.err())
      })()
    }, [!smartcard])

    return <div>{error?.message}</div>
  }

  jest.spyOn(card, 'writeLongObject').mockRejectedValue(new Error('oh no'))
  render(<ThisTestComponent />)
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)
  screen.getByText('oh no')
})

test('writing long binary value fails', async () => {
  const card = new MemoryCard()
  const hardware = new MemoryHardware()

  await hardware.setCardReaderConnected(true)
  card.insertCard()

  const ThisTestComponent = () => {
    const [smartcard] = useSmartcard({ card, hardware })
    const [error, setError] = useState<Error>()

    useEffect(() => {
      void (async () => {
        const result = await smartcard?.writeLongValue(
          makeVoterCard(electionSample)
        )
        setError(result?.err())
      })()
    }, [!smartcard])

    return <div>{error?.message}</div>
  }

  jest.spyOn(card, 'writeLongUint8Array').mockRejectedValue(new Error('oh no'))
  render(<ThisTestComponent />)
  await advanceTimersAndPromises(CARD_POLLING_INTERVAL / 1000)
  screen.getByText('oh no')
})
