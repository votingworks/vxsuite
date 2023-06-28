import React, { useContext, useMemo, useState } from 'react';
import styled from 'styled-components';

import { Button, Font, Icons, P, Table, TD, TH } from '@votingworks/ui';
import {
  CandidateContest,
  getContestDistrictName,
  getPartyAbbreviationByPartyId,
} from '@votingworks/types';

import { collections, iter, typedAs } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import type { WriteInAdjudicationStatus } from '@votingworks/admin-backend';
import { NavigationScreen } from '../components/navigation_screen';
import { WriteInsAdjudicationScreen } from './write_ins_adjudication_screen';
import { AppContext } from '../contexts/app_context';
import { getCastVoteRecordFiles, getWriteInTallies } from '../api';

const ContentWrapper = styled.div`
  display: inline-block;
  button {
    min-width: 9rem;
  }
`;

export function WriteInsScreen(): JSX.Element {
  const { electionDefinition, isOfficialResults } = useContext(AppContext);
  const [contestBeingAdjudicated, setContestBeingAdjudicated] =
    useState<CandidateContest>();

  const writeInTalliesQuery = getWriteInTallies.useQuery();
  const castVoteRecordFilesQuery = getCastVoteRecordFiles.useQuery();

  // get write-in counts grouped by contest
  const writeInCountsByContest = useMemo(() => {
    return collections.map(
      iter(writeInTalliesQuery.data ?? []).toMap(({ contestId }) => contestId),
      (writeInSummariesForContest) =>
        collections.reduce(
          writeInSummariesForContest,
          (writeInCountsForContest, writeInTally) => {
            return {
              ...writeInCountsForContest,
              [writeInTally.status]:
                writeInCountsForContest[writeInTally.status] +
                writeInTally.tally,
            };
          },
          typedAs<Record<WriteInAdjudicationStatus, number>>({
            pending: 0,
            adjudicated: 0,
          })
        )
    );
  }, [writeInTalliesQuery.data]);

  const election = electionDefinition?.election;

  if (!election) {
    return (
      <NavigationScreen title="Write-In Adjudication">
        <P>Election must be defined.</P>
      </NavigationScreen>
    );
  }

  if (contestBeingAdjudicated) {
    return (
      <WriteInsAdjudicationScreen
        key={contestBeingAdjudicated?.id}
        election={election}
        contest={contestBeingAdjudicated}
        onClose={() => setContestBeingAdjudicated(undefined)}
      />
    );
  }

  const contestsWithWriteIns = election.contests.filter(
    (contest): contest is CandidateContest =>
      contest.type === 'candidate' && contest.allowWriteIns
  );
  const isPrimaryElection = contestsWithWriteIns.some((c) => c.partyId);

  function renderHeaderText() {
    if (isOfficialResults) {
      return (
        <P>
          <Icons.Info /> Tally results have been finalized. No further changes
          may be made.
        </P>
      );
    }

    if (
      castVoteRecordFilesQuery.isSuccess &&
      castVoteRecordFilesQuery.data.length === 0
    ) {
      return (
        <P>
          <Icons.Info /> Load CVRs to begin adjudicating write-in votes.
        </P>
      );
    }

    return null;
  }

  return (
    <NavigationScreen title="Write-In Adjudication">
      <ContentWrapper>
        <div>
          {renderHeaderText()}
          <Table>
            <thead>
              <tr>
                <TH>Contest</TH>
                {isPrimaryElection && <TH>Party</TH>}
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
                const adjudicationQueue =
                  contestWriteInsCount?.['pending'] ?? 0;
                const completedCount =
                  contestWriteInsCount?.['adjudicated'] ?? 0;
                return (
                  <tr key={contest.id}>
                    <TD nowrap>
                      <Font weight={hasWriteIns ? 'semiBold' : 'light'}>
                        {getContestDistrictName(election, contest)},{' '}
                        {contest.title}
                      </Font>
                    </TD>
                    {isPrimaryElection && (
                      <TD nowrap>
                        <Font weight={hasWriteIns ? 'semiBold' : 'light'}>
                          {contest.partyId &&
                            `(${getPartyAbbreviationByPartyId({
                              partyId: contest.partyId,
                              election,
                            })})`}
                        </Font>
                      </TD>
                    )}
                    <TD nowrap textAlign="center">
                      {!hasWriteIns ? (
                        <Font weight="light">–</Font>
                      ) : (
                        <Button
                          disabled={isOfficialResults}
                          variant={adjudicationQueue ? 'primary' : 'regular'}
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
                        <Font weight="light">–</Font>
                      ) : (
                        format.count(completedCount)
                      )}
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </ContentWrapper>
    </NavigationScreen>
  );
}
