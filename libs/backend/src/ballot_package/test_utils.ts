import JsZip from 'jszip';
import { BallotPackage, BallotPackageFileName } from '@votingworks/types';
import { Buffer } from 'buffer';
import {
  BALLOT_PACKAGE_FOLDER,
  generateElectionBasedSubfolderName,
} from '@votingworks/utils';
import { MockFileTree } from '@votingworks/usb-drive';

/**
 * Builds a ballot package zip archive from a BallotPackage object.
 */
export function createBallotPackageZipArchive(
  ballotPackage: BallotPackage
): Promise<Buffer> {
  const jsZip = new JsZip();
  jsZip.file(
    BallotPackageFileName.ELECTION,
    ballotPackage.electionDefinition.electionData
  );
  if (ballotPackage.systemSettings) {
    jsZip.file(
      BallotPackageFileName.SYSTEM_SETTINGS,
      JSON.stringify(ballotPackage.systemSettings, null, 2)
    );
  }
  if (ballotPackage.uiStrings) {
    jsZip.file(
      BallotPackageFileName.APP_STRINGS,
      JSON.stringify(ballotPackage.uiStrings, null, 2)
    );
  }
  if (ballotPackage.uiStringAudioIds) {
    jsZip.file(
      BallotPackageFileName.UI_STRING_AUDIO_IDS,
      JSON.stringify(ballotPackage.uiStringAudioIds, null, 2)
    );
  }
  if (ballotPackage.uiStringAudioClips) {
    jsZip.file(
      BallotPackageFileName.AUDIO_CLIPS,
      JSON.stringify(ballotPackage.uiStringAudioClips, null, 2)
    );
  }
  return jsZip.generateAsync({ type: 'nodebuffer' });
}

/**
 * Helper for mocking the file contents of on a USB drive with a ballot package
 * saved to it.
 */
export async function mockBallotPackageFileTree(
  ballotPackage: BallotPackage
): Promise<MockFileTree> {
  const { election, electionHash } = ballotPackage.electionDefinition;
  return {
    [generateElectionBasedSubfolderName(election, electionHash)]: {
      [BALLOT_PACKAGE_FOLDER]: {
        'test-ballot-package.zip':
          await createBallotPackageZipArchive(ballotPackage),
      },
    },
  };
}
