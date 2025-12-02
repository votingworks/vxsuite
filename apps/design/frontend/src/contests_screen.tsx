import React, { useState } from 'react';
import {
  Button,
  Table,
  TH,
  TD,
  LinkButton,
  P,
  SearchSelect,
  Breadcrumbs,
  H1,
  H3,
  MainContent,
} from '@votingworks/ui';
import { Route, Switch, useParams } from 'react-router-dom';
import { AnyContest, ContestId, Contests } from '@votingworks/types';
import styled from 'styled-components';
import { Flipper, Flipped } from 'react-flip-toolkit';
import { Row, TableActionsRow } from './layout';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import {
  getBallotsFinalizedAt,
  getElectionInfo,
  listContests,
  listDistricts,
  listParties,
  reorderContests,
} from './api';
import { reorderElement } from './utils';
import { useTitle } from './hooks/use_title';
import { ContestForm } from './contest_form';

export function ContestsScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const contestParamRoutes = electionParamRoutes.contests;

  useTitle(routes.election(electionId).contests.root.title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Switch>
        <Route
          path={contestParamRoutes.add.path}
          exact
          component={AddContestForm}
        />
        <Route
          path={contestParamRoutes.edit(':contestId').path}
          exact
          component={EditContestForm}
        />
        <Route
          path={contestParamRoutes.view(':contestId').path}
          exact
          component={EditContestForm}
        />
        <Route path={contestParamRoutes.root.path}>
          <Header>
            <H1>Contests</H1>
          </Header>
          <MainContent>
            <ContestList />
          </MainContent>
        </Route>
      </Switch>
    </ElectionNavScreen>
  );
}

const ReorderableTr = styled.tr<{ isReordering: boolean }>`
  &:hover {
    background-color: ${(p) => p.isReordering && p.theme.colors.containerLow};
  }
`;

const FILTER_ALL = 'all';
const FILTER_NONPARTISAN = 'nonpartisan';

