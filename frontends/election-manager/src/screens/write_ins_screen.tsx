import React, { useContext, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';

import { Button, Modal, Prose, Table, TD } from '@votingworks/ui';
import {
  CandidateContest,
  ContestId,
  getPartyAbbreviationByPartyId,
} from '@votingworks/types';

import { collections, groupBy } from '@votingworks/utils';
import { Admin } from '@votingworks/api';
import { NavigationScreen } from '../components/navigation_screen';
import { WriteInsTranscriptionScreen } from './write_ins_transcription_screen';
import { AppContext } from '../contexts/app_context';
import { WriteInsAdjudicationScreen } from './write_ins_adjudication_screen';
import { useWriteInsQuery } from '../hooks/use_write_ins_query';
import { useTranscribeWriteInMutation } from '../hooks/use_transcribe_write_in_mutation';

const ContentWrapper = styled.div`
  display: inline-block;
`;

export function WriteInsScreen(): JSX.Element {
  const { castVoteRecordFiles, electionDefinition } = useContext(AppContext);
  const [contestBeingTranscribed, setContestBeingTranscribed] = useState<
    CandidateContest | undefined
  >();
  const [contestBeingAdjudicated, setContestBeingAdjudicated] = useState<
    CandidateContest | undefined
  >();
  const [writeInCountsByContest, setWriteInCountsByContest] =
    useState<
      ReadonlyMap<
        ContestId,
        ReadonlyMap<Admin.WriteInAdjudicationStatus, number>
      >
    >();

  const transcribeWriteInMutation = useTranscribeWriteInMutation();
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
          transcribedValue: writeIn.transcribedValue ?? '',
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
    transcribedValue: string,
    adjudicatedValue: string
  ) {
    console.log('updateTranscriptions', transcribedValue, adjudicatedValue);
  }

  function adjudicateTranscription(transcribedValue: string) {
    return (event: React.ChangeEvent<HTMLSelectElement>) => {
      updateTranscriptions(transcribedValue, event.target.value);
    };
  }

  function unadjudicateTranscription(transcribedValue: string) {
    return () => updateTranscriptions(transcribedValue, '');
  }

  /* istanbul ignore next */
  function placeholderFn() {
    return null;
  }

  return (
    <React.Fragment>
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
                  <TD as="th" nowrap>
                    Contest
                  </TD>
                  {isPrimaryElection && (
                    <TD as="th" nowrap>
                      Party
                    </TD>
                  )}
                  <TD as="th" nowrap>
                    Transcribe Write-Ins
                  </TD>
                  <TD as="th" nowrap>
                    Adjudicate Transcriptions
                  </TD>
                </tr>
              </thead>
              <tbody>
                {contestsWithWriteIns.map((contest) => {
                  const transcriptionQueue =
                    writeInCountsByContest?.get(contest.id)?.get('pending') ??
                    0;
                  const adjudicationQueue =
                    writeInCountsByContest
                      ?.get(contest.id)
                      ?.get('transcribed') ?? 0;
                  return (
                    <tr key={contest.id}>
                      <TD nowrap>
                        {contest.section}, <strong>{contest.title}</strong>
                      </TD>
                      {isPrimaryElection && (
                        <TD nowrap>
                          {contest.partyId && (
                            <React.Fragment>
                              {' '}
                              (
                              {getPartyAbbreviationByPartyId({
                                partyId: contest.partyId,
                                election,
                              })}
                              )
                            </React.Fragment>
                          )}
                        </TD>
                      )}
                      <TD nowrap>
                        <Button
                          disabled={!transcriptionQueue}
                          onPress={() => setContestBeingTranscribed(contest)}
                        >
                          Transcribe{' '}
                          {!!transcriptionQueue &&
                            `(${transcriptionQueue} new)`}
                        </Button>
                      </TD>
                      <TD nowrap>
                        <Button
                          // Adjudication should be disabled if there are no transcriptions.
                          // disabled={!transcriptionQueue}
                          primary={!!adjudicationQueue}
                          onPress={() => setContestBeingAdjudicated(contest)}
                        >
                          Adjudicate{' '}
                          {!!adjudicationQueue && `(${adjudicationQueue} new)`}
                        </Button>
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
                onListAll={placeholderFn}
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
                contestAdjudications={[]} // TODO
                onClose={() => setContestBeingAdjudicated(undefined)}
                adjudicateTranscription={adjudicateTranscription}
                unadjudicateTranscription={unadjudicateTranscription}
              />
            }
          />
        )}
      </NavigationScreen>
    </React.Fragment>
  );
}
