import { Election } from '@votingworks/types';
import { type FoundLayout } from './find_layout';

/**
 * The result of calling `interpret`.
 */
export type BridgeInterpretResult =
  | {
      success: false;
      value: string;
    }
  | {
      success: true;
      value: string;
      frontNormalizedImage: ImageData;
      backNormalizedImage: ImageData;
    };

/**
 * Type of the Rust `interpret` implementation. Under normal circumstances,
 * `success` will be true and `value` will be an `InterpretedBallotCard` as
 * JSON. If `success` is false, `value` will be an error object as JSON.
 */
export function interpret(
  election: Election,
  ballotImageSourceSideA: string | ImageData,
  ballotImageSourceSideB: string | ImageData,
  debugBasePathSideA?: string,
  debugBasePathSideB?: string
): BridgeInterpretResult;

/**
 * Type of the Rust `findLayout` implementation.
 */
export function findLayout(
  ballotImageSourceSideA: string | ImageData,
  ballotImageSourceSideB: string | ImageData
): FoundLayout;
