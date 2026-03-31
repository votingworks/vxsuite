import React from 'react';
import styled from 'styled-components';
import {
  Switch,
  Route,
  Redirect,
  useParams,
  useHistory,
} from 'react-router-dom';

import { H1, LinkButton } from '@votingworks/ui';

import * as api from './api';
import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import { useTitle } from './hooks/use_title';
import { PollingPlaceForm } from './polling_place_form';
import { PollingPlaceList } from './polling_place_list';
import { FixedViewport, ListActionsRow } from './layout';
import { PollingPlaceAudioPanel } from './polling_place_audio_panel';

export function PollingPlacesScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const pollingPlaceParamRoutes = electionParamRoutes.pollingPlaces;
  useTitle(routes.election(electionId).pollingPlaces.root.title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>Polling Places</H1>
      </Header>
      <Switch>
        <Route
          path={pollingPlaceParamRoutes.view(':placeId')}
          component={Content}
        />
        <Route path={pollingPlaceParamRoutes.root.path} component={Content} />
        <Redirect to={pollingPlaceParamRoutes.root.path} />
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
    max-width: min(25%, 25rem);
    min-width: min-content;
    width: 100%;
  }

  > ${EditPanel} {
    flex-grow: 1;
  }
`;

function Content(): React.ReactNode {
  type RouteParams = ElectionIdParams & { placeId?: string };
  const { electionId, placeId } = useParams<RouteParams>();

  const placeRoutes = routes.election(electionId).pollingPlaces;
  const paramRoutes = electionParamRoutes.pollingPlaces;
  const nav = useNav(electionId);

  const places = api.listPollingPlaces.useQuery(electionId);
  const finalizedAt = api.getBallotsFinalizedAt.useQuery(electionId);

  if (!places.isSuccess || !finalizedAt.isSuccess) return null;

  const finalized = !!finalizedAt.data;

  return (
    <Viewport>
      <ListActionsRow>
        <LinkButton
          variant="primary"
          icon="Add"
          to={placeRoutes.add}
          disabled={finalized}
        >
          Add Polling Place
        </LinkButton>
      </ListActionsRow>

      <Body>
        <PollingPlaceList
          onSelect={nav.goToView}
          places={places.data}
          selectedId={placeId}
        />
        <Switch>
          <Route
            path={paramRoutes.audio({
              placeId: ':placeId',
              stringKey: ':stringKey',
            })}
          >
            <EditPanel>
              <PollingPlaceAudioPanel />
            </EditPanel>
          </Route>

          <Route path={paramRoutes.add} component={AddForm} />

          <Route path={paramRoutes.view(':placeId')} component={EditForm} />
        </Switch>
      </Body>
    </Viewport>
  );
}

function AddForm(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const nav = useNav(electionId);

  return (
    <EditPanel>
      <PollingPlaceForm
        editing
        electionId={electionId}
        exit={nav.goToRoot}
        switchToEdit={nav.goToEdit}
        switchToView={nav.goToView}
      />
    </EditPanel>
  );
}

function EditForm(): JSX.Element | null {
  type RouteParams = ElectionIdParams & { placeId: string };
  const { electionId, placeId } = useParams<RouteParams>();

  const placesQuery = api.listPollingPlaces.useQuery(electionId);
  const finalizedAtQuery = api.getBallotsFinalizedAt.useQuery(electionId);

  const paramRoutes = electionParamRoutes.pollingPlaces;
  const placeRoutes = routes.election(electionId).pollingPlaces;
  const nav = useNav(electionId);

  if (!placesQuery.isSuccess || !finalizedAtQuery.isSuccess) return null;

  const pollingPlaces = placesQuery.data;
  const savedPollingPlace = pollingPlaces.find((p) => p.id === placeId);
  const finalized = !!finalizedAtQuery.data;
  const canEdit = !finalized && !!savedPollingPlace;

  return (
    <EditPanel>
      <Switch>
        {canEdit && (
          <Route path={paramRoutes.edit(':placeId')} exact>
            <PollingPlaceForm
              editing
              electionId={electionId}
              key={placeId}
              exit={nav.goToRoot}
              savedPlace={savedPollingPlace}
              switchToEdit={nav.goToEdit}
              switchToView={nav.goToView}
            />
          </Route>
        )}

        {savedPollingPlace && (
          <Route path={paramRoutes.view(':placeId')} exact>
            <PollingPlaceForm
              editing={false}
              electionId={electionId}
              key={placeId}
              exit={nav.goToRoot}
              savedPlace={savedPollingPlace}
              switchToEdit={nav.goToEdit}
              switchToView={nav.goToView}
            />
          </Route>
        )}

        <Redirect
          to={
            savedPollingPlace
              ? placeRoutes.view(placeId)
              : placeRoutes.root.path
          }
        />
      </Switch>
    </EditPanel>
  );
}

function useNav(electionId: string) {
  const history = useHistory();
  const placeRoutes = routes.election(electionId).pollingPlaces;

  return {
    goToRoot: () => history.replace(placeRoutes.root.path),
    goToEdit: (id: string) => history.replace(placeRoutes.edit(id)),
    goToView: (id: string) => history.replace(placeRoutes.view(id)),
  };
}
