import { find } from '@votingworks/basics';
import type { Election, Party, PrinterStatus } from '@votingworks/types';
import { getBlockingPrinterStateReason } from '@votingworks/ui';

export function getPartyOptions(election: Election): Party[] {
  const uniquePartyIds = new Set(
    election.ballotStyles
      .map((bs) => bs.partyId)
      .filter((partyId) => partyId !== undefined)
  );
  const parties = Array.from(uniquePartyIds).map((partyId) =>
    // @coverage-defer
    find(election.parties, (p) => p.id === partyId)
  );
  return parties;
}

export function isPrinterReady(printer: PrinterStatus): boolean {
  return printer.connected && !getBlockingPrinterStateReason(printer);
}
