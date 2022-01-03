import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  BallotStyle,
  ElectionSchema,
  PartyId,
  PartyIdSchema,
  PrecinctId,
  safeParseElection,
  VoterCardData,
} from '@votingworks/types';
import { Logger, LogSource } from '@votingworks/logging';
import {
  useCancelablePromise,
  useHardware,
  useSmartcard,
  useStoredState,
} from '@votingworks/ui';
import { Card, Hardware, sleep, Storage } from '@votingworks/utils';

import { z } from 'zod';
import { EventTargetFunction } from './config/types';

import { AdminScreen } from './screens/admin_screen';
import { InsertCardScreen } from './screens/insert_card_screen';
import { LoadElectionScreen } from './screens/load_election_screen';
import { LockedScreen } from './screens/locked_screen';
import { NonWritableCardScreen } from './screens/non_writable_card_screen';
import { PollWorkerScreen } from './screens/poll_worker_screen';
import { PrecinctBallotStylesScreen } from './screens/precinct_ballot_styles_screen';
import { PrecinctsScreen } from './screens/precincts_screen';
import { RemoveCardScreen } from './screens/remove_card_screen';
import { WritingCardScreen } from './screens/writing_card_screen';

import 'normalize.css';
import './App.css';

export interface Props {
  card: Card;
  hardware: Hardware;
  storage: Storage;
}

