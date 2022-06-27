import React, { useContext, useEffect, useState } from 'react';

import { Button, Modal, Prose } from '@votingworks/ui';
import {
  Adjudication,
  CandidateContest,
  ContestId,
  getPartyAbbreviationByPartyId,
} from '@votingworks/types';

import { NavigationScreen } from '../components/navigation_screen';
import { WriteInsTranscriptionScreen } from './write_ins_transcription_screen';
import { AppContext } from '../contexts/app_context';

export function WriteInsScreen(): JSX.Element {
  const { castVoteRecordFiles, electionDefinition, saveTranscribedValue } =
    useContext(AppContext);
  const election = electionDefinition?.election;
  const castVoteRecordFileList = castVoteRecordFiles.fileList;
  const hasCastVoteRecordFiles =
    castVoteRecordFileList.length > 0 || !!castVoteRecordFiles.lastError;
  const contestsWithWriteIns = election?.contests.filter(
    (contest): contest is CandidateContest =>
      contest.type === 'candidate' && contest.allowWriteIns
  );

  const [contestBeingAdjudicated, setContestBeingAdjudicated] = useState<
    CandidateContest | undefined
  >();

  const [paginationIdx, setPaginationIdx] = useState<number>(0);
  const [writeInCountsByContest, setWriteInCountsByContest] =
    useState<Map<ContestId, number>>();
  const [adjudicationsForCurrentContest, setAdjudicationsForCurrentContest] =
    useState<Adjudication[]>([]);

  // Get write-in counts grouped by contest
  useEffect(() => {
    async function fetchAdjudicationCounts() {
      const res = await fetch('/admin/write-ins/adjudications/contestId/count');
      const map = new Map<ContestId, number>();
      for (const { contestId, adjudicationCount } of await res.json()) {
        map.set(contestId, adjudicationCount);
      }
      setWriteInCountsByContest(map);
    }
    void fetchAdjudicationCounts();
  }, [castVoteRecordFiles]);

  // When we start adjudicating a new contest, reset pagination index and fetch adjudications
  useEffect(() => {
    async function fetchAdjudicationsForContest(contestId: ContestId) {
      const res = await fetch(`/admin/write-ins/adjudications/${contestId}/`);
      setAdjudicationsForCurrentContest(await res.json());
    }
    if (contestBeingAdjudicated) {
      setPaginationIdx(0);
      void fetchAdjudicationsForContest(contestBeingAdjudicated.id);
    } else {
      setAdjudicationsForCurrentContest([]);
    }
  }, [contestBeingAdjudicated]);

  /* istanbul ignore next */
  function placeholderFn() {
    return null;
  }

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose maxWidth={false}>
          <h1>Write-Ins</h1>
          {!hasCastVoteRecordFiles && (
            <p>Adjudication can begin once CVRs are imported.</p>
          )}
          {contestsWithWriteIns?.map((contest) => (
            <p key={contest.id}>
              <Button
                disabled={
                  !(
                    hasCastVoteRecordFiles &&
                    writeInCountsByContest?.get(contest.id)
                  )
                }
                onPress={() => setContestBeingAdjudicated(contest)}
              >
                Adjudicate {writeInCountsByContest?.get(contest.id)} write-ins
                for “{contest.section} {contest.title}”
                {election && contest.partyId && (
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
              </Button>
            </p>
          ))}
        </Prose>
        {election &&
          contestBeingAdjudicated &&
          adjudicationsForCurrentContest.length && (
            <Modal
              content={
                <WriteInsTranscriptionScreen
                  election={election}
                  contest={contestBeingAdjudicated}
                  adjudications={adjudicationsForCurrentContest}
                  paginationIdx={paginationIdx}
                  onClose={() => setContestBeingAdjudicated(undefined)}
                  onListAll={placeholderFn}
                  onClickNext={
                    paginationIdx < adjudicationsForCurrentContest.length - 1
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
      </NavigationScreen>
    </React.Fragment>
  );
}
