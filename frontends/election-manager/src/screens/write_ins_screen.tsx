import React, { useContext, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';

import { Button, Modal, Prose, Table, TD, Text, TH } from '@votingworks/ui';
import {
  CandidateContest,
  ContestId,
  ContestOptionId,
  getPartyAbbreviationByPartyId,
  Id,
} from '@votingworks/types';

import { assert, collections, format, groupBy } from '@votingworks/utils';
import { Admin } from '@votingworks/api';
import { NavigationScreen } from '../components/navigation_screen';
import { WriteInsTranscriptionScreen } from './write_ins_transcription_screen';
import { AppContext } from '../contexts/app_context';
import { WriteInsAdjudicationScreen } from './write_ins_adjudication_screen';
import { useWriteInsQuery } from '../hooks/use_write_ins_query';
import { useTranscribeWriteInMutation } from '../hooks/use_transcribe_write_in_mutation';
import { useAdjudicateTranscriptionMutation } from '../hooks/use_adjudicate_transcription_mutation';
import { useUpdateWriteInAdjudicationMutation } from '../hooks/use_update_write_in_adjudication_mutation';

const ContentWrapper = styled.div`
  display: inline-block;
  button {
    min-width: 9rem;
  }
`;

export function WriteInsScreen(): JSX.Element {
  const { castVoteRecordFiles, electionDefinition } = useContext(AppContext);
  const [contestBeingTranscribed, setContestBeingTranscribed] =
    useState<CandidateContest>();
  const [contestBeingAdjudicated, setContestBeingAdjudicated] =
    useState<CandidateContest>();
  const [writeInCountsByContest, setWriteInCountsByContest] =
    useState<
      ReadonlyMap<
        ContestId,
        ReadonlyMap<Admin.WriteInAdjudicationStatus, number>
      >
    >();

  const transcribeWriteInMutation = useTranscribeWriteInMutation();
  const adjudicateTranscriptionMutation = useAdjudicateTranscriptionMutation();
  const updateWriteInAdjudicationMutation =
    useUpdateWriteInAdjudicationMutation();
  const writeInsQuery = useWriteInsQuery();

  // Get write-in counts grouped by contest
  useEffect(() => {
    const map = collections.map(
      groupBy(writeInsQuery.data ?? [], ({ contestId }) => contestId),
      (writeIns) =>
        collections.map(
          groupBy(writeIns, ({ status }) => status),
          (group) => group.size
        )
    );
    setWriteInCountsByContest(map);
  }, [writeInsQuery.data]);

  const transcriptionsForCurrentContest = useMemo(
    () =>
      (writeInsQuery.data ?? [])
        .filter((writeIn) => writeIn.contestId === contestBeingTranscribed?.id)
        .map((writeIn) => ({
          id: writeIn.id,
          contestId: writeIn.contestId,
          transcribedValue:
            writeIn.status !== 'pending' ? writeIn.transcribedValue : '',
        })),
    [contestBeingTranscribed?.id, writeInsQuery.data]
  );

  const election = electionDefinition?.election;

  if (!election) {
    return (
      <NavigationScreen>
        <Prose>
          <p>Election must be defined.</p>
        </Prose>
      </NavigationScreen>
    );
  }

  const contestsWithWriteIns = election.contests.filter(
    (contest): contest is CandidateContest =>
      contest.type === 'candidate' && contest.allowWriteIns
  );
  const isPrimaryElection = contestsWithWriteIns.some((c) => c.partyId);

  function updateTranscriptions(
    contestId: ContestId,
    transcribedValue: string,
    adjudicatedValue: string,
    adjudicatedOptionId?: ContestOptionId
  ) {
    adjudicateTranscriptionMutation.mutate({
      contestId,
      transcribedValue,
      adjudicatedValue,
      adjudicatedOptionId,
    });
  }

  function adjudicateTranscription(
    transcribedValue: string,
    adjudicatedValue: string,
    adjudicatedOptionId?: ContestOptionId
  ) {
    assert(contestBeingAdjudicated);
    updateTranscriptions(
      contestBeingAdjudicated.id,
      transcribedValue,
      adjudicatedValue,
      adjudicatedOptionId
    );
  }

  function updateAdjudication(
    writeInAdjudicationId: Id,
    adjudicatedValue: string,
    adjudicatedOptionId?: ContestOptionId
  ) {
    updateWriteInAdjudicationMutation.mutate({
      writeInAdjudicationId,
      adjudicatedValue,
      adjudicatedOptionId,
    });
  }

  return (
    <NavigationScreen>
      <ContentWrapper>
        <Prose maxWidth={false}>
          <h1>Write-Ins Transcription and Adjudication</h1>
          {!castVoteRecordFiles.wereAdded && (
            <p>
              Load CVRs to begin transcribing and adjudicating write-in votes.
            </p>
          )}
          <p>
            Transcribe all write-in values, then map the transcriptions to
            adjudicated candidates.
          </p>
          <Table>
            <thead>
              <tr>
                <TH>Contest</TH>
                {isPrimaryElection && <TH>Party</TH>}
                <TH textAlign="center">Transcription Queue</TH>
                <TH textAlign="center">Adjudication Queue</TH>
                <TH textAlign="center">Completed</TH>
              </tr>
            </thead>
            <tbody>
              {contestsWithWriteIns.map((contest) => {
                const contestWriteInsCount = writeInCountsByContest?.get(
                  contest.id
                );
                const hasWriteIns = !!contestWriteInsCount;
                const transcriptionQueue =
                  contestWriteInsCount?.get('pending') ?? 0;
                const adjudicationQueue =
                  contestWriteInsCount?.get('transcribed') ?? 0;
                const completedCount =
                  contestWriteInsCount?.get('adjudicated') ?? 0;
                return (
                  <tr key={contest.id}>
                    <TD nowrap>
                      <Text as="span" muted={!hasWriteIns}>
                        {contest.section === contest.title ? (
                          contest.title
                        ) : (
                          <React.Fragment>
                            {contest.section}, <strong>{contest.title}</strong>
                          </React.Fragment>
                        )}
                      </Text>
                    </TD>
                    {isPrimaryElection && (
                      <TD nowrap>
                        {contest.partyId &&
                          `(${getPartyAbbreviationByPartyId({
                            partyId: contest.partyId,
                            election,
                          })})`}
                      </TD>
                    )}
                    <TD nowrap textAlign="center">
                      {!hasWriteIns ? (
                        <Text as="span" muted>
                          –
                        </Text>
                      ) : (
                        <Button
                          primary={!!transcriptionQueue}
                          onPress={() => setContestBeingTranscribed(contest)}
                        >
                          Transcribe
                          {!!transcriptionQueue &&
                            ` ${format.count(transcriptionQueue)}`}
                        </Button>
                      )}
                    </TD>
                    <TD nowrap textAlign="center">
                      {!hasWriteIns ? (
                        <Text as="span" muted>
                          –
                        </Text>
                      ) : (
                        <Button
                          primary={!!adjudicationQueue}
                          onPress={() => setContestBeingAdjudicated(contest)}
                        >
                          Adjudicate
                          {!!adjudicationQueue &&
                            ` ${format.count(adjudicationQueue)}`}
                        </Button>
                      )}
                    </TD>
                    <TD nowrap textAlign="center">
                      {!hasWriteIns ? (
                        <Text as="span" muted>
                          –
                        </Text>
                      ) : (
                        format.count(completedCount)
                      )}
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Prose>
      </ContentWrapper>
      {contestBeingTranscribed && !!transcriptionsForCurrentContest.length && (
        <Modal
          content={
            <WriteInsTranscriptionScreen
              key={contestBeingAdjudicated?.id}
              election={election}
              contest={contestBeingTranscribed}
              adjudications={transcriptionsForCurrentContest}
              onClose={() => setContestBeingTranscribed(undefined)}
              saveTranscribedValue={(writeInId, transcribedValue) =>
                transcribeWriteInMutation.mutate({
                  writeInId,
                  transcribedValue,
                })
              }
            />
          }
          fullscreen
        />
      )}
      {contestBeingAdjudicated && (
        <Modal
          fullscreen
          content={
            <WriteInsAdjudicationScreen
              key={contestBeingAdjudicated?.id}
              contest={contestBeingAdjudicated}
              onClose={() => setContestBeingAdjudicated(undefined)}
              adjudicateTranscription={adjudicateTranscription}
              updateAdjudication={updateAdjudication}
            />
          }
        />
      )}
    </NavigationScreen>
  );
}
