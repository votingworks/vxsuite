import React, { useState } from 'react';
import { Button, LinkButton, SearchSelect, Callout } from '@votingworks/ui';
import {
  Redirect,
  Route,
  Switch,
  useHistory,
  useParams,
} from 'react-router-dom';
import type { Contest, ContestId, ElectionId } from '@votingworks/types';
import styled from 'styled-components';
import { useElectionDefinitionApi } from './election_definition_context.js';
import { FixedViewport, ListActionsRow, Row } from './layout.js';
import {
  type ListDetailRoutes,
  useListDetailRoutes,
} from './list_detail_routes.js';
import { reorderElement } from './utils.js';
import { ContestForm } from './contest_form.js';
import { ContestList } from './contest_list.js';

export interface ContestsEditorProps {
  electionId: ElectionId;
  isLocked?: boolean;
  AudioPanel?: React.ComponentType;
}

interface ContentProps extends ContestsEditorProps {
  contestRoutes: ListDetailRoutes;
}

export function ContestsEditor(props: ContestsEditorProps): JSX.Element {
  const contestRoutes = useListDetailRoutes('contestId', ':stringKey/:subkey');

  return (
    <Switch>
      <Route path={contestRoutes.viewPath}>
        <Content {...props} contestRoutes={contestRoutes} />
      </Route>
      <Route path={contestRoutes.rootPath}>
        <Content {...props} contestRoutes={contestRoutes} />
      </Route>
    </Switch>
  );
}

const FILTER_ALL = 'all';
const FILTER_NONPARTISAN = 'nonpartisan';

const Viewport = styled(FixedViewport)`
  display: grid;
  grid-template-rows: min-content 1fr;
`;

const EditPanel = styled.div`
  height: 100%;
  overflow: hidden;
`;

const Body = styled.div`
  display: flex;
  height: 100%;
  overflow: hidden;
  width: 100%;

  /* Sidebar */
  > :first-child:not(:last-child) {
    min-width: min-content;
    max-width: min(25%, 25rem);
    width: 100%;
  }

  > ${EditPanel} {
    flex-grow: 1;
  }
`;

