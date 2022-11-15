import React, { useContext, useState, useMemo, useEffect } from 'react';
import styled from 'styled-components';

import { Admin } from '@votingworks/api';
import { LogEventId } from '@votingworks/logging';
import { BallotLocale, getPrecinctById } from '@votingworks/types';
import {
  assert,
  throwIllegalValue,
  BallotStyleData,
  sleep,
} from '@votingworks/utils';
import {
  Button,
  Modal,
  Prose,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
  useCancelablePromise,
  Loading,
  printElementWhenReady,
} from '@votingworks/ui';
import pluralize from 'pluralize';
import {
  getBallotStylesData,
  getSuperBallotStyleData,
  isSuperBallotStyle,
  sortBallotStyleDataByPrecinct,
} from '../utils/election';

import { AppContext } from '../contexts/app_context';
import { HandMarkedPaperBallot } from './hand_marked_paper_ballot';
import { LinkButton } from './link_button';

import {
  ballotModeToReadableString,
  PrintableBallotType,
} from '../config/types';
import { BallotTypeToggle } from './ballot_type_toggle';
import { BallotModeToggle } from './ballot_mode_toggle';
import { DEFAULT_LOCALE } from '../config/globals';
import { BallotCopiesInput } from './ballot_copies_input';
import { PrintBallotButtonText } from './print_ballot_button_text';
import { useAddPrintedBallotMutation } from '../hooks/use_add_printed_ballot_mutation';

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

const defaultBallotLocales: BallotLocale = { primary: DEFAULT_LOCALE };

export function PrintAllBallotsButton(): JSX.Element {
  const makeCancelable = useCancelablePromise();
  const { electionDefinition, auth, logger, hasPrinterAttached } =
    useContext(AppContext);
  const addPrintedBallotMutation = useAddPrintedBallotMutation();
  assert(electionDefinition);
  assert(isElectionManagerAuth(auth) || isSystemAdministratorAuth(auth));
  const userRole = auth.user.role;
  const { election, electionHash } = electionDefinition;

  const needsPrinter = window.kiosk && !hasPrinterAttached;
  const initialState: ModalState = needsPrinter ? 'no-printer' : 'options';

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalState, setModalState] = useState<ModalState>(initialState);
  const [printFailed, setPrintFailed] = useState(false);
  const [ballotMode, setBallotMode] = useState(
    isSystemAdministratorAuth(auth)
      ? Admin.BallotMode.Sample
      : Admin.BallotMode.Official
  );
  const [isAbsentee, setIsAbsentee] = useState(true);
  const [ballotCopies, setBallotCopies] = useState(1);

  const [ballotIndex, setBallotIndex] = useState<number>();
  const ballotStyles = useMemo<BallotStyleData[]>(() => {
    const ballotStylesData = sortBallotStyleDataByPrecinct(
      election,
      getBallotStylesData(election)
    );
    if (isSystemAdministratorAuth(auth)) {
      ballotStylesData.unshift(getSuperBallotStyleData(election));
    }
    return ballotStylesData;
  }, [auth, election]);

  useEffect(() => {
    if (hasPrinterAttached && modalState === 'no-printer') {
      setModalState('options');
    } else if (!hasPrinterAttached && modalState === 'options') {
      setModalState('no-printer');
    }
  }, [modalState, hasPrinterAttached]);

  function closeModal() {
    setIsModalOpen(false);
    setModalState(initialState);
    setBallotIndex(undefined);
    setPrintFailed(false);
  }

  async function printBallotStyle(ballotStyle: BallotStyleData) {
    const { ballotStyleId, precinctId } = ballotStyle;

    await printElementWhenReady(
      (onRendered) => {
        return (
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
        );
      },
      {
        sides: 'two-sided-long-edge',
        copies: ballotCopies,
      }
    );

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

    void addPrintedBallotMutation.mutateAsync({
      ballotStyleId,
      precinctId,
      locales: defaultBallotLocales,
      numCopies: ballotCopies,
      ballotType: isAbsentee
        ? PrintableBallotType.Absentee
        : PrintableBallotType.Precinct,
      ballotMode,
    });
  }

  async function printBallots() {
    setModalState('printing');
    for (const [index, ballotStyle] of ballotStyles.entries()) {
      setBallotIndex(index);
      try {
        await printBallotStyle(ballotStyle);
      } catch {
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
        return;
      }

      const isLast = index === ballotStyles.length - 1;
      const printWaitTime = isLast
        ? PRINTER_COOLDOWN_TIME
        : PRINTER_WARMUP_TIME + ballotCopies * TWO_SIDED_PRINT_TIME;
      await makeCancelable(sleep(printWaitTime));
    }
    closeModal();
  }

  let mainContent: React.ReactNode = null;
  let actions: React.ReactNode = null;
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
            {isElectionManagerAuth(auth) && (
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
            onPress={printBallots}
            warning={
              isElectionManagerAuth(auth) &&
              ballotMode !== Admin.BallotMode.Official
            }
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
      const precinctName = isSuperBallotStyle(ballotStyleId)
        ? 'All'
        : getPrecinctById({ election, precinctId })?.name;
      mainContent = (
        <Prose textCenter>
          <Loading>
            {`Printing ${ballotModeToReadableString(ballotMode)} ${pluralize(
              'Ballot',
              ballotCopies,
              false
            )} (${ballotIndex + 1} of ${ballotStyles.length})`}
          </Loading>
          <p>
            Precinct: <strong>{precinctName}</strong>, Ballot Style:{' '}
            <strong>
              {isSuperBallotStyle(ballotStyleId) ? 'All' : ballotStyleId}
            </strong>
          </p>
        </Prose>
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
