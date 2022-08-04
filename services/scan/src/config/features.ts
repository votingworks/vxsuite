import { asBoolean } from '@votingworks/utils';

/**
 * Determines whether exporting ballot images for write-in adjudication is enabled.
 *
 * To enable exporting ballot images in Store.exportCvrs, add this line to `frontends/election-manager/.env.local`:
 *
 *     ENABLE_WRITE_IN_ADJUDICATION_EXPORT_BALLOT_IMAGES=true
 *
 * To disable it, remove the line or comment it out. Restarting the server is required.
 *
 */
export function isWriteInAdjudicationBallotImageExportEnabled(): boolean {
  return asBoolean(
    process.env['ENABLE_WRITE_IN_ADJUDICATION_EXPORT_BALLOT_IMAGES']
  );
}
