import React, { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';

import { Button, Modal, Prose, Table, TD } from '@votingworks/ui';
import {
  Adjudication,
  CandidateContest,
  ContestId,
  getPartyAbbreviationByPartyId,
} from '@votingworks/types';

import { NavigationScreen } from '../components/navigation_screen';
import { WriteInsTranscriptionScreen } from './write_ins_transcription_screen';
import { AppContext } from '../contexts/app_context';
import { WriteInsAdjudicationScreen } from './write_ins_adjudication_screen';

const ContentWrapper = styled.div`
  display: inline-block;
`;

const initialTemporaryTranscriptions = [
  {
    id: 'd1',
    contest_id: 'zoo-council-mammal',
    transcribed_value: 'Jumpy',
    adjudicated_value: '',
    cvr_id: 'asdf',
  },
  {
    id: 'd2',
    contest_id: 'zoo-council-mammal',
    transcribed_value: 'Elephant',
    adjudicated_value: '',
    cvr_id: 'asdf',
  },
  {
    id: 'd3',
    contest_id: 'zoo-council-mammal',
    transcribed_value: 'Long Trunk',
    adjudicated_value: '',
    cvr_id: 'asdf',
  },
  {
    id: 'd4',
    contest_id: 'zoo-council-mammal',
    transcribed_value: 'Jumpy',
    adjudicated_value: '',
    cvr_id: 'asdf',
  },
  {
    id: 'd5',
    contest_id: 'zoo-council-mammal',
    transcribed_value: 'Pink',
    adjudicated_value: '',
    cvr_id: 'asdf',
  },
  {
    id: 'd6',
    contest_id: 'zoo-council-mammal',
    transcribed_value: 'Pink Flamingo',
    adjudicated_value: '',
    cvr_id: 'asdf',
  },
  {
    id: 'd7',
    contest_id: 'zoo-council-mammal',
    transcribed_value: 'Flamingo',
    adjudicated_value: '',
    cvr_id: 'asdf',
  },
  {
    id: 'd8',
    contest_id: 'zoo-council-mammal',
    transcribed_value: 'Flamingo',
    adjudicated_value: '',
    cvr_id: 'asdf',
  },
  {
    id: 'd9',
    contest_id: 'zoo-council-mammal',
    transcribed_value: 'Flamingo',
    adjudicated_value: '',
    cvr_id: 'asdf',
  },
];

interface AdjudicationTranscription {
  value: string;
  count: number;
}
interface ContestAdjudicationRecord {
  value: string;
  transcriptions: AdjudicationTranscription[];
}
interface ContestAdjudication {
  contestId: string;
  adjudications: ContestAdjudicationRecord[];
}
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
    saveTranscribedValue,
  } = useContext(AppContext);
  const [contestBeingTranscribed, setContestBeingTranscribed] = useState<
    CandidateContest | undefined
  >();
  const [contestBeingAdjudicated, setContestBeingAdjudicated] = useState<
    CandidateContest | undefined
  >();
  const [paginationIdx, setPaginationIdx] = useState<number>(0);
  const [writeInCountsByContest, setWriteInCountsByContest] =
    useState<Map<ContestId, ContestWriteInCounts>>();
  const [transcriptionsForCurrentContest, setTranscriptionsForCurrentContest] =
    useState<Adjudication[]>([]);

  const [temporaryTranscriptions, setTemporaryTranscriptions] = useState(
    initialTemporaryTranscriptions
  );

  const election = electionDefinition?.election;

  // Get write-in counts grouped by contest
  useEffect(() => {
    async function fetchWriteIns() {
      const writeIns = await loadWriteIns();
      const tempWriteInCountsByContest = new Map();
      if (writeIns !== undefined && election !== undefined) {
        for (const contest of election.contests) {
          tempWriteInCountsByContest.set(contest.id, {
            contestId: contest.id,
            pendingCount: writeIns.filter(
              (w) => w.contestId === contest.id && w.status === 'pending'
            ).length,
            transcribedCount: writeIns.filter(
              (w) => w.contestId === contest.id && w.status === 'transcribed'
            ).length,
            adjudicatedCount: writeIns.filter(
              (w) => w.contestId === contest.id && w.status === 'adjudicated'
            ).length,
          });
        }
      }
      setWriteInCountsByContest(tempWriteInCountsByContest);
    }
    void fetchWriteIns();
  }, [loadWriteIns, election]);

  // When we start adjudicating a new contest, reset pagination index and fetch adjudications
  useEffect(() => {
    async function fetchAdjudicationsForContest(contestId: ContestId) {
      const res = await fetch(`/admin/write-ins/adjudications/${contestId}/`);
      setTranscriptionsForCurrentContest(await res.json());
    }
    if (contestBeingTranscribed) {
      setPaginationIdx(0);
      void fetchAdjudicationsForContest(contestBeingTranscribed.id);
    } else {
      setTranscriptionsForCurrentContest([]);
    }
  }, [contestBeingTranscribed]);

  if (!election) {
    return (
      <NavigationScreen>
        <Prose>
          <p>Election must be defined.</p>
        </Prose>
      </NavigationScreen>
    );
  }

  const transcriptionContestIds = [
    ...new Set(temporaryTranscriptions.map((t) => t.contest_id)),
  ];
  const contestsWithWritins = election.contests.filter((c) =>
    transcriptionContestIds.includes(c.id)
  );

  function sortWithEmptyStringLast(a: string, b: string) {
    if (a === b) {
      return 0;
    }
    if (a === '') {
      return 1;
    }
    if (b === '') {
      return -1;
    }
    return a < b ? -1 : 1;
  }

  const contestAdjudications = temporaryTranscriptions.reduce<
    ContestAdjudication[]
  >(
    (accumulator, currenTranscription) => {
      const newContestAdjudications: ContestAdjudication[] = [...accumulator];
      const contest: ContestAdjudication | undefined =
        newContestAdjudications.find(
          (c) => c.contestId === currenTranscription.contest_id
        );
      if (!contest) {
        return newContestAdjudications;
      }
      const contestIndex = newContestAdjudications.findIndex(
        (c) => c.contestId === currenTranscription.contest_id
      );
      const adjudication: AdjudicationZ | undefined =
        contest.adjudications.find(
          (a) => a.value === currenTranscription.adjudicated_value
        );
      const adjudicationIndex = contest.adjudications.findIndex(
        (a) => a.value === currenTranscription.adjudicated_value
      );
      const transcription: AdjudicationTranscription | undefined =
        adjudication?.transcriptions.find(
          (t) => t.value === currenTranscription.transcribed_value
        );
      const transcriptionIndex =
        adjudication?.transcriptions.findIndex(
          (t) => t.value === currenTranscription.transcribed_value
        ) ?? -1;
      if (!adjudication) {
        // Add new adjudication and first transcription
        newContestAdjudications[contestIndex].adjudications = [
          ...newContestAdjudications[contestIndex].adjudications,
          {
            value: currenTranscription.adjudicated_value,
            transcriptions: [
              {
                value: currenTranscription.transcribed_value,
                count: 1,
              },
            ],
          },
        ].sort((a, b) => sortWithEmptyStringLast(a.value, b.value));
      } else if (transcription && transcriptionIndex >= 0) {
        // Add duplicate transcription
        // eslint-disable-next-line no-plusplus
        newContestAdjudications[contestIndex].adjudications[adjudicationIndex]
          .transcriptions[transcriptionIndex].count++;
      } else if (!transcription) {
        // Add new transcription
        const newAdjudicationTranscriptions = [
          ...newContestAdjudications[contestIndex].adjudications[
            adjudicationIndex
          ].transcriptions,
          {
            value: currenTranscription.transcribed_value,
            count: 1,
          },
        ].sort((a, b) => a.value.localeCompare(b.value));
        newContestAdjudications[contestIndex].adjudications[
          adjudicationIndex
        ].transcriptions = newAdjudicationTranscriptions;
        newContestAdjudications[contestIndex].adjudications = [
          ...newContestAdjudications[contestIndex].adjudications,
        ].sort((a, b) => sortWithEmptyStringLast(a.value, b.value));
      }
      return newContestAdjudications;
    },
    (contestsWithWritins || []).map((c) => ({
      contestId: c.id,
      adjudications: [
        {
          value: '',
          count: 0,
          transcriptions: [],
        },
      ],
    }))
  );

  function getAdjudicationsForContest(id: string): AdjudicationZ[] {
    return (
      contestAdjudications.find((a) => a.contestId === id)?.adjudications || []
    );
  }

  function updateTranscriptions(
    transcribedValue: string,
    adjudicatedValue: string
  ) {
    setTemporaryTranscriptions(
      temporaryTranscriptions.map((t) => {
        if (
          t.transcribed_value === transcribedValue ||
          t.transcribed_value === adjudicatedValue
        ) {
          return {
            ...t,
            adjudicated_value: adjudicatedValue,
          };
        }
        return t;
      })
    );
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
        {contestBeingTranscribed &&
          !!transcriptionsForCurrentContest.length && (
            <Modal
              content={
                <WriteInsTranscriptionScreen
                  election={election}
                  contest={contestBeingTranscribed}
                  adjudications={transcriptionsForCurrentContest}
                  paginationIdx={paginationIdx}
                  onClose={() => setContestBeingTranscribed(undefined)}
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
                  saveTranscribedValue={saveTranscribedValue}
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
                contest={contestBeingAdjudicated}
                contestAdjudications={getAdjudicationsForContest(
                  contestBeingAdjudicated.id
                )}
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
