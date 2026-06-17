// istanbul ignore file - test helpers
import {
  DEFAULT_SYSTEM_SETTINGS,
  ElectionPackage,
  ElectionPackageFileName,
  LATEST_METADATA,
} from '@votingworks/types';
import { Buffer } from 'node:buffer';
import {
  ELECTION_PACKAGE_FOLDER,
  generateElectionBasedSubfolderName,
} from '@votingworks/utils';
import { MockFileTree } from '@votingworks/usb-drive';
import { zipFile } from '@votingworks/test-utils';

/**
 * An election package for building test fixtures, where only the election
 * definition is required and any subset of the other files may be provided.
 * Used to build packages with arbitrary file combinations, including ones
 * intentionally missing files to exercise reader error paths.
 */
export type PartialElectionPackage = Partial<ElectionPackage> &
  Pick<ElectionPackage, 'electionDefinition'>;

/**
 * Builds an election package zip archive from a ElectionPackage object.
 */
export function createElectionPackageZipArchive(
  electionPackage: PartialElectionPackage
): Promise<Buffer> {
  // metadata.json, systemSettings.json, and appStrings.json are required in a
  // real package, so default any that aren't provided to produce a valid
  // package. Audio files are optional and handled below.
  const zipContents: Record<string, Buffer | string> = {
    [ElectionPackageFileName.ELECTION]:
      electionPackage.electionDefinition.electionData,
    [ElectionPackageFileName.METADATA]: JSON.stringify(
      electionPackage.metadata ?? LATEST_METADATA,
      null,
      2
    ),
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(
      electionPackage.systemSettings ?? DEFAULT_SYSTEM_SETTINGS,
      null,
      2
    ),
    [ElectionPackageFileName.APP_STRINGS]: JSON.stringify(
      electionPackage.uiStrings ?? {},
      null,
      2
    ),
  };

  // Audio files are optional in an election package, so only include them when
  // provided.
  if (electionPackage.uiStringAudioIds) {
    zipContents[ElectionPackageFileName.AUDIO_IDS] = JSON.stringify(
      electionPackage.uiStringAudioIds,
      null,
      2
    );
  }
  if (electionPackage.uiStringAudioClips) {
    zipContents[ElectionPackageFileName.AUDIO_CLIPS] =
      electionPackage.uiStringAudioClips
        .map((clip) => JSON.stringify(clip))
        .join('\n');
  }

  if (electionPackage.ballots && electionPackage.ballots.length > 0) {
    zipContents[ElectionPackageFileName.BALLOTS] = electionPackage.ballots
      .map((ballot) => JSON.stringify(ballot))
      .join('\n');
  }

  return zipFile(zipContents);
}

/**
 * Helper for mocking the file contents of on a USB drive with an election package
 * saved to it.
 */
export async function mockElectionPackageFileTree(
  electionPackage: PartialElectionPackage
): Promise<MockFileTree> {
  const { election, ballotHash } = electionPackage.electionDefinition;
  return {
    [generateElectionBasedSubfolderName(election, ballotHash)]: {
      [ELECTION_PACKAGE_FOLDER]: {
        'test-election-package.zip':
          await createElectionPackageZipArchive(electionPackage),
      },
    },
  };
}
