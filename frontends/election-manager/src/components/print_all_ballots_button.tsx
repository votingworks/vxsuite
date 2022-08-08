import React, {
  useCallback,
  useContext,
  useState,
  useMemo,
  useEffect,
} from 'react';
import styled from 'styled-components';
import { BallotLocales, getPrecinctById } from '@votingworks/types';

import {
  assert,
  throwIllegalValue,
  BallotStyleData,
  sleep,
} from '@votingworks/utils';
import {
  Modal,
  Prose,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
  useCancelablePromise,
  Loading,
  useLock,
} from '@votingworks/ui';
import { LogEventId } from '@votingworks/logging';
import pluralize from 'pluralize';
import {
  getBallotStylesData,
  sortBallotStyleDataByPrecinct,
} from '../utils/election';

import { AppContext } from '../contexts/app_context';
import { HandMarkedPaperBallot } from './hand_marked_paper_ballot';
import { Button } from './button';
import { LinkButton } from './link_button';

import {
  BallotMode,
  ballotModeToReadableString,
  PrintableBallotType,
} from '../config/types';
import { BallotTypeToggle } from './ballot_type_toggle';
import { BallotModeToggle } from './ballot_mode_toggle';
import { PrintableArea } from './printable_area';
import { DEFAULT_LOCALE } from '../config/globals';
import { BallotCopiesInput } from './ballot_copies_input';
import { PrintBallotButtonText } from './print_ballot_button_text';

export const PRINTER_WARMUP_TIME = 8300;
export const TWO_SIDED_PRINT_TIME = 3300;
export const PRINTER_COOLDOWN_TIME = 5000;

const CenteredOptions = styled.div`
  text-align: center;
  & > :last-child {
    margin-bottom: 0;
  }
`;

type ModalState = 'no-printer' | 'options' | 'printing';

const defaultBallotLocales: BallotLocales = { primary: DEFAULT_LOCALE };

interface Props {
  draftMode?: boolean;
}

