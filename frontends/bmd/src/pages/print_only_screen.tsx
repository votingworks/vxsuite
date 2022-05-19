import { assert } from '@votingworks/utils';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import {
  BallotStyleId,
  ElectionDefinition,
  PrecinctId,
  VotesDict,
} from '@votingworks/types';
import {
  BmdPaperBallot,
  Loading,
  Main,
  Prose,
  Screen,
  TestMode,
  Text,
} from '@votingworks/ui';

import { MarkVoterCardFunction, Printer } from '../config/types';

const Graphic = styled.img`
  margin: 0 auto -1rem;
  height: 40vw;
`;

const TopLeftContent = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  margin: 0.5rem 0.75rem;
`;

interface Props {
  ballotStyleId?: BallotStyleId;
  ballotsPrintedCount: number;
  electionDefinition: ElectionDefinition;
  isLiveMode: boolean;
  isVoterCardPresent: boolean;
  markVoterCardPrinted: MarkVoterCardFunction;
  precinctId?: PrecinctId;
  printer: Printer;
  useEffectToggleLargeDisplay: () => void;
  showNoChargerAttachedWarning: boolean;
  updateTally: () => void;
  votes?: VotesDict;
}

export const printingMessageTimeoutSeconds = 5;

export function PrintOnlyScreen({
  ballotStyleId,
  ballotsPrintedCount,
  electionDefinition,
  isLiveMode,
  isVoterCardPresent,
  markVoterCardPrinted,
  precinctId,
  printer,
  useEffectToggleLargeDisplay,
  showNoChargerAttachedWarning,
  updateTally,
  votes,
}: Props): JSX.Element {
  const printerTimer = useRef(0);
  const [okToPrint, setOkToPrint] = useState(true);
  const [isPrinted, updateIsPrinted] = useState(false);
  const isCardVotesEmpty = votes === undefined;
  const { election } = electionDefinition;

  const isReadyToPrint =
    election &&
    ballotStyleId &&
    precinctId &&
    isVoterCardPresent &&
    !isCardVotesEmpty &&
    !isPrinted;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(useEffectToggleLargeDisplay, []);

  const printBallot = useCallback(async () => {
    const isUsed = await markVoterCardPrinted();
    /* istanbul ignore else */
    if (isUsed) {
      await printer.print({ sides: 'one-sided' });
      updateTally();
      printerTimer.current = window.setTimeout(() => {
        updateIsPrinted(true);
      }, printingMessageTimeoutSeconds * 1000);
    }
  }, [markVoterCardPrinted, printer, updateTally]);

  useEffect(() => {
    if (isReadyToPrint && okToPrint) {
      setOkToPrint(false);

      void printBallot();
    }
  }, [votes, printBallot, isReadyToPrint, okToPrint, setOkToPrint]);

  useEffect(() => {
    if (!isVoterCardPresent) {
      updateIsPrinted(false);

      // once card is taken out, ok to print again
      if (!okToPrint) {
        setOkToPrint(true);
      }
    }
  }, [isVoterCardPresent, okToPrint, setOkToPrint]);

  useEffect(() => {
    return () => {
      clearTimeout(printerTimer.current);
    };
  }, []);

  function renderContent() {
    if (isVoterCardPresent && isCardVotesEmpty) {
      return (
        <Prose textCenter>
          <h1>Empty Card</h1>
          <p>This card does not contain any votes.</p>
        </Prose>
      );
    }
    if (isPrinted) {
      return (
        <React.Fragment>
          <Graphic
            src="/images/verify-and-scan.svg"
            alt="Verify and Scan Your Official Ballot"
            aria-hidden
          />
          <Prose textCenter>
            <h1>Verify and Scan Your Official Ballot</h1>
            <p>
              Verify the votes on your official ballot are correct. <br />
              Insert your ballot into the ballot scanner.
            </p>
          </Prose>
        </React.Fragment>
      );
    }
    if (isReadyToPrint) {
      return (
        <React.Fragment>
          <Graphic
            src="/images/printing-ballot.svg"
            alt="Printing Ballot"
            aria-hidden
          />
          <Prose textCenter>
            <h1>
              <Loading>Printing your official ballot</Loading>
            </h1>
          </Prose>
        </React.Fragment>
      );
    }
    return (
      <React.Fragment>
        <Graphic src="/images/insert-card.svg" alt="Insert Card" aria-hidden />
        <Prose textCenter>
          <h1>Insert Card</h1>
          <p>
            Insert Card to print your official ballot.
            {showNoChargerAttachedWarning && (
              <React.Fragment>
                <br />
                <Text as="span" warning small>
                  <strong>No Power Detected.</strong> Please ask a poll worker
                  to plug in the power cord for this machine.
                </Text>
              </React.Fragment>
            )}
          </p>
        </Prose>
      </React.Fragment>
    );
  }

  return (
    <React.Fragment>
      <Screen white>
        {!isVoterCardPresent && !isLiveMode && <TestMode />}
        <Main centerChild style={{ position: 'relative' }}>
          {renderContent()}
          {!isVoterCardPresent && (
            <TopLeftContent>
              <small>
                Ballots Printed: <strong>{ballotsPrintedCount}</strong>
              </small>
            </TopLeftContent>
          )}
        </Main>
      </Screen>
      {isReadyToPrint &&
        // TODO: remove `assert` here once we upgrade to TS 4.4 (https://devblogs.microsoft.com/typescript/announcing-typescript-4-4-beta/#cfa-aliased-conditions)
        (assert(
          typeof ballotStyleId !== 'undefined' &&
            typeof precinctId !== 'undefined' &&
            typeof votes !== 'undefined'
        ),
        (
          <BmdPaperBallot
            ballotStyleId={ballotStyleId}
            electionDefinition={electionDefinition}
            isLiveMode={isLiveMode}
            precinctId={precinctId}
            votes={votes}
          />
        ))}
    </React.Fragment>
  );
}
