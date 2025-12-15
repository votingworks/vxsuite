import React from 'react';
import styled from 'styled-components';
import { Switch, Route, Redirect, useParams } from 'react-router-dom';

import { H1, LinkButton } from '@votingworks/ui';

import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import { getBallotsFinalizedAt, listPrecincts } from './api';
import { useTitle } from './hooks/use_title';
import { PrecinctForm } from './precincts_form';
import { PrecinctList } from './precincts_list';
import { FixedViewport, ListActionsRow } from './layout';
import { PrecinctAudioPanel } from './precinct_audio_panel';

export function PrecinctsScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const precinctParamRoutes = electionParamRoutes.precincts;
  useTitle(routes.election(electionId).precincts.root.title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>Precincts</H1>
      </Header>
      <Switch>
        <Route
          path={precinctParamRoutes.view(':precinctId').path}
          component={Content}
        />
        <Route path={precinctParamRoutes.root.path} component={Content} />
        <Redirect to={precinctParamRoutes.root.path} />
      </Switch>
    </ElectionNavScreen>
  );
}

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
    max-width: min(25%, 17rem);
    min-width: min-content;
    width: 100%;
  }

  > ${EditPanel} {
    flex-grow: 1;
  }
`;

function Content(): React.ReactNode {
  const { electionId, precinctId } = useParams<
    ElectionIdParams & { precinctId?: string }
  >();

  const precincts = listPrecincts.useQuery(electionId);
  const ballotsFinalizedAt = getBallotsFinalizedAt.useQuery(electionId);

  if (!precincts.isSuccess || !ballotsFinalizedAt.isSuccess) return null;

  const precinctRoutes = routes.election(electionId).precincts;
  const precinctParamRoutes = electionParamRoutes.precincts;

  /**
   * Used as a route redirect, to auto-select the first available precinct for
   * convenience, when navigating to the root route:
   */
  const defaultPrecinctRoute =
    !precinctId && precincts.data.length > 0
      ? precinctRoutes.view(precincts.data[0].id).path
      : null;

  const ballotsFinalized = !!ballotsFinalizedAt.data;

  return (
    <Viewport>
      <ListActionsRow>
        <LinkButton
          variant="primary"
          icon="Add"
          to={precinctRoutes.add.path}
          disabled={ballotsFinalized}
        >
          Add Precinct
        </LinkButton>
      </ListActionsRow>

      <Body>
        <PrecinctList />
        <Switch>
          <Route
            path={precinctParamRoutes.audio({
              precinctId: ':precinctId',
              stringKey: ':stringKey',
              subkey: ':subkey',
            })}
            component={PrecinctAudioPanel}
          />

          <Route
            path={precinctParamRoutes.add.path}
            component={AddPrecinctForm}
          />

          <Route
            path={precinctParamRoutes.view(':precinctId').path}
            component={EditPrecinctForm}
          />

          {defaultPrecinctRoute && <Redirect to={defaultPrecinctRoute} />}
        </Switch>
      </Body>
    </Viewport>
  );
}

function AddPrecinctForm(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const precinctRoutes = routes.election(electionId).precincts;
  const { title } = precinctRoutes.add;

  return (
    <EditPanel>
      <PrecinctForm editing electionId={electionId} title={title} />
    </EditPanel>
  );
}

function EditPrecinctForm(): JSX.Element | null {
  type RouteParams = ElectionIdParams & { precinctId: string };
  const { electionId, precinctId } = useParams<RouteParams>();

  const listPrecinctsQuery = listPrecincts.useQuery(electionId);
  const finalizedAt = getBallotsFinalizedAt.useQuery(electionId);

  const precinctParamRoutes = electionParamRoutes.precincts;
  const precinctRoutes = routes.election(electionId).precincts;

  if (!listPrecinctsQuery.isSuccess) return null;

  const precincts = listPrecinctsQuery.data;
  const savedPrecinct = precincts.find((p) => p.id === precinctId);
  const canEdit = !finalizedAt.data && !!savedPrecinct;

  return (
    <EditPanel>
      <Switch>
        {canEdit && (
          <Route path={precinctParamRoutes.edit(':precinctId').path} exact>
            <PrecinctForm
              editing
              electionId={electionId}
              key={precinctId}
              savedPrecinct={savedPrecinct}
              title="Edit Precinct"
            />
          </Route>
        )}

        {savedPrecinct && (
          <Route path={precinctParamRoutes.view(':precinctId').path} exact>
            <PrecinctForm
              electionId={electionId}
              editing={false}
              key={precinctId}
              savedPrecinct={savedPrecinct}
              title="Precinct Info"
            />
          </Route>
        )}

        <Redirect
          to={
            savedPrecinct
              ? precinctRoutes.view(precinctId).path
              : precinctRoutes.root.path
          }
        />
      </Switch>
    </EditPanel>
  );
}
