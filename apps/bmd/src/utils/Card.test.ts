import fetchMock, { MockRequest } from 'fetch-mock'
import { fromByteArray, toByteArray } from 'base64-js'
import { WebServiceCard, MemoryCard } from './Card'

describe('WebServiceCard', () => {
  it('fetches card status and short value from /card/read', async () => {
    fetchMock.get('/card/read', {
      present: true,
      shortValue: 'abc',
      longValueExists: true,
    })

    expect(await new WebServiceCard().readStatus()).toEqual({
      present: true,
      shortValue: 'abc',
      longValueExists: true,
    })
  })

  it('reads objects from /card/read_long', async () => {
    fetchMock.get('/card/read_long', {
      longValue: JSON.stringify({ a: 1, b: 2 }),
    })

    expect(await new WebServiceCard().readLongObject()).toEqual({
      a: 1,
      b: 2,
    })
  })

  it('reads binary data from /card/read_long_b64', async () => {
    fetchMock.get('/card/read_long_b64', {
      longValue: fromByteArray(Uint8Array.of(1, 2, 3)),
    })

    expect(await new WebServiceCard().readLongUint8Array()).toEqual(
      Uint8Array.of(1, 2, 3)
    )
  })

  it('writes short value using /card/write', async () => {
    fetchMock.post('/card/write', (url: string, mockRequest: MockRequest) => {
      expect(mockRequest.body).toEqual('abc')
      return { success: true }
    })

    await new WebServiceCard().writeShortValue('abc')
  })

  it('writes objects using /card/write_long_b64', async () => {
    fetchMock.post(
      '/card/write_long_b64',
      (url: string, mockRequest: MockRequest) => {
        const longValue = (mockRequest.body as FormData).get(
          'long_value'
        ) as string
        const longObject = JSON.parse(
          new TextDecoder().decode(toByteArray(longValue))
        )

        expect(longObject).toEqual({ a: 1 })
        return { success: true }
      }
    )

    await new WebServiceCard().writeLongObject({ a: 1 })
  })

  it('writes binary data using /card/write_long_b64', async () => {
    fetchMock.post(
      '/card/write_long_b64',
      (url: string, mockRequest: MockRequest) => {
        const longValue = (mockRequest.body as FormData).get(
          'long_value'
        ) as string
        const longObject = toByteArray(longValue)

        expect(longObject).toEqual(Uint8Array.of(1, 2, 3))
        return { success: true }
      }
    )

    await new WebServiceCard().writeLongUint8Array(Uint8Array.of(1, 2, 3))
  })

  it('gets undefined when reading object value if long value is not set', async () => {
    fetchMock.get('/card/read_long', {})

    expect(await new WebServiceCard().readLongObject()).toBeUndefined()
  })

  it('gets undefined when reading binary value if long value is not set', async () => {
    fetchMock.get('/card/read_long_b64', {})

    expect(await new WebServiceCard().readLongUint8Array()).toBeUndefined()
  })
})

describe('MemoryCard', () => {
  it('defaults to no card', async () => {
    expect(await new MemoryCard().readStatus()).toEqual({
      present: false,
    })
  })

  it('can round-trip a short value', async () => {
    const card = new MemoryCard().insertCard()

    await card.writeShortValue('abc')
    expect(await card.readStatus()).toEqual(
      expect.objectContaining({
        shortValue: 'abc',
      })
    )
  })

  it('can round-trip an object long value', async () => {
    const card = new MemoryCard().insertCard()

    await card.writeLongObject({ a: 1 })
    expect(await card.readLongObject()).toEqual({ a: 1 })
  })

  it('can round-trip a binary long value', async () => {
    const card = new MemoryCard().insertCard()

    await card.writeLongUint8Array(Uint8Array.of(1, 2, 3))
    expect(await card.readLongUint8Array()).toEqual(Uint8Array.of(1, 2, 3))
  })

  it('can set a short and long value using #insertCard', async () => {
    const card = new MemoryCard().insertCard('abc', Uint8Array.of(1, 2, 3))

    expect(await card.readStatus()).toEqual({
      present: true,
      shortValue: 'abc',
      longValueExists: true,
    })

    expect(await card.readLongUint8Array()).toEqual(Uint8Array.of(1, 2, 3))

    card.insertCard(undefined, { a: 1 })

    expect(await card.readStatus()).toEqual(
      expect.objectContaining({
        shortValue: undefined,
      })
    )

    expect(await card.readLongObject()).toEqual({ a: 1 })
  })

  it('can remove a card using #removeCard', async () => {
    const card = new MemoryCard()
      .insertCard('abc', Uint8Array.of(1, 2, 3))
      .removeCard()

    expect(await card.readStatus()).toEqual({
      present: false,
    })
  })

  it('fails to write a short value when there is no card', async () => {
    await expect(new MemoryCard().writeShortValue('abc')).rejects.toThrow(
      'cannot write short value when no card is present'
    )
  })

  it('fails to write a long value when there is no card', async () => {
    await expect(new MemoryCard().writeLongObject({})).rejects.toThrow(
      'cannot write long value when no card is present'
    )
  })

  it('gets undefined when reading an object when no long value is set', async () => {
    expect(await new MemoryCard().insertCard().readLongObject()).toBeUndefined()
  })
})
