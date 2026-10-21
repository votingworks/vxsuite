import type { BallotStyleQrCode } from '../src/barcodes/ballot_style_qr_code.js';

export function encodeBallotStyleQrCode(qrCode: BallotStyleQrCode): string {
  return JSON.stringify({ bId: qrCode.ballotStyleId, pId: qrCode.precinctId });
}
