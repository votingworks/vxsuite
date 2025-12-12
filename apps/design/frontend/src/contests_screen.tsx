import React, { useState } from 'react';
import { Button, LinkButton, SearchSelect, H1, Callout } from '@votingworks/ui';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import {
  CandidateContest,
  ContestId,
  Contests,
  YesNoContest,
} from '@votingworks/types';
import styled from 'styled-components';
import { FixedViewport, ListActionsRow, Row } from './layout';
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
import { ContestList } from './contest_list';
import { ContestAudioPanel } from './contest_audio_panel';

export function ContestsScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const contestParamRoutes = electionParamRoutes.contests;

  useTitle(routes.election(electionId).contests.root.title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>Contests</H1>
      </Header>
      <Switch>
        <Route
          path={contestParamRoutes.view(':contestId').path}
          component={Content}
        />
        <Route path={contestParamRoutes.root.path} component={Content} />
        <Redirect to={contestParamRoutes.root.path} />
      </Switch>
    </ElectionNavScreen>
  );
}

const FILTER_ALL = 'all';
const FILTER_NONPARTISAN = 'nonpartisan';

const Viewport = styled(FixedViewport)`
  display: grid;
  grid-template-rows: min-content 1fr;
`;

const Body = styled.div`
  display: flex;
  height: 100%;
  overflow: hidden;
  width: 100%;

  /* Sidebar */
  > :first-child {
    min-width: min-content;
    max-width: min(25%, 25rem);
    width: 100%;
  }

  /* Content pane */
  > :last-child {
    flex-grow: 1;
  }
`;

const NoContests = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
`;

const EditPanel = styled.div`
  height: 100%;
  overflow: hidden;
`;

function Content(): JSX.Element | null {
  const { contestId, electionId } = useParams<
    ElectionIdParams & { contestId?: string }
  >();

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
  const contestParamRoutes = electionParamRoutes.contests;

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
  const candidateContests: CandidateContest[] = [];
  const yesNoContests: YesNoContest[] = [];

  for (const c of contestsToShow) {
    if (c.type === 'candidate') candidateContests.push(c);
    else yesNoContests.push(c);
  }

  /**
   * Used as a route redirect, to auto-select the first available contest for
   * convenience, when navigating to the root route:
   */
  const defaultContestRoute =
    !contestId && contestsToShow.length > 0
      ? contestRoutes.view(contestsToShow[0].id).path
      : null;

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
    <Viewport>
      <ListActionsRow>
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
              icon="Sort"
              onPress={() =>
                // We require candidate contests to appear before yesno,
                // but elections were created prior to this restriction.
                // To ensure all new reorders follow this, we initiate
                // the reordering with the requirement enforced
                setReorderedContests([...candidateContests, ...yesNoContests])
              }
              disabled={!canReorder}
            >
              Reorder Contests
            </Button>
          )}
        </div>
      </ListActionsRow>

      <Body>
        {contestsToShow.length === 0 ? (
          contests.length === 0 ? (
            <NoContests>
              <Callout color="neutral" icon="Info">
                You haven&apos;t added any contests to this election yet.
              </Callout>
            </NoContests>
          ) : (
            <NoContests>
              <Callout color="neutral" icon="Info">
                There are no contests for the district
                {electionInfo.type === 'primary' ? '/party' : ''} you selected.
              </Callout>
              <div>
                <Button
                  icon="X"
                  onPress={() => {
                    setFilterDistrictId(FILTER_ALL);
                    setFilterPartyId(FILTER_ALL);
                  }}
                >
                  Clear Selection
                </Button>
              </div>
            </NoContests>
          )
        ) : (
          <ContestList
            candidateContests={candidateContests}
            reordering={isReordering}
            reorder={(params) => {
              if (!isReordering) return;

              const idx = contestsToShow.findIndex((c) => c.id === params.id);
              setReorderedContests(
                reorderElement(reorderedContests, idx, idx + params.direction)
              );
            }}
            yesNoContests={yesNoContests}
          />
        )}

        <EditPanel>
          <Switch>
            <Route
              path={contestParamRoutes.audio({
                contestId: ':contestId',
                stringKey: ':stringKey',
                subkey: ':subkey',
              })}
              component={ContestAudioPanel}
            />
            <Route
              path={contestParamRoutes.add.path}
              component={AddContestForm}
            />
            <Route
              path={contestParamRoutes.view(':contestId').path}
              component={EditContestForm}
            />
            {defaultContestRoute && <Redirect to={defaultContestRoute} />}
          </Switch>
        </EditPanel>
      </Body>
    </Viewport>
  );
}

function AddContestForm(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  return <ContestForm electionId={electionId} editing title="Add Contest" />;
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
  const canEdit = !finalizedAt.data && !!savedContest;

  return (
    <Switch>
      {canEdit && (
        <Route path={contestParamRoutes.edit(':contestId').path} exact>
          <ContestForm
            electionId={electionId}
            key={contestId}
            editing
            savedContest={savedContest}
            title="Edit Contest"
          />
        </Route>
      )}

      {/*
       * If there's no `savedContest`, it may have just been deleted (or we
       * have a stale tab), so we fall through to the redirect below.
       */}
      {savedContest && (
        <Route exact path={contestParamRoutes.view(':contestId').path}>
          <ContestForm
            editing={false}
            electionId={electionId}
            key={contestId}
            savedContest={savedContest}
            title="Contest Info"
          />
        </Route>
      )}

      <Redirect
        to={
          savedContest
            ? contestRoutes.view(contestId).path
            : contestRoutes.root.path
        }
      />
    </Switch>
  );
}
