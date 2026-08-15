/**
 * Stub for `@votingworks/ballot-encoder` in the browser preview.
 *
 * The encoder reaches `libs/types-rs` through a native addon, which cannot load
 * in a browser. The preview renders ballot templates and measures the timing
 * mark grid; QR codes are filled into their slots later, by
 * `addQrCodesAndBallotHashes` running in Node, so nothing here is ever called.
 */

/* istanbul ignore file */

function notAvailableInPreview(): never {
  throw new Error(
    'the ballot encoder is not available in the browser preview; QR codes are added in Node'
  );
}

/** @see notAvailableInPreview */
export const encodeHmpbBallotPageMetadata = notAvailableInPreview;

/** @see notAvailableInPreview */
export const encodeSummaryBallotPage = notAvailableInPreview;

/** @see notAvailableInPreview */
export const decodeSummaryBallotPage = notAvailableInPreview;

/** @see notAvailableInPreview */
export const decodeBallotHash = notAvailableInPreview;

/** @see notAvailableInPreview */
export const isVxBallot = notAvailableInPreview;

/** Pure string slicing, safe to keep working in the preview. */
export function sliceBallotHashForEncoding(ballotHash: string): string {
  return ballotHash.slice(0, 20);
}
