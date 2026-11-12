import type React from 'react';
import styled from 'styled-components';
import {
  Redirect,
  Route,
  Switch,
  useHistory,
  useParams,
} from 'react-router-dom';
import type { ElectionId } from '@votingworks/types';
import { LinkButton } from '@votingworks/ui';
import { useElectionDefinitionApi } from './election_definition_context.js';
import { FixedViewport, ListActionsRow } from './layout.js';
import {
  type ListDetailRoutes,
  useListDetailRoutes,
} from './list_detail_routes.js';
import { PollingPlaceForm } from './polling_place_form.js';
import { PollingPlaceList } from './polling_place_list.js';

export interface PollingPlacesEditorProps {
  electionId: ElectionId;
  isLocked?: boolean;
  AudioPanel?: React.ComponentType;
}

interface ContentProps extends PollingPlacesEditorProps {
  placeRoutes: ListDetailRoutes;
}

export function PollingPlacesEditor(
  props: PollingPlacesEditorProps
): JSX.Element {
  const placeRoutes = useListDetailRoutes('placeId', ':stringKey');

  return (
    <Switch>
      <Route path={placeRoutes.viewPath}>
        <Content {...props} placeRoutes={placeRoutes} />
      </Route>
      <Route path={placeRoutes.rootPath}>
        <Content {...props} placeRoutes={placeRoutes} />
      </Route>
    </Switch>
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

function Content(props: ContentProps): JSX.Element | null {
  const { electionId, isLocked, AudioPanel, placeRoutes } = props;
  const { placeId } = useParams<{ placeId?: string }>();
  const nav = useNav(placeRoutes);

  const places =
    useElectionDefinitionApi().listPollingPlaces.useQuery(electionId);

  if (!places.isSuccess) return null;

  return (
    <Viewport>
      <ListActionsRow>
        <LinkButton
          variant="primary"
          icon="Add"
          to={placeRoutes.addUrl}
          disabled={isLocked}
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
          {AudioPanel && (
            <Route path={placeRoutes.audioPath}>
              <EditPanel>
                <AudioPanel />
              </EditPanel>
            </Route>
          )}

          <Route path={placeRoutes.addPath}>
            <EditPanel>
              <PollingPlaceForm
                editing
                electionId={electionId}
                exit={nav.goToRoot}
                isLocked={isLocked}
                switchToEdit={nav.goToEdit}
                switchToView={nav.goToView}
              />
            </EditPanel>
          </Route>

          <Route path={placeRoutes.viewPath}>
            <EditForm {...props} />
          </Route>
        </Switch>
      </Body>
    </Viewport>
  );
}

function EditForm(props: ContentProps): JSX.Element | null {
  const { electionId, isLocked, AudioPanel, placeRoutes } = props;
  const { placeId } = useParams<{ placeId: string }>();
  const nav = useNav(placeRoutes);

  const placesQuery =
    useElectionDefinitionApi().listPollingPlaces.useQuery(electionId);

  // @coverage-defer
  if (!placesQuery.isSuccess) return null;

  const savedPollingPlace = placesQuery.data.find((p) => p.id === placeId);
  const canEdit = !isLocked && !!savedPollingPlace;
  const audioUrl = AudioPanel ? placeRoutes.audioUrl : undefined;

  return (
    <EditPanel>
      <Switch>
        {canEdit && (
          <Route path={placeRoutes.editPath} exact>
            <PollingPlaceForm
              audioUrl={audioUrl}
              editing
              electionId={electionId}
              key={placeId}
              exit={nav.goToRoot}
              isLocked={isLocked}
              savedPlace={savedPollingPlace}
              switchToEdit={nav.goToEdit}
              switchToView={nav.goToView}
            />
          </Route>
        )}

        {savedPollingPlace && (
          <Route path={placeRoutes.viewPath} exact>
            <PollingPlaceForm
              audioUrl={audioUrl}
              editing={false}
              electionId={electionId}
              key={placeId}
              exit={nav.goToRoot}
              isLocked={isLocked}
              savedPlace={savedPollingPlace}
              switchToEdit={nav.goToEdit}
              switchToView={nav.goToView}
            />
          </Route>
        )}

        <Redirect
          to={
            savedPollingPlace
              ? placeRoutes.viewUrl(placeId)
              : placeRoutes.rootUrl
          }
        />
      </Switch>
    </EditPanel>
  );
}

function useNav(placeRoutes: ListDetailRoutes) {
  const history = useHistory();

  return {
    goToRoot: () => history.replace(placeRoutes.rootUrl),
    goToEdit: (id: string) => history.replace(placeRoutes.editUrl(id)),
    goToView: (id: string) => history.replace(placeRoutes.viewUrl(id)),
  };
}