const NoContests = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
`;

function Content(props: ContentProps): JSX.Element | null {
  const { electionId, isLocked, AudioPanel, contestRoutes } = props;
  const { contestId } = useParams<{ contestId?: ContestId }>();
  const history = useHistory();
  const api = useElectionDefinitionApi();

  const listContestsQuery = api.listContests.useQuery(electionId);
  const getElectionInfoQuery = api.getElectionInfo.useQuery(electionId);
  const listDistrictsQuery = api.listDistricts.useQuery(electionId);
  const listPartiesQuery = api.listParties.useQuery(electionId);
  const reorderContestsMutation = api.reorderContests.useMutation();

  const [filterDistrictId, setFilterDistrictId] = useState(FILTER_ALL);
  const [filterPartyId, setFilterPartyId] = useState(FILTER_ALL);
  const [reorderedContests, setReorderedContests] =
    useState<readonly Contest[]>();

  if (
    !(
      listContestsQuery.isSuccess &&
      getElectionInfoQuery.isSuccess &&
      listDistrictsQuery.isSuccess &&
      listPartiesQuery.isSuccess
    )
  ) {
    return null;
  }

  const contests = listContestsQuery.data;
  const electionInfo = getElectionInfoQuery.data;
  const districts = listDistrictsQuery.data;
  const parties = listPartiesQuery.data;
  const hasExternalSource = Boolean(electionInfo.externalSource);

  const filteredContests = contests.filter((contest) => {
    const matchesDistrict =
      filterDistrictId === FILTER_ALL ||
      // @coverage-defer
      contest.districtId === filterDistrictId;
    const matchesParty =
      filterPartyId === FILTER_ALL ||
      // @coverage-defer
      (filterPartyId === FILTER_NONPARTISAN
        ? contest.type !== 'candidate' || contest.partyId === undefined
        : contest.type === 'candidate' && contest.partyId === filterPartyId);
    return matchesDistrict && matchesParty;
  });

  const canReorder =
    filterDistrictId === FILTER_ALL &&
    filterPartyId === FILTER_ALL &&
    contests.length > 0 &&
    !isLocked &&
    !hasExternalSource;
  const isReordering = reorderedContests !== undefined;

  const contestsToShow = isReordering ? reorderedContests : filteredContests;

  /**
   * Used as a route redirect, to auto-select the first available contest for
   * convenience, when navigating to the root route:
   */
  const defaultContestRoute =
    !contestId && contestsToShow.length > 0
      ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        contestRoutes.viewUrl(contestsToShow[0]!.id)
      : null;

  function onSaveReorderedContests(updatedContests: readonly Contest[]) {
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
        {!hasExternalSource && (
          <LinkButton
            variant="primary"
            icon="Add"
            to={contestRoutes.addUrl}
            disabled={isReordering || isLocked}
          >
            Add Contest
          </LinkButton>
        )}
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
              // @coverage-defer
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
                // @coverage-defer
                onChange={(value) => setFilterPartyId(value ?? FILTER_ALL)}
                style={{ minWidth: '8rem' }}
                disabled={isReordering}
              />
            )}
          </React.Fragment>
        )}
        {!hasExternalSource && (
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
                onPress={() => setReorderedContests(contestsToShow)}
                disabled={!canReorder}
              >
                Reorder Contests
              </Button>
            )}
          </div>
        )}
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
            // @coverage-defer
            <NoContests>
              <Callout color="neutral" icon="Info">
                There are no contests for the district
                {/* @coverage-defer */}
                {electionInfo.type === 'primary' ? '/party' : ''} you selected.
              </Callout>
              <div>
                <Button
                  icon="X"
                  // @coverage-defer
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
            contests={contestsToShow}
            electionId={electionId}
            onSelect={(id) => history.push(contestRoutes.viewUrl(id))}
            selectedId={contestId}
            reordering={isReordering}
            reorder={(params) => {
              // @coverage-defer
              if (!isReordering) return;

              const idx = contestsToShow.findIndex((c) => c.id === params.id);
              setReorderedContests(
                reorderElement(reorderedContests, idx, idx + params.direction)
              );
            }}
          />
        )}

        <Switch>
          {AudioPanel && (
            <Route path={contestRoutes.audioPath}>
              <EditPanel>
                <AudioPanel />
              </EditPanel>
            </Route>
          )}
          <Route path={contestRoutes.addPath}>
            <AddContestForm
              contestRoutes={contestRoutes}
              electionId={electionId}
              isLocked={isLocked}
            />
          </Route>
          <Route path={contestRoutes.viewPath}>
            <EditContestForm {...props} />
          </Route>
          {defaultContestRoute && <Redirect to={defaultContestRoute} />}
        </Switch>
      </Body>
    </Viewport>
  );
}

function AddContestForm(props: Omit<ContentProps, 'AudioPanel'>): JSX.Element {
  const { electionId, isLocked, contestRoutes } = props;
  const nav = useNav(contestRoutes);
  return (
    <EditPanel>
      <ContestForm
        editing
        electionId={electionId}
        exit={nav.goToRoot}
        isLocked={isLocked}
        switchToEdit={nav.goToEdit}
        switchToView={nav.goToView}
        title="Add Contest"
      />
    </EditPanel>
  );
}

function EditContestForm(props: ContentProps): JSX.Element | null {
  const { electionId, isLocked, AudioPanel, contestRoutes } = props;
  const { contestId } = useParams<{ contestId: ContestId }>();
  const nav = useNav(contestRoutes);
  const listContestsQuery =
    useElectionDefinitionApi().listContests.useQuery(electionId);

  // @coverage-exclude
  if (!listContestsQuery.isSuccess) {
    return null;
  }

  const contests = listContestsQuery.data;
  const savedContest = contests.find((c) => c.id === contestId);
  const canEdit = !isLocked && !!savedContest;
  const audioUrl = AudioPanel ? contestRoutes.audioUrl : undefined;

  return (
    <EditPanel>
      <Switch>
        {canEdit && (
          <Route path={contestRoutes.editPath} exact>
            <ContestForm
              audioUrl={audioUrl}
              editing
              electionId={electionId}
              exit={nav.goToRoot}
              isLocked={isLocked}
              key={contestId}
              savedContest={savedContest}
              switchToEdit={nav.goToEdit}
              switchToView={nav.goToView}
              title="Edit Contest"
            />
          </Route>
        )}

        {/*
         * If there's no `savedContest`, it may have just been deleted (or we
         * have a stale tab), so we fall through to the redirect below.
         */}
        {savedContest && (
          <Route exact path={contestRoutes.viewPath}>
            <ContestForm
              audioUrl={audioUrl}
              editing={false}
              electionId={electionId}
              exit={nav.goToRoot}
              isLocked={isLocked}
              key={contestId}
              savedContest={savedContest}
              switchToEdit={nav.goToEdit}
              switchToView={nav.goToView}
              title="Contest Info"
            />
          </Route>
        )}

        <Redirect
          to={
            // @coverage-defer
            savedContest
              ? contestRoutes.viewUrl(contestId)
              : contestRoutes.rootUrl
          }
        />
      </Switch>
    </EditPanel>
  );
}

function useNav(contestRoutes: ListDetailRoutes) {
  const history = useHistory();

  return {
    goToRoot: () => history.replace(contestRoutes.rootUrl),
    goToEdit: (id: ContestId) => history.replace(contestRoutes.editUrl(id)),
    goToView: (id: ContestId) => history.replace(contestRoutes.viewUrl(id)),
  };
}
