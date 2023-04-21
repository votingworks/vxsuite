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
  electionJson: string,
  ballotImageSourceSideA: string | ImageData,
  ballotImageSourceSideB: string | ImageData,
  debugBasePathSideA?: string,
  debugBasePathSideB?: string
): BridgeInterpretResult;

/**
 * Finds the grid layout within a ballot image, returning both the grid layout
 * and a normalized image.
 */
export function findGrid(
  ballotImage: string | ImageData,
  isTemplate: boolean,
  debugPath?: string
): {
  gridJson: string;
  normalizedImage: ImageData;
};

/**
 * Finds the ovals within a ballot template image.
 */
export function findTargetOvalsInTemplate(
  ballotImage: string | ImageData,
  ovalTemplateImage: string | ImageData,
  gridJson: string,
  ovalMatchThreshold: number
): {
  targetOvalsJson: string;
};