function ContestList(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const listContestsQuery = listContests.useQuery(electionId);
  const getElectionInfoQuery = getElectionInfo.useQuery(electionId);
  const listDistrictsQuery = listDistricts.useQuery(electionId);
  const listPartiesQuery = listParties.useQuery(electionId);
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const reorderContestsMutation = reorderContests.useMutation();
  const [filterDistrictId, setFilterDistrictId] = useState(FILTER_ALL);
  const [filterPartyId, setFilterPartyId] = useState(FILTER_ALL);
  const [reorderedContests, setReorderedContests] = useState<Contests>();

  if (
    !(
      listContestsQuery.isSuccess &&
      getElectionInfoQuery.isSuccess &&
      listDistrictsQuery.isSuccess &&
      listPartiesQuery.isSuccess &&
      getBallotsFinalizedAtQuery.isSuccess
    )
  ) {
    return null;
  }

  const contests = listContestsQuery.data;
  const electionInfo = getElectionInfoQuery.data;
  const districts = listDistrictsQuery.data;
  const parties = listPartiesQuery.data;
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const contestRoutes = routes.election(electionId).contests;

  const filteredContests = contests.filter((contest) => {
    const matchesDistrict =
      filterDistrictId === FILTER_ALL ||
      contest.districtId === filterDistrictId;
    const matchesParty =
      filterPartyId === FILTER_ALL ||
      (filterPartyId === FILTER_NONPARTISAN
        ? contest.type === 'yesno' || contest.partyId === undefined
        : contest.type === 'candidate' && contest.partyId === filterPartyId);
    return matchesDistrict && matchesParty;
  });

  const canReorder =
    filterDistrictId === FILTER_ALL &&
    filterPartyId === FILTER_ALL &&
    contests.length > 0 &&
    !ballotsFinalizedAt;
  const isReordering = reorderedContests !== undefined;

  const contestsToShow = isReordering ? reorderedContests : filteredContests;
  const contestsToShowByType = contestsToShow.reduce((map, contest) => {
    const existing = map.get(contest.type) || [];
    map.set(contest.type, [...existing, contest]);
    return map;
  }, new Map<string, AnyContest[]>());

  const districtIdToName = new Map(
    districts.map((district) => [district.id, district.name])
  );
  const partyIdToName = new Map(parties.map((party) => [party.id, party.name]));

  function onSaveReorderedContests(updatedContests: Contests) {
    reorderContestsMutation.mutate(
      {
        electionId,
        contestIds: updatedContests.map((contest) => contest.id),
      },
      {
        onSuccess: () => {
          setReorderedContests(undefined);
        },
      }
    );
  }

  return (
    <React.Fragment>
      {contests.length === 0 && (
        <P>You haven&apos;t added any contests to this election yet.</P>
      )}
      <TableActionsRow>
        <LinkButton
          variant="primary"
          icon="Add"
          to={contestRoutes.add.path}
          disabled={isReordering || !!ballotsFinalizedAt}
        >
          Add Contest
        </LinkButton>
        {contests.length > 0 && (
          <React.Fragment>
            <SearchSelect
              options={[
                { value: FILTER_ALL, label: 'All Districts' },
                ...districts.map((district) => ({
                  value: district.id,
                  label: district.name,
                })),
              ]}
              value={filterDistrictId}
              onChange={(value) => setFilterDistrictId(value ?? FILTER_ALL)}
              style={{ minWidth: '8rem' }}
              disabled={isReordering}
            />
            {electionInfo.type === 'primary' && (
              <SearchSelect
                options={[
                  { value: FILTER_ALL, label: 'All Parties' },
                  { value: FILTER_NONPARTISAN, label: 'Nonpartisan' },
                  ...parties.map((party) => ({
                    value: party.id,
                    label: party.name,
                  })),
                ]}
                value={filterPartyId}
                onChange={(value) => setFilterPartyId(value ?? FILTER_ALL)}
                style={{ minWidth: '8rem' }}
                disabled={isReordering}
              />
            )}
          </React.Fragment>
        )}
        <div style={{ marginLeft: 'auto' }}>
          {isReordering ? (
            <Row style={{ gap: '0.5rem' }}>
              <Button onPress={() => setReorderedContests(undefined)}>
                Cancel
              </Button>
              <Button
                onPress={() => onSaveReorderedContests(reorderedContests)}
                variant="primary"
                icon="Done"
                disabled={reorderContestsMutation.isLoading}
              >
                Save
              </Button>
            </Row>
          ) : (
            <Button
              onPress={() =>
                // We require candidate contests to appear before yesno,
                // but elections were created prior to this restriction.
                // To ensure all new reorders follow this, we initiate
                // the reordering with the requirement enforced
                setReorderedContests(
                  [...contests].sort((a, b) => {
                    // Candidate contests come before ballot measures (yesno)
                    if (a.type === 'candidate' && b.type === 'yesno') return -1;
                    if (a.type === 'yesno' && b.type === 'candidate') return 1;
                    return 0; // Same type, maintain relative order
                  })
                )
              }
              disabled={!canReorder}
            >
              Reorder Contests
            </Button>
          )}
        </div>
      </TableActionsRow>
      {contests.length > 0 &&
        (contestsToShow.length === 0 ? (
          <React.Fragment>
            <P>
              There are no contests for the district
              {electionInfo.type === 'primary' ? '/party' : ''} you selected.
            </P>
            <P>
              <Button
                onPress={() => {
                  setFilterDistrictId(FILTER_ALL);
                  setFilterPartyId(FILTER_ALL);
                }}
              >
                Clear Selection
              </Button>
            </P>
          </React.Fragment>
        ) : (
          <React.Fragment>
            {[...contestsToShowByType]
              .sort(([a]) => (a === 'candidate' ? -1 : 1)) // Candidate table first
              .map(([contestType, contestsOfType]) => (
                <div key={contestType} style={{ marginBottom: '2rem' }}>
                  <H3 as="h2" style={{ marginBottom: '1rem', fontWeight: 600 }}>
                    {contestType === 'candidate'
                      ? 'Candidate Contests'
                      : 'Ballot Measures'}
                  </H3>
                  {/* Flipper/Flip are used to animate the reordering of contest rows */}
                  {/* @ts-expect-error: TS doesn't think Flipper is a valid component */}
                  <Flipper
                    flipKey={contestsOfType
                      .map((contest) => contest.id)
                      .join(',')}
                    // Custom spring parameters to speed up the duration of the animation
                    // See https://github.com/aholachek/react-flip-toolkit/issues/100#issuecomment-551056183
                    spring={{ stiffness: 439, damping: 42 }}
                  >
                    <Table>
                      <thead>
                        <tr>
                          <TH style={{ width: '40%' }}>Title</TH>
                          <TH style={{ width: '30%' }}>District</TH>
                          {electionInfo.type === 'primary' && (
                            <TH style={{ width: '20%' }}>Party</TH>
                          )}
                          <TH
                            style={{
                              width:
                                electionInfo.type === 'primary' ? '10%' : '30%',
                            }}
                          />
                        </tr>
                      </thead>
                      <tbody>
                        {contestsOfType.map((contest, index) => {
                          const indexInFullList = contestsToShow.findIndex(
                            (c) => c.id === contest.id
                          );
                          return (
                            <Flipped
                              key={contest.id}
                              flipId={contest.id}
                              shouldFlip={() => isReordering}
                            >
                              <ReorderableTr
                                key={contest.id}
                                isReordering={isReordering}
                              >
                                <TD>{contest.title}</TD>
                                <TD nowrap>
                                  {districtIdToName.get(contest.districtId)}
                                </TD>
                                {electionInfo.type === 'primary' && (
                                  <TD nowrap>
                                    {contest.type === 'candidate' &&
                                      contest.partyId !== undefined &&
                                      partyIdToName.get(contest.partyId)}
                                  </TD>
                                )}
                                <TD nowrap style={{ height: '3rem' }}>
                                  <Row
                                    style={{
                                      gap: '0.5rem',
                                      justifyContent: 'flex-end',
                                    }}
                                  >
                                    {isReordering ? (
                                      <React.Fragment>
                                        <Button
                                          aria-label="Move Up"
                                          icon="ChevronUp"
                                          disabled={index === 0}
                                          onPress={() =>
                                            setReorderedContests(
                                              reorderElement(
                                                reorderedContests,
                                                indexInFullList,
                                                indexInFullList - 1
                                              )
                                            )
                                          }
                                        />
                                        <Button
                                          aria-label="Move Down"
                                          icon="ChevronDown"
                                          disabled={
                                            index === contestsOfType.length - 1
                                          }
                                          onPress={() =>
                                            setReorderedContests(
                                              reorderElement(
                                                reorderedContests,
                                                indexInFullList,
                                                indexInFullList + 1
                                              )
                                            )
                                          }
                                        />
                                      </React.Fragment>
                                    ) : (
                                      <LinkButton
                                        icon="Edit"
                                        to={contestRoutes.edit(contest.id).path}
                                        disabled={!!ballotsFinalizedAt}
                                      >
                                        Edit
                                      </LinkButton>
                                    )}
                                  </Row>
                                </TD>
                              </ReorderableTr>
                            </Flipped>
                          );
                        })}
                      </tbody>
                    </Table>
                  </Flipper>
                </div>
              ))}
          </React.Fragment>
        ))}
    </React.Fragment>
  );
}

