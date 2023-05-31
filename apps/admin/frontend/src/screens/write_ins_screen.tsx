import React, { useContext, useMemo, useState } from 'react';
import styled from 'styled-components';

import { Button, Modal, Prose, Table, TD, Text, TH } from '@votingworks/ui';
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

const ResultsFinalizedNotice = styled.p`
  color: rgb(71, 167, 75);
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

  function renderHeaderText() {
    if (isOfficialResults) {
      return (
        <ResultsFinalizedNotice>
          Tally results have been finalized. No further changes may be made.
        </ResultsFinalizedNotice>
      );
    }

    if (
      castVoteRecordFilesQuery.isSuccess &&
      castVoteRecordFilesQuery.data.length === 0
    ) {
      return (
        <p>
          <em>Load CVRs to begin adjudicating write-in votes.</em>
        </p>
      );
    }

    return null;
  }

  return (
    <NavigationScreen title="Write-In Adjudication">
      <ContentWrapper>
        <Prose maxWidth={false}>
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
                      <Text as="span" muted={!hasWriteIns}>
                        {getContestDistrictName(election, contest)},{' '}
                        <strong>{contest.title}</strong>
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
      {contestBeingAdjudicated && (
        <Modal
          content={
            <WriteInsAdjudicationScreen
              key={contestBeingAdjudicated?.id}
              election={election}
              contest={contestBeingAdjudicated}
              onClose={() => setContestBeingAdjudicated(undefined)}
            />
          }
          fullscreen
        />
      )}
    </NavigationScreen>
  );
}
