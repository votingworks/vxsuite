import JsZip from 'jszip';
import { BallotPackage } from '@votingworks/types';
import { Buffer } from 'buffer';

/**
 * Builds a ballot package zip archive from a BallotPackage object.
 */
export function createBallotPackageZipArchive(
  ballotPackage: BallotPackage
): Promise<Buffer> {
  const jsZip = new JsZip();
  jsZip.file('election.json', ballotPackage.electionDefinition.electionData);
  if (ballotPackage.systemSettings) {
    jsZip.file(
      'systemSettings.json',
      JSON.stringify(ballotPackage.systemSettings, null, 2)
    );
  }
  return jsZip.generateAsync({ type: 'nodebuffer' });
}
