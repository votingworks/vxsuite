import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { BallotPageMetadata, BallotType, Election } from '@votingworks/types';
import { loadImageData } from '@votingworks/image-utils';
import {
  decodeBallotConfigFromReader,
  BitReader,
  HmpbPrelude,
  HexEncoding,
  ELECTION_HASH_LENGTH,
  sliceElectionHash,
} from '@votingworks/ballot-encoder';
import { detect } from '@votingworks/qrdetect';
import { assert } from '@votingworks/basics';
import { Buffer } from 'buffer';
import { encodeMetadata } from './encode_metadata';

function decodeMetadata(
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
  expect(frontQrCode).toMatchImageSnapshot();
  expect(backQrCode).toMatchImageSnapshot();

  expect(decodeMetadata(election, await loadImageData(frontQrCode))).toEqual({
    ...metadata,
    electionHash: sliceElectionHash(electionHash),
  });
  expect(decodeMetadata(election, await loadImageData(backQrCode))).toEqual({
    ...metadata,
    electionHash: sliceElectionHash(electionHash),
    pageNumber: 2,
  });
});
