import * as v0 from './v0'
import * as v1 from './v1'
import { CompletedBallot, Election } from './election'

export * from './election'
export { v0, v1 }

export enum EncoderVersion {
  /* eslint-disable no-shadow */
  v0 = 0,
  v1 = 1,
  /* eslint-enable no-shadow */
}

/**
 * Encodes a ballot using the specified encoder version.
 */
export function encodeBallot(
  election: Election,
  ballot: CompletedBallot,
  version: EncoderVersion = EncoderVersion.v1
): Uint8Array {
  switch (version) {
    case EncoderVersion.v0:
      return v0.encodeBallot(election, ballot)

    case EncoderVersion.v1:
      return v1.encodeBallot(election, ballot)

    default:
      throw new Error(`unexpected encoder version: ${JSON.stringify(version)}`)
  }
}

export interface BallotDecodeResult {
  version: EncoderVersion
  ballot: CompletedBallot
}

/**
 * Decodes an encoded ballot either by specifying a version or detecting it
 * automatically. If successful, returns both the encoder version and the ballot.
 */
export function decodeBallot(
  election: Election,
  encodedBallot: Uint8Array,
  version?: EncoderVersion
): BallotDecodeResult {
  switch (version) {
    case EncoderVersion.v0:
      return {
        version,
        ballot: v0.decodeBallot(election, encodedBallot),
      }

    case EncoderVersion.v1:
      return {
        version,
        ballot: v1.decodeBallot(election, encodedBallot),
      }

    default: {
      const detectedVersion = detect(encodedBallot)

      if (typeof detectedVersion === 'undefined') {
        throw new Error(
          'no ballot decoder was able to handle this encoded ballot'
        )
      }

      return decodeBallot(election, encodedBallot, detectedVersion)
    }
  }
}

/**
 * Detect the encoder version used to encode `data`, if possible.
 *
 * @returns `undefined` if no version can be detected
 */
export function detect(data: Uint8Array): EncoderVersion | undefined {
  if (v1.detect(data)) {
    return EncoderVersion.v1
  }

  if (v0.detect(data)) {
    return EncoderVersion.v0
  }

  return undefined
}
