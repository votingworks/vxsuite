import React from 'react';
import type { ElectionDefinition, PollsState } from '@votingworks/types';
import {
  Callout,
  IPP_PRINTER_STATE_REASON_MESSAGES,
  Main,
  Screen,
  ElectionInfoBar,
  InsertCardImage,
  H1,
  P,
  TestModeBanner,
  type CardInsertionDirection,
} from '@votingworks/ui';

import { throwIllegalValue } from '@votingworks/basics';

interface Props {
  cardInsertionDirection?: CardInsertionDirection;
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
  isLiveMode: boolean;
  isPrinterTonerLow?: boolean;
  pollingPlaceId?: string;
  pollsState: PollsState;
}

export function InsertCardScreen({
  cardInsertionDirection,
  electionDefinition,
  electionPackageHash,
  isLiveMode,
  isPrinterTonerLow,
  pollingPlaceId,
  pollsState,
}: Props): JSX.Element | null {
  const mainText = (() => {
    switch (pollsState) {
      case 'polls_closed_initial':
        return (
          <React.Fragment>
            <H1>Polls Closed</H1>
            <P>Insert a poll worker card to open.</P>
          </React.Fragment>
        );
      case 'polls_open':
        return <H1>Insert Card</H1>;
      case 'polls_paused':
        return (
          <React.Fragment>
            <H1>Voting Paused</H1>
            <P>Insert a poll worker card to resume voting.</P>
          </React.Fragment>
        );
      case 'polls_closed_final':
        return (
          <React.Fragment>
            <H1>Polls Closed</H1>
            <P>Voting is complete.</P>
          </React.Fragment>
        );
      default: {
        throwIllegalValue(pollsState);
      }
    }
  })();

  return (
    <Screen>
      {!isLiveMode && <TestModeBanner />}
      <Main centerChild>
        <P>
          <InsertCardImage cardInsertionDirection={cardInsertionDirection} />
        </P>
        {mainText}
        {isPrinterTonerLow && pollsState !== 'polls_closed_final' && (
          <Callout icon="Warning" color="warning">
            {IPP_PRINTER_STATE_REASON_MESSAGES['toner-low']}
          </Callout>
        )}
      </Main>
      <ElectionInfoBar
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
        pollingPlaceId={pollingPlaceId}
      />
    </Screen>
  );
}