export function PrintAllBallotsButton({ draftMode }: Props): JSX.Element {
  const makeCancelable = useCancelablePromise();
  const {
    electionDefinition,
    auth,
    logger,
    hasPrinterAttached,
    printer,
    addPrintedBallot,
  } = useContext(AppContext);
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth));
  const userRole = auth.user.role;
  const { election, electionHash } = electionDefinition;

  const needsPrinter = window.kiosk && !hasPrinterAttached;
  const initialState: ModalState = needsPrinter ? 'no-printer' : 'options';
  const printLock = useLock();

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalState, setModalState] = useState<ModalState>(initialState);
  const [printFailed, setPrintFailed] = useState(false);

  const [ballotMode, setBallotMode] = useState(
    draftMode ? BallotMode.Draft : BallotMode.Official
  );
  const [isAbsentee, setIsAbsentee] = useState(true);
  const [ballotCopies, setBallotCopies] = useState(1);

  const [ballotIndex, setBallotIndex] = useState<number>();
  const ballotStyles = useMemo<BallotStyleData[]>(
    () =>
      sortBallotStyleDataByPrecinct(election, getBallotStylesData(election)),
    [election]
  );

  useEffect(() => {
    if (hasPrinterAttached && modalState === 'no-printer') {
      setModalState('options');
    } else if (!hasPrinterAttached && modalState === 'options') {
      setModalState('no-printer');
    }
  }, [modalState, hasPrinterAttached]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setModalState(initialState);
    setBallotIndex(undefined);
    setPrintFailed(false);
  }, [initialState]);

  function startPrint() {
    setBallotIndex(0);
    setModalState('printing');
  }

  const logBallotsPrinted = useCallback(async () => {
    assert(ballotIndex !== undefined);
    const { precinctId, ballotStyleId } = ballotStyles[ballotIndex];

    await logger.log(LogEventId.BallotPrinted, userRole, {
      disposition: 'success',
      message: `${ballotCopies} ${ballotMode} ${
        isAbsentee ? 'absentee' : 'precinct'
      } ballots printed for precinct ${precinctId} in ballot style ${ballotStyleId}`,
      ballotMode,
      isAbsentee,
      ballotCopies,
      ballotStyleId,
      precinctId,
    });

    if (ballotMode === BallotMode.Official) {
      const type = isAbsentee
        ? PrintableBallotType.Absentee
        : PrintableBallotType.Precinct;
      addPrintedBallot({
        ballotStyleId,
        precinctId,
        locales: defaultBallotLocales,
        numCopies: ballotCopies,
        printedAt: new Date().toISOString(),
        type,
      });
    }
  }, [
    addPrintedBallot,
    ballotCopies,
    ballotIndex,
    ballotMode,
    ballotStyles,
    isAbsentee,
    logger,
    userRole,
  ]);

  const advancePrinting = useCallback(async () => {
    assert(ballotIndex !== undefined);
    if (ballotIndex < ballotStyles.length - 1) {
      await makeCancelable(
        sleep(PRINTER_WARMUP_TIME + ballotCopies * TWO_SIDED_PRINT_TIME)
      );
      setBallotIndex(ballotIndex + 1);
    } else {
      // For the last print job, rather than waiting for all pages to finish
      // printing, free up the UI from the print modal
      await makeCancelable(sleep(PRINTER_COOLDOWN_TIME));
      closeModal();
    }
  }, [
    ballotCopies,
    ballotIndex,
    ballotStyles.length,
    closeModal,
    makeCancelable,
  ]);

  const onPrintError = useCallback(async () => {
    setPrintFailed(true);
    setModalState('no-printer');
    setBallotIndex(undefined);
    await logger.log(LogEventId.BallotPrinted, userRole, {
      disposition: 'failure',
      message:
        'Failed to print ballots while printing all ballot styles because printer was disconnected.',
      result: 'User directed to reconnect printer.',
      error: 'Printer disconnected.',
    });
  }, [logger, userRole]);

  const onRendered = useCallback(async () => {
    assert(ballotIndex !== undefined);
    if (printLock.lock()) {
      if (needsPrinter) {
        printLock.unlock();
        return onPrintError();
      }
      await printer.print({
        sides: 'two-sided-long-edge',
        copies: ballotCopies,
      });
      await logBallotsPrinted();
      await advancePrinting();
      printLock.unlock();
    }
  }, [
    ballotIndex,
    printLock,
    needsPrinter,
    printer,
    ballotCopies,
    logBallotsPrinted,
    advancePrinting,
    onPrintError,
  ]);

  let mainContent = null;
  let actions = null;
  let onOverlayClick: VoidFunction | undefined = closeModal;

  switch (modalState) {
    case 'no-printer':
      mainContent = (
        <Prose>
          <h1>
            {printFailed ? 'Printer Disconnected' : 'No Printer Detected'}
          </h1>
          <p>
            {printFailed
              ? 'Printing stopped because the printer was disconnected. Reconnect the printer to try again.'
              : 'Please connect the printer to print all ballot styles.'}
          </p>
        </Prose>
      );
      actions = <LinkButton onPress={closeModal}>Cancel</LinkButton>;
      break;

    case 'options':
      mainContent = (
        <Prose>
          <h1>Print All Ballot Styles</h1>
          <p>Select the ballot type and number of copies to print:</p>
          <CenteredOptions>
            {!draftMode && (
              <p>
                <BallotModeToggle
                  ballotMode={ballotMode}
                  setBallotMode={setBallotMode}
                />
              </p>
            )}
            <p>
              <BallotTypeToggle
                isAbsentee={isAbsentee}
                setIsAbsentee={setIsAbsentee}
              />
            </p>
            <p>
              Copies{' '}
              <BallotCopiesInput
                ballotCopies={ballotCopies}
                setBallotCopies={setBallotCopies}
              />
            </p>
          </CenteredOptions>
        </Prose>
      );
      actions = (
        <React.Fragment>
          <Button
            primary
            onPress={() => startPrint()}
            warning={!draftMode && ballotMode !== BallotMode.Official}
          >
            <PrintBallotButtonText
              ballotCopies={ballotCopies * ballotStyles.length}
              ballotMode={ballotMode}
              isAbsentee={isAbsentee}
              election={election}
            />
          </Button>
          <LinkButton onPress={closeModal}>Cancel</LinkButton>
        </React.Fragment>
      );
      break;

    case 'printing': {
      assert(ballotIndex !== undefined);
      const { ballotStyleId, precinctId } = ballotStyles[ballotIndex];
      const precinct = getPrecinctById({ election, precinctId });
      mainContent = (
        <React.Fragment>
          <Prose textCenter>
            <Loading>
              {`Printing ${ballotModeToReadableString(ballotMode)} ${pluralize(
                'Ballot',
                ballotCopies,
                false
              )} (${ballotIndex + 1} of ${ballotStyles.length})`}
            </Loading>
            <p>
              Precinct: <strong>{precinct?.name}</strong>, Ballot Style:{' '}
              <strong>{ballotStyleId}</strong>
            </p>
          </Prose>
          <PrintableArea>
            <HandMarkedPaperBallot
              ballotStyleId={ballotStyleId}
              election={election}
              electionHash={electionHash}
              ballotMode={ballotMode}
              isAbsentee={isAbsentee}
              precinctId={precinctId}
              onRendered={onRendered}
              locales={defaultBallotLocales}
            />
          </PrintableArea>
        </React.Fragment>
      );
      onOverlayClick = undefined;
      break;
    }

    default:
      throwIllegalValue(modalState);
  }

  return (
    <React.Fragment>
      <LinkButton small onPress={() => setIsModalOpen(true)}>
        Print All
      </LinkButton>
      {isModalOpen && (
        <Modal
          content={mainContent}
          onOverlayClick={onOverlayClick}
          actions={actions}
        />
      )}
    </React.Fragment>
  );
}
