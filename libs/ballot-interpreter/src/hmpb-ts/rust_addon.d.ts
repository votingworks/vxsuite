import { Election } from '@votingworks/types';
import { ImageData } from 'canvas';
import { type TemplateGridAndBubbles } from './find_template_grid_and_bubbles';

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
  debugBasePathSideB?: string,
  options?: { scoreWriteIns?: boolean }
): BridgeInterpretResult;

/**
 * Type of the Rust `findTemplateGridAndBubbles` implementation.
 */
export function findTemplateGridAndBubbles(
  ballotImageSourceSideA: string | ImageData,
  ballotImageSourceSideB: string | ImageData
): TemplateGridAndBubbles;

export function runBlankPaperDiagnostic(
  image: string | ImageData,
  debugBasePath?: string
): boolean;
