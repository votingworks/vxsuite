import {
  encodeBallot,
  encodeHmpbBallotPageMetadata,
} from '@votingworks/ballot-encoder';
import { electionSampleDefinition } from '@votingworks/fixtures';
import {
  BallotMetadata,
  BallotType,
  BallotPageMetadata,
} from '@votingworks/types';
import { normalizeSheetMetadata } from './sheet';
import { BallotPageQrcode } from './utils/qrcode';

test('normalizing sheet metadata', () => {
  const { election, electionHash } = electionSampleDefinition;
  const metadata: BallotMetadata = {
    ballotStyleId: election.ballotStyles[0].id,
    precinctId: election.precincts[0].id,
    ballotType: BallotType.Standard,
    electionHash,
    isTestMode: false,
    locales: { primary: 'en-US' },
  };
  const frontHmpbMetadata: BallotPageMetadata = {
    ...metadata,
    pageNumber: 1,
  };
  const backHmpbMetadata: BallotPageMetadata = {
    ...metadata,
    pageNumber: 2,
  };
  const bmdQrcode: BallotPageQrcode = {
    data: encodeBallot(election, {
      electionHash,
      ballotStyleId: election.ballotStyles[0].id,
      precinctId: election.precincts[0].id,
      ballotType: BallotType.Standard,
      isTestMode: false,
      votes: {},
    }),
    position: 'top',
  };
  const frontHmpbQrcode: BallotPageQrcode = {
    data: encodeHmpbBallotPageMetadata(election, frontHmpbMetadata),
    position: 'bottom',
  };
  const backHmpbQrcode: BallotPageQrcode = {
    data: encodeHmpbBallotPageMetadata(election, backHmpbMetadata),
    position: 'bottom',
  };

  // front HMPB / back HMPB
  expect(
    normalizeSheetMetadata(electionSampleDefinition, [
      frontHmpbQrcode,
      backHmpbQrcode,
    ])
  ).toEqual([frontHmpbQrcode, backHmpbQrcode]);

  // front HMPB / back missing
  expect(
    normalizeSheetMetadata(electionSampleDefinition, [
      frontHmpbQrcode,
      undefined,
    ])
  ).toEqual([frontHmpbQrcode, backHmpbQrcode]);

  // front missing / back rotated HMPB
  expect(
    normalizeSheetMetadata(electionSampleDefinition, [
      undefined,
      { ...backHmpbQrcode, position: 'top' },
    ])
  ).toEqual([
    { ...frontHmpbQrcode, position: 'top' },
    { ...backHmpbQrcode, position: 'top' },
  ]);

  // front rotated HMPB / back missing
  expect(
    normalizeSheetMetadata(electionSampleDefinition, [
      { ...backHmpbQrcode, position: 'top' },
      undefined,
    ])
  ).toEqual([
    { ...backHmpbQrcode, position: 'top' },
    { ...frontHmpbQrcode, position: 'top' },
  ]);

  // front missing / back HMPB
  expect(
    normalizeSheetMetadata(electionSampleDefinition, [
      undefined,
      backHmpbQrcode,
    ])
  ).toEqual([frontHmpbQrcode, backHmpbQrcode]);

  // front missing / back missing
  expect(
    normalizeSheetMetadata(electionSampleDefinition, [undefined, undefined])
  ).toEqual([undefined, undefined]);

  // front BMD / back missing
  expect(
    normalizeSheetMetadata(electionSampleDefinition, [bmdQrcode, undefined])
  ).toEqual([bmdQrcode, undefined]);

  // front missing / back BMD
  expect(
    normalizeSheetMetadata(electionSampleDefinition, [undefined, bmdQrcode])
  ).toEqual([undefined, bmdQrcode]);

  // front rotated BMD / back missing
  expect(
    normalizeSheetMetadata(electionSampleDefinition, [
      { ...bmdQrcode, position: 'bottom' },
      undefined,
    ])
  ).toEqual([{ ...bmdQrcode, position: 'bottom' }, undefined]);

  // front rotated BMD / back missing
  expect(
    normalizeSheetMetadata(electionSampleDefinition, [
      undefined,
      { ...bmdQrcode, position: 'bottom' },
    ])
  ).toEqual([undefined, { ...bmdQrcode, position: 'bottom' }]);
});
