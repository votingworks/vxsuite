/**
 * The result of calling `interpret`.
 */
export interface BridgeInterpretResult {
  success: boolean;
  json: boolean;
  value: unknown;
}

/**
 * Type of the Rust `interpret` implementation. Under normal circumstances,
 * `success` will be true and `value` will be an `InterpretedBallotCard`. If
 * `success` is false, `value` will be an error message. If `json` is true,
 * `value` will be a JSON string.
 */
export function interpret(
  electionJson: string,
  ballotImagePath1: string,
  ballotImagePath2: string,
  debug: boolean
): BridgeInterpretResult;
