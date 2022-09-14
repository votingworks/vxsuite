import React, { useCallback, useContext, useEffect, useState } from 'react';
import styled from 'styled-components';

import { Button, Modal, Prose, Table, TD } from '@votingworks/ui';
import {
  CandidateContest,
  ContestId,
  getPartyAbbreviationByPartyId,
} from '@votingworks/types';

import { Admin } from '@votingworks/api';
import { NavigationScreen } from '../components/navigation_screen';
import { WriteInsTranscriptionScreen } from './write_ins_transcription_screen';
import { AppContext } from '../contexts/app_context';
import {
  WriteInsAdjudicationScreen,
  Adjudication,
} from './write_ins_adjudication_screen';

const ContentWrapper = styled.div`
  display: inline-block;
`;

interface ContestWriteInCounts {
  contestId: string;
  pendingCount: number;
  transcribedCount: number;
  adjudicatedCount: number;
}

export function WriteInsScreen(): JSX.Element {
  const {
    castVoteRecordFiles,
    electionDefinition,
    loadWriteIns,
    loadWriteInSummary,
    saveTranscribedValue,
    saveAdjudicatedValue,
  } = useContext(AppContext);
  const [contestBeingTranscribed, setContestBeingTranscribed] = useState<
    CandidateContest | undefined
  >();
  const [contestBeingAdjudicated, setContestBeingAdjudicated] = useState<
    CandidateContest | undefined
  >();
  const [paginationIdx, setPaginationIdx] = useState<number>(0);
  const [allWriteIns, setAllWriteIns] = useState<Admin.WriteInRecord[]>();
  const [writeInCountsByContest, setWriteInCountsByContest] =
    useState<Map<ContestId, ContestWriteInCounts>>();
  const [transcriptionsForCurrentContest, setTranscriptionsForCurrentContest] =
    useState<Admin.WriteInRecord[]>([]);
  const [adjudicationsForCurrentContest, setAdjudicationsForCurrentContest] =
    useState<Adjudication[]>([]);

  const election = electionDefinition?.election;

  const fetchWriteIns = useCallback(async () => {
    const writeIns = await loadWriteIns();
    if (writeIns !== undefined) {
      setAllWriteIns(writeIns);
    }
  }, [loadWriteIns, setAllWriteIns]);

  const fetchWriteInSummary = useCallback(async () => {
    if (contestBeingAdjudicated) {
      const summary = await loadWriteInSummary(contestBeingAdjudicated.id);
      if (summary) {
        const adjudicatedValues = new Set(
          summary.map(
            (entry) => entry.writeInAdjudication?.adjudicatedValue ?? ''
          )
        );
        const adjudications = [...adjudicatedValues].map(
          (value): Adjudication => {
            return {
              value,
              transcriptions: summary
                .filter(
                  (entry) =>
                    entry.writeInAdjudication?.adjudicatedValue === value ||
                    (!value && !entry.writeInAdjudication)
                )
                .map((entry) => {
                  return {
                    value: entry.transcribedValue ?? '',
                    count: entry.writeInCount,
                  };
                }),
            };
          }
        );
        setAdjudicationsForCurrentContest(adjudications);
      }
    }
  }, [
    loadWriteInSummary,
    setAdjudicationsForCurrentContest,
    contestBeingAdjudicated,
  ]);

  useEffect(() => {
    if (contestBeingAdjudicated) {
      void fetchWriteInSummary();
    } else {
      setAdjudicationsForCurrentContest([]);
    }
  }, [contestBeingAdjudicated, fetchWriteInSummary]);

  const fetchWriteInsForTranscribedContest = useCallback(async () => {
    if (contestBeingTranscribed) {
      const writeIns = await loadWriteIns(contestBeingTranscribed.id);
      if (writeIns !== undefined) {
        setTranscriptionsForCurrentContest(writeIns ?? []);
      }
    }
  }, [
    loadWriteIns,
    setTranscriptionsForCurrentContest,
    contestBeingTranscribed,
  ]);

  useEffect(() => {
    void fetchWriteIns();
  }, [fetchWriteIns]);

  // Get write-in counts grouped by contest
  useEffect(() => {
    const tempWriteInCountsByContest = new Map();
    if (allWriteIns !== undefined && election !== undefined) {
      for (const contest of election.contests) {
        tempWriteInCountsByContest.set(contest.id, {
          contestId: contest.id,
          pendingCount: allWriteIns.filter(
            (w) => w.contestId === contest.id && w.status === 'pending'
          ).length,
          transcribedCount: allWriteIns.filter(
            (w) => w.contestId === contest.id && w.status === 'transcribed'
          ).length,
          adjudicatedCount: allWriteIns.filter(
            (w) => w.contestId === contest.id && w.status === 'adjudicated'
          ).length,
        });
      }
    }
    setWriteInCountsByContest(tempWriteInCountsByContest);
  }, [allWriteIns, election]);

  // When we start adjudicating a new contest, reset pagination index and fetch adjudications
  useEffect(() => {
    async function update() {
      if (contestBeingTranscribed) {
        const writeIns = await loadWriteIns(contestBeingTranscribed.id);
        if (writeIns !== undefined) {
          setTranscriptionsForCurrentContest(writeIns);
          const firstPendingValue = writeIns.findIndex(
            (w) => w.status === 'pending'
          );
          setPaginationIdx(
            firstPendingValue && firstPendingValue > 0 ? firstPendingValue : 0
          );
        }
      } else {
        setTranscriptionsForCurrentContest([]);
      }
    }
    void update();
  }, [contestBeingTranscribed, loadWriteIns]);

  if (!election) {
    return (
      <NavigationScreen>
        <Prose>
          <p>Election must be defined.</p>
        </Prose>
      </NavigationScreen>
    );
  }

  function updateTranscriptions(
    transcribedValue: string,
    adjudicatedValue: string,
    adjudicatedOptionId?: string
  ) {
    async function update() {
      if (contestBeingAdjudicated) {
        await saveAdjudicatedValue(
          contestBeingAdjudicated.id,
          transcribedValue,
          adjudicatedValue,
          adjudicatedOptionId
        );
        await fetchWriteInSummary();
      }
    }
    void update();
  }

  function adjudicateTranscription(transcribedValue: string) {
    return (event: React.ChangeEvent<HTMLSelectElement>) => {
      updateTranscriptions(transcribedValue, event.target.value);
    };
  }

  function unadjudicateTranscription(transcribedValue: string) {
    return () => updateTranscriptions(transcribedValue, '');
  }

  const contestsWithWriteIns = election.contests.filter(
    (contest): contest is CandidateContest =>
      contest.type === 'candidate' && contest.allowWriteIns
  );
  const isPrimaryElection = contestsWithWriteIns?.some((c) => c.partyId);

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
                {contestsWithWriteIns?.map((contest) => {
                  const transcriptionQueue =
                    writeInCountsByContest?.get(contest.id)?.pendingCount || 0;
                  const adjudicationQueue =
                    writeInCountsByContest?.get(contest.id)?.transcribedCount ||
                    0;
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
                          {transcriptionQueue} to transcribe
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
                          {!!adjudicationQueue && (
                            <span>({adjudicationQueue} new)</span>
                          )}
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
                election={election}
                contest={contestBeingTranscribed}
                writeIns={transcriptionsForCurrentContest}
                paginationIdx={paginationIdx}
                onClose={async () => {
                  setContestBeingTranscribed(undefined);
                  await fetchWriteIns();
                }}
                onListAll={placeholderFn}
                onClickNext={
                  paginationIdx < transcriptionsForCurrentContest.length - 1
                    ? () => setPaginationIdx(paginationIdx + 1)
                    : undefined
                }
                onClickPrevious={
                  paginationIdx
                    ? () => setPaginationIdx(paginationIdx - 1)
                    : undefined
                }
                saveTranscribedValue={async (
                  adjudicationId: string,
                  value: string
                ) => {
                  await saveTranscribedValue(adjudicationId, value);
                  await fetchWriteInsForTranscribedContest();
                }}
              />
            }
            fullscreen
          />
        )}
        {contestBeingAdjudicated && adjudicationsForCurrentContest.length > 0 && (
          <Modal
            fullscreen
            content={
              <WriteInsAdjudicationScreen
                contest={contestBeingAdjudicated}
                contestAdjudications={adjudicationsForCurrentContest}
                onClose={async () => {
                  setContestBeingAdjudicated(undefined);
                  await fetchWriteIns();
                }}
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
