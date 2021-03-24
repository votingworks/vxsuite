import { Optional } from '@votingworks/types'
import { toByteArray, fromByteArray } from 'base64-js'
import { CardAPI } from '../config/types'
import fetchJSON from './fetchJSON'

/**
 * Defines the API for accessing a smart card reader.
 */
export interface Card {
  /**
   * Reads basic information about the card, including whether one is present,
   * what its short value is and whether it has a long value.
   */
  readStatus(): Promise<CardAPI>

  /**
   * Reads the long value as an object, or `undefined` if there is no long
   * value.
   */
  readLongObject<T>(): Promise<Optional<T>>

  /**
   * Reads the long value as a string, or `undefined` if there is no long
   * value.
   */
  readLongString(): Promise<Optional<string>>

  /**
   * Reads the long value as binary data, or `undefined` if there is no long
   * value.
   */
  readLongUint8Array(): Promise<Optional<Uint8Array>>

  /**
   * Writes a new short value to the card.
   */
  writeShortValue(value: string): Promise<void>

  /**
   * Writes a new long value as a serialized object.
   */
  writeLongObject<T>(value: T): Promise<void>

  /**
   * Writes binary data to the long value.
   */
  writeLongUint8Array(value: Uint8Array): Promise<void>
}

/**
 * Implements the `Card` API by accessing it through a web service.
 */
export class WebServiceCard implements Card {
  /**
   * Reads basic information about the card, including whether one is present,
   * what its short value is and whether it has a long value.
   */
  public async readStatus(): Promise<CardAPI> {
    return await fetchJSON<CardAPI>('/card/read')
  }

  /**
   * Reads the long value as an object, or `undefined` if there is no long
   * value.
   */
  public async readLongObject<T>(): Promise<Optional<T>> {
    const response = await fetch('/card/read_long')
    const { longValue } = await response.json()
    return longValue ? JSON.parse(longValue) : undefined
  }

  /**
   * Reads the long value as a string, or `undefined` if there is no long
   * value.
   */
  public async readLongString(): Promise<Optional<string>> {
    const response = await fetch('/card/read_long')
    const { longValue } = await response.json()
    return longValue || undefined
  }

  /**
   * Reads the long value as binary data, or `undefined` if there is no long
   * value.
   */
  public async readLongUint8Array(): Promise<Optional<Uint8Array>> {
    const response = await fetch('/card/read_long_b64')
    const { longValue } = await response.json()
    return longValue ? toByteArray(longValue) : undefined
  }

  /**
   * Writes a new short value to the card.
   */
  public async writeShortValue(value: string): Promise<void> {
    await fetch('/card/write', {
      method: 'post',
      body: value,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  /**
   * Writes a new long value as a serialized object.
   */
  public async writeLongObject<T>(value: T): Promise<void> {
    await this.writeLongUint8Array(
      new TextEncoder().encode(JSON.stringify(value))
    )
  }

  /**
   * Writes binary data to the long value.
   */
  public async writeLongUint8Array(value: Uint8Array): Promise<void> {
    const longValueBase64 = fromByteArray(value)
    const formData = new FormData()

    formData.append('long_value', longValueBase64)

    await fetch('/card/write_long_b64', {
      method: 'post',
      body: formData,
    })
  }
}

/**
 * Implements the `Card` API with an in-memory implementation.
 */
export class MemoryCard implements Card {
  private present = false
  private shortValue?: string
  private longValue?: Uint8Array

  /**
   * Reads basic information about the card, including whether one is present,
   * what its short value is and whether it has a long value.
   */
  public async readStatus(): Promise<CardAPI> {
    const { present, shortValue } = this

    if (present) {
      const longValueExists =
        typeof this.longValue !== 'undefined' && this.longValue.length > 0

      return {
        present,
        shortValue,
        longValueExists,
      }
    }
    return { present }
  }

  /**
   * Reads the long value as an object, or `undefined` if there is no long
   * value.
   */
  public async readLongObject<T>(): Promise<Optional<T>> {
    const { longValue } = this

    if (!longValue) {
      return
    }

    return JSON.parse(new TextDecoder().decode(longValue))
  }

  /**
   * Reads the long value as a string, or `undefined` if there is no long
   * value.
   */
  public async readLongString(): Promise<Optional<string>> {
    const { longValue } = this

    if (!longValue) {
      return
    }

    return new TextDecoder().decode(longValue)
  }

  /**
   * Reads the long value as binary data, or `undefined` if there is no long
   * value.
   */
  public async readLongUint8Array(): Promise<Optional<Uint8Array>> {
    return this.longValue
  }

  /**
   * Writes a new short value to the card.
   */
  public async writeShortValue(value: string): Promise<void> {
    if (!this.present) {
      throw new Error('cannot write short value when no card is present')
    }

    this.shortValue = value
  }

  /**
   * Writes a new long value as a serialized object.
   */
  public async writeLongObject<T>(value: T): Promise<void> {
    await this.writeLongUint8Array(
      new TextEncoder().encode(JSON.stringify(value))
    )
  }

  /**
   * Writes binary data to the long value.
   */
  public async writeLongUint8Array(value: Uint8Array): Promise<void> {
    if (!this.present) {
      throw new Error('cannot write long value when no card is present')
    }

    this.longValue = Uint8Array.from(value)
  }

  /**
   * Removes the simulated in-memory card.
   */
  public removeCard(): this {
    this.present = false
    this.shortValue = undefined
    this.longValue = undefined
    return this
  }

  /**
   * Inserts a simulated in-memory card with specified long and short values.
   */
  public insertCard(
    shortValue?: string,
    longValue?: string | Uint8Array
  ): this {
    this.shortValue = shortValue
    this.longValue =
      typeof longValue === 'undefined'
        ? undefined
        : longValue instanceof Uint8Array
        ? Uint8Array.from(longValue)
        : new TextEncoder().encode(longValue)
    this.present = true
    return this
  }
}