export function AppRoot({ card, hardware, storage }: Props): JSX.Element {
  const [isEncodingCard, setIsEncodingCard] = useState(false);
  const [isWritableCard, setIsWritableCard] = useState(false);
  const [isCardPresent, setIsCardPresent] = useState(false);
  const [isAdminCardPresent, setIsAdminCardPresent] = useState(false);
  const [isPollWorkerCardPresent, setIsPollWorkerCardPresent] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [isReadyToRemove, setIsReadyToRemove] = useState(false);
  const [isSinglePrecinctMode, setIsSinglePrecinctMode] = useStoredState(
    storage,
    'singlePrecinctMode',
    z.boolean(),
    false
  );
  const [election, setElection] = useStoredState(
    storage,
    'election',
    ElectionSchema
  );
  const [isLoadingElection, setIsLoadingElection] = useState(false);
  const [precinctId, setPrecinctId] = useStoredState(
    storage,
    'precinctId',
    z.string()
  );
  const [ballotStyleId, setBallotStyleId] = useState<string>();
  const [partyId, setPartyId] = useStoredState(
    storage,
    'partyId',
    PartyIdSchema
  );

  const logger = useMemo(
    () => new Logger(LogSource.VxBallotActivationFrontend, window.kiosk),
    []
  );
  const { hasCardReaderAttached } = useHardware({ hardware, logger });

  const unconfigure = useCallback(() => {
    setElection(undefined);
    setBallotStyleId(undefined);
    setPrecinctId(undefined);
    setPartyId(undefined);
    setIsSinglePrecinctMode(false);
    window.localStorage.clear();
  }, [setElection, setIsSinglePrecinctMode, setPartyId, setPrecinctId]);

  const reset = useCallback(() => {
    if (!isSinglePrecinctMode) {
      setPrecinctId(undefined);
    }
    setBallotStyleId(undefined);
  }, [isSinglePrecinctMode, setPrecinctId]);

  const setPrecinct = useCallback(
    (id: string) => {
      setPrecinctId(id);
      setPartyId(undefined);
    },
    [setPartyId, setPrecinctId]
  );

  const updatePrecinct: EventTargetFunction = useCallback(
    (event) => {
      const { id } = (event.target as HTMLElement).dataset;
      setPrecinctId(id);
    },
    [setPrecinctId]
  );

  // eslint-disable-next-line @typescript-eslint/no-shadow
  function getPartyNameById(partyId: PartyId) {
    const party = election?.parties.find((p) => p.id === partyId);
    return party?.name ?? '';
  }

  // eslint-disable-next-line @typescript-eslint/no-shadow
  function getPartyAdjectiveById(partyId: PartyId) {
    const partyName = getPartyNameById(partyId);
    return (partyName === 'Democrat' && 'Democratic') || partyName;
  }

  // eslint-disable-next-line @typescript-eslint/no-shadow
  function getPrecinctNameByPrecinctId(precinctId: PrecinctId): string {
    const precinct = election?.precincts.find((p) => p.id === precinctId);
    return precinct?.name ?? '';
  }

  function getBallotStylesByPrecinctId(id?: string): BallotStyle[] {
    return (
      election?.ballotStyles.filter((b) => !id || b.precincts.includes(id)) ??
      []
    );
  }

  const makeCancelable = useCancelablePromise();
  const smartcard = useSmartcard({ card, hasCardReaderAttached });

  const fetchElection = useCallback(async () => {
    setIsLoadingElection(true);
    const longValue = (await smartcard?.readLongString())?.unsafeUnwrap();
    setElection(safeParseElection(longValue).unsafeUnwrap());
    setIsLoadingElection(false);
  }, [setElection, smartcard]);

  const lockScreen = useCallback(() => {
    setIsLocked(true);
  }, []);

  useEffect(() => {
    void (async () => {
      setIsCardPresent(!!smartcard);
      setIsAdminCardPresent(smartcard?.data?.t === 'admin');
      setIsPollWorkerCardPresent(smartcard?.data?.t === 'pollworker');
      setIsWritableCard(smartcard?.data?.t === 'voter');
      setIsLocked((prev) =>
        smartcard?.data?.t === 'admin'
          ? true
          : smartcard?.data?.t === 'pollworker'
          ? false
          : prev
      );
      if (!smartcard?.data) {
        setIsReadyToRemove(false);
      }
    })();
  }, [smartcard]);

  const programCard: EventTargetFunction = useCallback(
    async (event) => {
      const {
        ballotStyleId: localBallotStyleId,
      } = (event.target as HTMLElement).dataset;
      if (precinctId && localBallotStyleId) {
        setBallotStyleId(localBallotStyleId);
        setIsEncodingCard(true);

        const createAtSeconds = Math.round(Date.now() / 1000);
        const code: VoterCardData = {
          c: createAtSeconds,
          t: 'voter',
          pr: precinctId,
          bs: localBallotStyleId,
        };
        const writeResult = await smartcard?.writeShortValue(
          JSON.stringify(code)
        );
        if (!writeResult?.isOk()) {
          // TODO: UI Notification if unable to write to card
          // https://github.com/votingworks/bas/issues/10
          // eslint-disable-next-line no-console
          console.error('failed to write voter card:', code);
          await makeCancelable(sleep(500));
          reset();
        } else {
          await makeCancelable(sleep(1500));
        }
        setIsEncodingCard(false);
        setIsReadyToRemove(true);
      }
    },
    [precinctId, smartcard, makeCancelable, reset]
  );

  if (isAdminCardPresent) {
    return (
      <AdminScreen
        election={election}
        fetchElection={fetchElection}
        getBallotStylesByPrecinctId={getBallotStylesByPrecinctId}
        isLoadingElection={isLoadingElection}
        partyId={partyId}
        partyName={partyId && getPartyAdjectiveById(partyId)}
        precinctId={precinctId}
        precinctName={precinctId && getPrecinctNameByPrecinctId(precinctId)}
        setParty={setPartyId}
        setPrecinct={setPrecinct}
        unconfigure={unconfigure}
        isSinglePrecinctMode={isSinglePrecinctMode}
        setIsSinglePrecinctMode={setIsSinglePrecinctMode}
        precinctBallotStyles={getBallotStylesByPrecinctId(precinctId)}
      />
    );
  }
  if (election) {
    if (isPollWorkerCardPresent && !isLocked) {
      return <PollWorkerScreen lockScreen={lockScreen} />;
    }
    if (isLocked) {
      return <LockedScreen />;
    }
    if (!isCardPresent) {
      return <InsertCardScreen lockScreen={lockScreen} />;
    }
    if (!isWritableCard) {
      return <NonWritableCardScreen lockScreen={lockScreen} />;
    }
    if (isReadyToRemove && ballotStyleId && precinctId) {
      return (
        <RemoveCardScreen
          ballotStyleId={ballotStyleId}
          lockScreen={lockScreen}
          precinctName={getPrecinctNameByPrecinctId(precinctId)}
        />
      );
    }
    if (isEncodingCard && ballotStyleId && precinctId) {
      return (
        <WritingCardScreen
          ballotStyleId={ballotStyleId}
          precinctName={getPrecinctNameByPrecinctId(precinctId)}
        />
      );
    }
    if (precinctId) {
      return (
        <PrecinctBallotStylesScreen
          isSinglePrecinctMode={isSinglePrecinctMode}
          lockScreen={lockScreen}
          partyId={partyId}
          precinctBallotStyles={getBallotStylesByPrecinctId(precinctId)}
          precinctName={getPrecinctNameByPrecinctId(precinctId)}
          programCard={programCard}
          showPrecincts={reset}
        />
      );
    }
    return (
      <PrecinctsScreen
        countyName={election.county.name}
        lockScreen={lockScreen}
        precincts={election.precincts}
        updatePrecinct={updatePrecinct}
      />
    );
  }
  return <LoadElectionScreen />;
}
