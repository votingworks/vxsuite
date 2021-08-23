import { ok, Optional, Result, safeParseJSON } from '@votingworks/types'
import { toByteArray, fromByteArray } from 'base64-js'
import { z } from 'zod'
import { fetchJSON } from './fetchJSON'

export interface CardAbsentAPI {
  present: false
}
export interface CardPresentAPI {
  present: true
  shortValue?: string
  longValueExists?: boolean
}
export type CardAPI = CardAbsentAPI | CardPresentAPI

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
   * value and validates it using `schema`.
   */
  readLongObject<T>(
    schema: z.ZodSchema<T>
  ): Promise<Result<Optional<T>, SyntaxError | z.ZodError>>

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
  writeLongObject(value: unknown): Promise<void>

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
   * value and validates it using `schema`.
   */
  public async readLongObject<T>(
    schema: z.ZodSchema<T>
  ): Promise<Result<Optional<T>, SyntaxError | z.ZodError>> {
    const response = await fetch('/card/read_long')
    const { longValue } = await response.json()
    return longValue ? safeParseJSON(longValue, schema) : ok(undefined)
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
  public async writeLongObject(value: unknown): Promise<void> {
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
   * value and validates it using `schema`.
   */
  public async readLongObject<T>(
    schema: z.ZodSchema<T>
  ): Promise<Result<Optional<T>, SyntaxError | z.ZodError>> {
    const { longValue } = this
    if (!longValue || longValue.length === 0) {
      return ok(undefined)
    }

    const longValueJSON = new TextDecoder().decode(longValue)
    return schema
      ? safeParseJSON(longValueJSON, schema)
      : JSON.parse(longValueJSON)
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
  public async writeLongObject(value: unknown): Promise<void> {
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
    shortValue?: string | unknown,
    longValue?: string | Uint8Array
  ): this {
    this.shortValue =
      typeof shortValue === 'string' ? shortValue : JSON.stringify(shortValue)
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
