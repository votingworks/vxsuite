import { Icons, P } from '@votingworks/ui';
import type { PrinterStatus } from '@votingworks/scan-backend';
import { assert, throwIllegalValue } from '@votingworks/basics';
import React from 'react';
import { getConfig, getPrinterStatus } from '../../api';
import { LoadPaperButton } from './load_paper_button';
import { UseCurrentPaperButton } from './use_current_paper_button';

function StatusText({
  printerStatus,
  hasPaperBeenLoaded,
}: {
  printerStatus: PrinterStatus;
  hasPaperBeenLoaded: boolean;
}) {
  assert(printerStatus.scheme === 'hardware-v4');

  switch (printerStatus.state) {
    case 'error':
      return (
        <P>
          <Icons.X color="danger" /> Printer error detected
        </P>
      );
    case 'no-paper':
      return (
        <P>
          <Icons.Warning color="warning" /> Must load paper to use printer
        </P>
      );
    case 'cover-open':
      return (
        <P>
          <Icons.Warning color="warning" /> Printer cover is open
        </P>
      );
    case 'idle':
      if (!hasPaperBeenLoaded) {
        return (
          <P>
            <Icons.Warning color="warning" /> Must reload paper and test for the
            current election
          </P>
        );
      }
      return (
        <P>
          <Icons.Done /> Printer is loaded and ready
        </P>
      );
    /* istanbul ignore next */
    default:
      throwIllegalValue(printerStatus, 'state');
  }
}

export function ElectionManagerPrinterTabContent(): JSX.Element | null {
  const configQuery = getConfig.useQuery();
  const printerStatusQuery = getPrinterStatus.useQuery();

  if (!configQuery.isSuccess || !printerStatusQuery.isSuccess) {
    return null;
  }

  const printerStatus = printerStatusQuery.data;
  const { hasPaperBeenLoaded } = configQuery.data;

  if (printerStatus.scheme === 'hardware-v3') {
    return null;
  }

  return (
    <React.Fragment>
      <StatusText
        printerStatus={printerStatus}
        hasPaperBeenLoaded={hasPaperBeenLoaded}
      />
      <P>
        <LoadPaperButton
          text={printerStatus.state === 'idle' ? 'Reload Paper' : 'Load Paper'}
          isPrimary={!hasPaperBeenLoaded}
        />{' '}
        {printerStatus.state === 'idle' && !hasPaperBeenLoaded && (
          <UseCurrentPaperButton />
        )}
      </P>
    </React.Fragment>
  );
}