function AddContestForm(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const contestRoutes = routes.election(electionId).contests;
  const { title } = contestRoutes.add;

  return (
    <React.Fragment>
      <Header>
        <Breadcrumbs currentTitle={title} parentRoutes={[contestRoutes.root]} />
        <H1>{title}</H1>
      </Header>
      <ContestForm electionId={electionId} editing />
    </React.Fragment>
  );
}

function EditContestForm(): JSX.Element | null {
  const { electionId, contestId } = useParams<
    ElectionIdParams & { contestId: ContestId }
  >();
  const listContestsQuery = listContests.useQuery(electionId);
  const finalizedAt = getBallotsFinalizedAt.useQuery(electionId);
  const contestParamRoutes = electionParamRoutes.contests;
  const contestRoutes = routes.election(electionId).contests;

  /* istanbul ignore next - @preserve */
  if (!listContestsQuery.isSuccess || !finalizedAt.isSuccess) {
    return null;
  }

  const contests = listContestsQuery.data;
  const savedContest = contests.find((c) => c.id === contestId);

  // If the contest was just deleted, this form may still render momentarily.
  // Ignore it.
  /* istanbul ignore next - @preserve */
  if (!savedContest) {
    return null;
  }

  const { title } = contestRoutes.edit(contestId);
  const canEdit = !finalizedAt.data;

  return (
    <React.Fragment>
      <Header>
        <Breadcrumbs currentTitle={title} parentRoutes={[contestRoutes.root]} />
        <H1>{title}</H1>
      </Header>
      <Switch>
        {canEdit && (
          <Route path={contestParamRoutes.edit(':contestId').path} exact>
            <ContestForm
              electionId={electionId}
              key={contestId}
              editing
              savedContest={savedContest}
            />
          </Route>
        )}
        <Route path={contestParamRoutes.view(':contestId').path}>
          <ContestForm
            editing={false}
            electionId={electionId}
            key={contestId}
            savedContest={savedContest}
          />
        </Route>
      </Switch>
    </React.Fragment>
  );
}
