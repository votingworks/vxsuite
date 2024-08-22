import { Icons, P } from '@votingworks/ui';
import type { PrinterStatus } from '@votingworks/scan-backend';
import { assert, throwIllegalValue } from '@votingworks/basics';
import React from 'react';
import styled from 'styled-components';
import { getPrinterStatus } from '../../api';
import { ElectionManagerLoadPaperButton } from './election_manager_load_paper_button';
import { PrintTestPageButton } from './print_test_page_button';

export const RELOAD_REMINDER_TEXT =
  'If the current roll of paper is left over from a previous election, make sure to replace it or ensure that it has enough paper for the current election.';

function StatusText({ printerStatus }: { printerStatus: PrinterStatus }) {
  assert(printerStatus.scheme === 'hardware-v4');

  switch (printerStatus.state) {
    case 'error':
      return (
        <P>
          <Icons.Danger color="danger" />{' '}
          {printerStatus.type === 'disconnected'
            ? 'The printer is disconnected'
            : 'The printer encountered an error'}
        </P>
      );
    case 'no-paper':
      return (
        <P>
          <Icons.Warning color="warning" /> The printer is not loaded with paper
        </P>
      );
    case 'cover-open':
      return (
        <P>
          <Icons.Warning color="warning" /> The paper roll holder is not
          attached to the printer
        </P>
      );
    case 'idle':
      return (
        <P>
          <Icons.Done /> The printer is loaded with paper
        </P>
      );
    /* istanbul ignore next */
    default:
      throwIllegalValue(printerStatus, 'state');
  }
}

const ButtonRow = styled(P)`
  display: flex;
  gap: 0.5rem;
`;

export function ElectionManagerPrinterTabContent(): JSX.Element | null {
  const printerStatusQuery = getPrinterStatus.useQuery();

  if (!printerStatusQuery.isSuccess) {
    return null;
  }

  const printerStatus = printerStatusQuery.data;

  if (printerStatus.scheme === 'hardware-v3') {
    return null;
  }

  return (
    <React.Fragment>
      <StatusText printerStatus={printerStatus} />
      <ButtonRow>
        <ElectionManagerLoadPaperButton
          isPrimary={printerStatus.state === 'no-paper'}
        />
        <PrintTestPageButton />
      </ButtonRow>
      {printerStatus.state === 'idle' && <P>{RELOAD_REMINDER_TEXT}</P>}
    </React.Fragment>
  );
}
