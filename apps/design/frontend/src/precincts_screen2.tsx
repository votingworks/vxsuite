import React from 'react';
import { LinkButton, H1 } from '@votingworks/ui';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { FixedViewport, ListActionsRow } from './layout';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import { getBallotsFinalizedAt, listPrecincts } from './api';
import { useTitle } from './hooks/use_title';
import { PrecinctAudioPanel } from './precinct_audio_panel';
import { PrecinctForm } from './precinct_form2';
import { PrecinctList } from './precincts_list2';
import * as api from './api';

export function PrecinctsScreen2(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const precinctParamRoutes = electionParamRoutes.precincts2;
  useTitle(routes.election(electionId).precincts2.root.title);

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

const Body = styled.div`
  display: flex;
  height: 100%;
  overflow: hidden;
  width: 100%;

  /* Sidebar */
  > :first-child {
    min-width: min-content;
    max-width: min(25%, 17rem);
    width: 100%;
  }

  /* Content pane */
  > :last-child {
    flex-grow: 1;
  }
`;

const EditPanel = styled.div`
  height: 100%;
  overflow: hidden;
`;

function Content(): React.ReactNode {
  const { electionId, precinctId } = useParams<
    ElectionIdParams & { precinctId?: string }
  >();

  const precincts = api.listPrecincts.useQuery(electionId);
  const ballotsFinalizedAt = api.getBallotsFinalizedAt.useQuery(electionId);

  if (!precincts.isSuccess || !ballotsFinalizedAt.isSuccess) return null;

  const precinctRoutes = routes.election(electionId).precincts2;
  const precinctParamRoutes = electionParamRoutes.precincts2;

  /**
   * Used as a route redirect, to auto-select the first available contest for
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
            path={precinctParamRoutes.audio(
              ':precinctId',
              ':ttsMode',
              ':stringKey',
              ':subkey'
            )}
            exact
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

function AddPrecinctForm() {
  const { electionId } = useParams<ElectionIdParams>();
  const precinctRoutes = routes.election(electionId).precincts2;
  const { title } = precinctRoutes.add;

  return (
    <EditPanel>
      <PrecinctForm editing electionId={electionId} title={title} />
    </EditPanel>
  );
}

function EditPrecinctForm(): React.ReactNode {
  type RouteParams = ElectionIdParams & { precinctId: string };
  const { electionId, precinctId } = useParams<RouteParams>();
  const listPrecinctsQuery = listPrecincts.useQuery(electionId);
  const finalizedAt = getBallotsFinalizedAt.useQuery(electionId);

  const precinctParamRoutes = electionParamRoutes.precincts2;
  const precinctRoutes = routes.election(electionId).precincts2;

  if (!listPrecinctsQuery.isSuccess) return null;

  const precincts = listPrecinctsQuery.data;
  const savedPrecinct = precincts.find((c) => c.id === precinctId);
  const canEdit = !finalizedAt.data && !!savedPrecinct;

  return (
    <EditPanel>
      <Switch>
        {canEdit && (
          <Route path={precinctParamRoutes.edit(':precinctId').path} exact>
            <PrecinctForm
              electionId={electionId}
              key={precinctId}
              editing
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
