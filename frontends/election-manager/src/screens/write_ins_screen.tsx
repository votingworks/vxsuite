import React, { useContext, useMemo, useState } from 'react';
import styled from 'styled-components';

import { Button, Modal, Prose, Table, TD, Text, TH } from '@votingworks/ui';
import {
  CandidateContest,
  ContestId,
  ContestOptionId,
  getPartyAbbreviationByPartyId,
  Id,
} from '@votingworks/types';

import { assert, collections, groupBy } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { NavigationScreen } from '../components/navigation_screen';
import { WriteInsTranscriptionScreen } from './write_ins_transcription_screen';
import { AppContext } from '../contexts/app_context';
import { WriteInsAdjudicationScreen } from './write_ins_adjudication_screen';
import { useWriteInsQuery } from '../hooks/use_write_ins_query';
import { useTranscribeWriteInMutation } from '../hooks/use_transcribe_write_in_mutation';
import { useAdjudicateTranscriptionMutation } from '../hooks/use_adjudicate_transcription_mutation';
import { useUpdateWriteInAdjudicationMutation } from '../hooks/use_update_write_in_adjudication_mutation';
import { useCvrFilesQuery } from '../hooks/use_cvr_files_query';

const ContentWrapper = styled.div`
  display: inline-block;
  button {
    min-width: 9rem;
  }
`;

const ResultsFinalizedNotice = styled.p`
  color: rgb(71, 167, 75);
`;

export function WriteInsScreen(): JSX.Element {
  const { electionDefinition, isOfficialResults } = useContext(AppContext);
  const [contestBeingTranscribed, setContestBeingTranscribed] =
    useState<CandidateContest>();
  const [contestBeingAdjudicated, setContestBeingAdjudicated] =
    useState<CandidateContest>();

  const transcribeWriteInMutation = useTranscribeWriteInMutation();
  const adjudicateTranscriptionMutation = useAdjudicateTranscriptionMutation();
  const updateWriteInAdjudicationMutation =
    useUpdateWriteInAdjudicationMutation();
  const writeInsQuery = useWriteInsQuery();
  const cvrFilesQuery = useCvrFilesQuery();

  // Get write-in counts grouped by contest
  const writeInCountsByContest = useMemo(() => {
    return collections.map(
      groupBy(writeInsQuery.data ?? [], ({ contestId }) => contestId),
      (writeIns) =>
        collections.map(
          groupBy(writeIns, ({ status }) => status),
          (group) => group.size
        )
    );
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

  function renderHeaderText() {
    if (isOfficialResults) {
      return (
        <ResultsFinalizedNotice>
          Tally results have been finalized. No further changes may be made.
        </ResultsFinalizedNotice>
      );
    }

    if (cvrFilesQuery.isSuccess && cvrFilesQuery.data.length === 0) {
      return (
        <p>
          <em>
            Load CVRs to begin transcribing and adjudicating write-in votes.
          </em>
        </p>
      );
    }

    return (
      <p>
        Transcribe all write-in values, then map the transcriptions to
        adjudicated candidates.
      </p>
    );
  }

  return (
    <NavigationScreen>
      <ContentWrapper>
        <Prose maxWidth={false}>
          <h1>Write-Ins Transcription and Adjudication</h1>
          {renderHeaderText()}
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
                        <Text as="span" muted={!hasWriteIns}>
                          {contest.partyId &&
                            `(${getPartyAbbreviationByPartyId({
                              partyId: contest.partyId,
                              election,
                            })})`}
                        </Text>
                      </TD>
                    )}
                    <TD nowrap textAlign="center">
                      {!hasWriteIns ? (
                        <Text as="span" muted>
                          –
                        </Text>
                      ) : (
                        <Button
                          disabled={isOfficialResults}
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
                          disabled={
                            isOfficialResults ||
                            (!adjudicationQueue && !completedCount)
                          }
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
              transcriptionQueue={
                writeInCountsByContest
                  ?.get(contestBeingTranscribed.id)
                  ?.get('pending') ?? 0
              }
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
