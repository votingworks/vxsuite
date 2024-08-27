import {
  BitReader,
  ELECTION_HASH_LENGTH,
  HexEncoding,
  HmpbPrelude,
  decodeBallotConfigFromReader,
} from '@votingworks/ballot-encoder';
import { assert } from '@votingworks/basics';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { detect } from '@votingworks/qrdetect';
import { BallotPageMetadata, BallotType, Election } from '@votingworks/types';
import { Buffer } from 'buffer';
import { encodeMetadata } from './encode_metadata';

/**
 * Detect a QR code in the given image and decode the metadata.
 */
export function decodeMetadata(
  election: Election,
  qrCode: ImageData
): BallotPageMetadata {
  const detected = detect(qrCode.data, qrCode.width, qrCode.height)[0]!.data;
  const base64decoded = Buffer.from(
    new TextDecoder().decode(detected),
    'base64'
  );
  const bits = new BitReader(base64decoded);
  assert(bits.skipUint8(...HmpbPrelude));
  const electionHash = bits.readString({
    encoding: HexEncoding,
    length: ELECTION_HASH_LENGTH,
  });
  const config = decodeBallotConfigFromReader(election, bits, {
    readPageNumber: true,
  });
  return {
    ...config,
    pageNumber: config.pageNumber ?? -1,
    electionHash,
  };
}

test('encodeMetadata', async () => {
  const { electionDefinition } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election, electionHash } = electionDefinition;
  const ballotStyle = election.ballotStyles[0]!;

  const metadata: BallotPageMetadata = {
    ballotStyleId: ballotStyle.id,
    precinctId: ballotStyle.precincts[0]!,
    ballotType: BallotType.Precinct,
    isTestMode: true,
    electionHash,
    pageNumber: 1,
  };
  const [frontQrCode, backQrCode] = await encodeMetadata(election, metadata);
  expect(frontQrCode).toMatchSnapshot();
  expect(backQrCode).toMatchSnapshot();
});
