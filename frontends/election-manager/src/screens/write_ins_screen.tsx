import React, { useContext, useState } from 'react';

import { Button, Modal } from '@votingworks/ui';
import {
  CandidateContest,
  getPartyAbbrevationByPartyId,
} from '@votingworks/types';

import { NavigationScreen } from '../components/navigation_screen';
import { Prose } from '../components/prose';
import { WriteInsTranscriptionScreen } from '../components/write_ins_transcription_screen';
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
  const writeInCountsByContest = new Map();
  for (const file of castVoteRecordFileList) {
    for (const cvr of file.allCastVoteRecords) {
      for (const k of Object.keys(cvr)) {
        if (Array.isArray(cvr[k])) {
          const contestId = k;
          const votes = cvr[contestId] as string[];
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

  const [isTranscriptionScreenOpen, setIsTranscriptionScreenOpen] =
    useState(false);
  return (
    <React.Fragment>
      <NavigationScreen mainChildFlex>
        <Prose maxWidth={false}>
          <h1>Write-Ins</h1>
          {!hasCastVoteRecordFiles && (
            <p>Adjudication can begin once CVRs are imported.</p>
          )}
          {contestsWithWriteIns?.map((contest) => (
            <p key={contest.id}>
              <Button
                disabled={!hasCastVoteRecordFiles}
                onPress={() => setIsTranscriptionScreenOpen(true)}
              >
                Adjudicate {writeInCountsByContest.get(contest.id)} write-ins
                for &quot;{contest.section} {contest.title}
                &quot;
                {election && contest.partyId && (
                  <React.Fragment>
                    {' '}
                    (
                    {getPartyAbbrevationByPartyId({
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
        {isTranscriptionScreenOpen && (
          <Modal content={<WriteInsTranscriptionScreen />} fullscreen />
        )}
      </NavigationScreen>
    </React.Fragment>
  );
}
