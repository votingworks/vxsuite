import React, { useContext, useEffect, useMemo, useState } from 'react';

import { Button, Modal, Prose } from '@votingworks/ui';
import {
  CandidateContest,
  CastVoteRecord,
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

  // Aggregate write-ins by contest
  const writeInsByContest = useMemo(() => {
    const map = new Map<ContestId, CastVoteRecord[]>();
    for (const file of castVoteRecordFileList) {
      for (const cvr of file.allCastVoteRecords) {
        if (cvr.adjudications) {
          for (const adjudication of cvr.adjudications) {
            const currCvrs = map.get(adjudication.contestId) || [];
            map.set(adjudication.contestId, [...currCvrs, cvr]);
          }
        }
      }
    }
    return map;
  }, [castVoteRecordFileList]);

  const [contestBeingAdjudicated, setContestBeingAdjudicated] = useState<
    CandidateContest | undefined
  >();

  const [ballotIdxBeingAdjudicated, setBallotIdxBeingAdjudicated] =
    useState<number>(0);

  // When we start adjudicating a new contest, reset ballot pagination index
  useEffect(() => {
    if (contestBeingAdjudicated) {
      setBallotIdxBeingAdjudicated(0);
    }
  }, [contestBeingAdjudicated]);

  const ballotsBeingAdjudicated: CastVoteRecord[] = contestBeingAdjudicated
    ? writeInsByContest.get(contestBeingAdjudicated.id) || []
    : [];

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
                    writeInsByContest.get(contest.id)?.length
                  )
                }
                onPress={() => setContestBeingAdjudicated(contest)}
              >
                Adjudicate {writeInsByContest.get(contest.id)?.length} write-ins
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
        {contestBeingAdjudicated && election && (
          <Modal
            content={
              <WriteInsTranscriptionScreen
                election={election}
                contest={contestBeingAdjudicated}
                ballotIdxBeingAdjudicated={ballotIdxBeingAdjudicated}
                ballotsBeingAdjudicated={ballotsBeingAdjudicated}
                onClose={() => setContestBeingAdjudicated(undefined)}
                onListAll={placeholderFn}
                onClickNext={
                  ballotIdxBeingAdjudicated < ballotsBeingAdjudicated.length - 1
                    ? () =>
                        setBallotIdxBeingAdjudicated(
                          ballotIdxBeingAdjudicated + 1
                        )
                    : undefined
                }
                onClickPrevious={
                  ballotIdxBeingAdjudicated
                    ? () =>
                        setBallotIdxBeingAdjudicated(
                          ballotIdxBeingAdjudicated - 1
                        )
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
