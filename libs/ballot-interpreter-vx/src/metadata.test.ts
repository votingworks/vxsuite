import { BallotType } from '@votingworks/types';
import { croppedQrCode } from '../test/fixtures';
import * as choctaw2020Special from '../test/fixtures/choctaw-2020-09-22-f30480cc99';
import {
  blankPage1 as urlQrCodePage1,
  electionDefinition as urlQrCodeElectionDefinition,
} from '../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library';
import { decodeSearchParams, detect } from './metadata';

test('read base64-encoded binary metadata from QR code image', async () => {
  expect(
    await detect(
      choctaw2020Special.electionDefinition,
      await choctaw2020Special.blankPage1.imageData()
    )
  ).toEqual({
    metadata: {
      ballotId: undefined,
      ballotStyleId: '1',
      ballotType: 0,
      electionHash: '02f807b005e006da160b',
      isTestMode: false,
      locales: {
        primary: 'en-US',
        secondary: undefined,
      },
      pageNumber: 1,
      precinctId: '6538',
    },
    flipped: false,
  });
});

describe('old-style URL-based metadata', () => {
  test('URL decoding', () => {
    expect(
      decodeSearchParams(
        choctaw2020Special.electionDefinition,
        new URLSearchParams([
          ['t', 'tt'],
          ['pr', 'Acme & Co'],
          ['bs', 'Ballot Style Orange'],
          ['p', '2-3'],
          ['l1', 'en-US'],
          ['l2', 'es-US'],
        ])
      )
    ).toEqual({
      locales: { primary: 'en-US', secondary: 'es-US' },
      ballotStyleId: 'Ballot Style Orange',
      precinctId: 'Acme & Co',
      isTestMode: true,
      pageNumber: 2,
      electionHash:
        '51c1e18baa5050683a4e0e647c3835c5f6ba550fed8bac779029902bd5bad7a4',
      ballotType: BallotType.Standard,
    });
  });

  test('omitted secondary locale code', () => {
    expect(
      decodeSearchParams(
        choctaw2020Special.electionDefinition,
        new URLSearchParams([
          ['t', 'tt'],
          ['pr', 'Acme & Co'],
          ['bs', 'Ballot Style Orange'],
          ['p', '2-3'],
          ['l1', 'en-US'],
        ])
      )
    ).toEqual({
      locales: { primary: 'en-US' },
      ballotStyleId: 'Ballot Style Orange',
      precinctId: 'Acme & Co',
      isTestMode: true,
      pageNumber: 2,
      electionHash:
        '51c1e18baa5050683a4e0e647c3835c5f6ba550fed8bac779029902bd5bad7a4',
      ballotType: BallotType.Standard,
    });
  });

  test('live mode', () => {
    expect(
      decodeSearchParams(
        choctaw2020Special.electionDefinition,
        new URLSearchParams([
          ['t', '_t'],
          ['pr', ''],
          ['bs', ''],
          ['p', '1-1'],
          ['l1', 'en-US'],
        ])
      )
    ).toEqual(expect.objectContaining({ isTestMode: false }));
  });

  test('cropped QR code', async () => {
    await expect(
      detect(urlQrCodeElectionDefinition, await croppedQrCode.imageData())
    ).rejects.toThrow('Expected QR code not found.');
  });

  test('ballot', async () => {
    expect(
      await detect(
        urlQrCodeElectionDefinition,
        await urlQrCodePage1.imageData()
      )
    ).toEqual({
      metadata: {
        locales: { primary: 'en-US' },
        ballotStyleId: '77',
        precinctId: '42',
        isTestMode: false,
        pageNumber: 1,
        electionHash: urlQrCodeElectionDefinition.electionHash,
        ballotType: BallotType.Standard,
      },
      flipped: false,
    });
  });

  test('upside-down ballot images', async () => {
    expect(
      await detect(
        urlQrCodeElectionDefinition,
        await urlQrCodePage1.imageData({ flipped: true })
      )
    ).toEqual({
      metadata: {
        locales: { primary: 'en-US' },
        ballotStyleId: '77',
        precinctId: '42',
        isTestMode: false,
        pageNumber: 1,
        electionHash: urlQrCodeElectionDefinition.electionHash,
        ballotType: BallotType.Standard,
      },
      flipped: true,
    });
  });
});
