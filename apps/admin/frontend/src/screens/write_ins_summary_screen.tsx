import { useContext } from 'react';
import styled from 'styled-components';

import {
  Callout,
  Font,
  LinkButton,
  Loading,
  P,
  Table,
  TD,
  TH,
} from '@votingworks/ui';
import {
  CandidateContest,
  getContestDistrictName,
  getPartyAbbreviationByPartyId,
} from '@votingworks/types';

import { format } from '@votingworks/utils';
import { NavigationScreen } from '../components/navigation_screen';
import { AppContext } from '../contexts/app_context';
import {
  getCastVoteRecordFiles,
  getWriteInAdjudicationQueueMetadata,
} from '../api';
import { routerPaths } from '../router_paths';

const ContentWrapper = styled.div`
  display: inline-block;

  button {
    min-width: 9rem;
  }
`;

export function WriteInsSummaryScreen(): JSX.Element {
  const { electionDefinition, isOfficialResults } = useContext(AppContext);

  const writeInAdjudicationQueueMetadataQuery =
    getWriteInAdjudicationQueueMetadata.useQuery();
  const castVoteRecordFilesQuery = getCastVoteRecordFiles.useQuery();

  const election = electionDefinition?.election;
  if (!election) {
    return (
      <NavigationScreen title="Write-In Adjudication">
        <P>Election must be defined.</P>
      </NavigationScreen>
    );
  }

  if (
    !writeInAdjudicationQueueMetadataQuery.isSuccess ||
    !castVoteRecordFilesQuery.isSuccess
  ) {
    return (
      <NavigationScreen title="Write-In Adjudication">
        <Loading isFullscreen />
      </NavigationScreen>
    );
  }

  const contestsWithWriteIns = election.contests.filter(
    (contest): contest is CandidateContest =>
      contest.type === 'candidate' && contest.allowWriteIns
  );
  function renderHeaderText() {
    if (isOfficialResults) {
      return (
        <Callout icon="Info" color="neutral" style={{ marginBottom: '1rem' }}>
          Adjudication is disabled because results were marked as official.
        </Callout>
      );
    }

    if (
      castVoteRecordFilesQuery.isSuccess &&
      castVoteRecordFilesQuery.data.length === 0
    ) {
      return (
        <Callout icon="Info" color="neutral" style={{ marginBottom: '1rem' }}>
          Load CVRs to begin adjudicating write-in votes.
        </Callout>
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
                {election.type === 'primary' && <TH>Party</TH>}
                <TH textAlign="center">Adjudication Queue</TH>
                <TH textAlign="center">Completed</TH>
              </tr>
            </thead>
            <tbody>
              {contestsWithWriteIns.map((contest) => {
                const contestQueueMetadata =
                  writeInAdjudicationQueueMetadataQuery.data.find(
                    (m) => m.contestId === contest.id
                  );
                const totalCount = contestQueueMetadata?.totalTally ?? 0;
                const pendingCount = contestQueueMetadata?.pendingTally ?? 0;
                const adjudicatedCount = totalCount - pendingCount;

                const hasWriteIns = totalCount > 0;
                return (
                  <tr key={contest.id}>
                    <TD>
                      <Font weight={hasWriteIns ? 'semiBold' : 'regular'}>
                        {getContestDistrictName(election, contest)},{' '}
                        {contest.title}
                      </Font>
                    </TD>
                    {election.type === 'primary' && (
                      <TD nowrap>
                        <Font weight={hasWriteIns ? 'semiBold' : 'regular'}>
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
                        <LinkButton
                          disabled={isOfficialResults}
                          variant={pendingCount ? 'primary' : 'neutral'}
                          to={routerPaths.writeInsAdjudication({
                            contestId: contest.id,
                          })}
                        >
                          Adjudicate
                          {!!pendingCount && ` ${format.count(pendingCount)}`}
                        </LinkButton>
                      )}
                    </TD>
                    <TD nowrap textAlign="center">
                      {!hasWriteIns ? (
                        <Font weight="light">–</Font>
                      ) : (
                        format.count(adjudicatedCount)
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
