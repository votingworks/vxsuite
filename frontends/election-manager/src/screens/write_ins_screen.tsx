import React, { useContext, useState } from 'react';

import { Button, Modal, Prose } from '@votingworks/ui';
import {
  CandidateContest,
  ContestId,
  ContestOptionId,
  getPartyAbbreviationByPartyId,
} from '@votingworks/types';

import { NavigationScreen } from '../components/navigation_screen';
import { WriteInsTranscriptionScreen } from './write_ins_transcription_screen';
import { AppContext } from '../contexts/app_context';

export function WriteInsScreen(): JSX.Element {
  const { castVoteRecordFiles, electionDefinition } = useContext(AppContext);
  const election = electionDefinition?.election;
  const castVoteRecordFileList = castVoteRecordFiles.fileList;
  const hasCastVoteRecordFiles =
    castVoteRecordFileList.length > 0 || !!castVoteRecordFiles.lastError;
  const contestsWithWriteIns = election?.contests.filter(
    (contest): contest is CandidateContest =>
      contest.type === 'candidate' && contest.allowWriteIns
  );

  // Aggregate write-in count by contest
  const writeInCountsByContest = new Map<ContestId, number>();
  for (const file of castVoteRecordFileList) {
    for (const cvr of file.allCastVoteRecords) {
      for (const [key, value] of Object.entries(cvr)) {
        if (Array.isArray(value)) {
          const contestId = key;
          const votes = value as ContestOptionId[];
          // TODO: this does not capture all the ways we represente write-ins, must be
          // updated once https://github.com/votingworks/vxsuite/issues/1793 is complete.
          const cvrHasWriteIn = votes.find((m) => m.startsWith('write-in'));
          if (cvrHasWriteIn) {
            const currCount = writeInCountsByContest.get(contestId) || 0;
            writeInCountsByContest.set(contestId, currCount + 1);
          }
        }
      }
    }
  }

  const [contestBeingAdjudicated, setContestBeingAdjudicated] = useState<
    CandidateContest | undefined
  >();

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
                    writeInCountsByContest.get(contest.id)
                  )
                }
                onPress={() => setContestBeingAdjudicated(contest)}
              >
                Adjudicate {writeInCountsByContest.get(contest.id)} write-ins
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
                onClose={() => setContestBeingAdjudicated(undefined)}
                onListAll={placeholderFn}
                onClickNext={placeholderFn}
                onClickPrevious={placeholderFn}
                saveTranscribedValue={placeholderFn}
              />
            }
            fullscreen
          />
        )}
      </NavigationScreen>
    </React.Fragment>
  );
}
