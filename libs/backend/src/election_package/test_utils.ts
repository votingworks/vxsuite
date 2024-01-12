import JsZip from 'jszip';
import { ElectionPackage, ElectionPackageFileName } from '@votingworks/types';
import { Buffer } from 'buffer';
import {
  ELECTION_PACKAGE_FOLDER,
  generateElectionBasedSubfolderName,
} from '@votingworks/utils';
import { MockFileTree } from '@votingworks/usb-drive';

/**
 * Builds an election package zip archive from a ElectionPackage object.
 */
export function createElectionPackageZipArchive(
  electionPackage: ElectionPackage
): Promise<Buffer> {
  const jsZip = new JsZip();
  jsZip.file(
    ElectionPackageFileName.ELECTION,
    electionPackage.electionDefinition.electionData
  );
  if (electionPackage.systemSettings) {
    jsZip.file(
      ElectionPackageFileName.SYSTEM_SETTINGS,
      JSON.stringify(electionPackage.systemSettings, null, 2)
    );
  }
  if (electionPackage.uiStrings) {
    jsZip.file(
      ElectionPackageFileName.APP_STRINGS,
      JSON.stringify(electionPackage.uiStrings, null, 2)
    );
  }
  if (electionPackage.uiStringAudioIds) {
    jsZip.file(
      ElectionPackageFileName.AUDIO_IDS,
      JSON.stringify(electionPackage.uiStringAudioIds, null, 2)
    );
  }
  if (electionPackage.uiStringAudioClips) {
    jsZip.file(
      ElectionPackageFileName.AUDIO_CLIPS,
      electionPackage.uiStringAudioClips
        .map((clip) => JSON.stringify(clip))
        .join('\n')
    );
  }
  return jsZip.generateAsync({ type: 'nodebuffer' });
}

/**
 * Helper for mocking the file contents of on a USB drive with an election package
 * saved to it.
 */
export async function mockElectionPackageFileTree(
  electionPackage: ElectionPackage
): Promise<MockFileTree> {
  const { election, electionHash } = electionPackage.electionDefinition;
  return {
    [generateElectionBasedSubfolderName(election, electionHash)]: {
      [ELECTION_PACKAGE_FOLDER]: {
        'test-election-package.zip':
          await createElectionPackageZipArchive(electionPackage),
      },
    },
  };
}
