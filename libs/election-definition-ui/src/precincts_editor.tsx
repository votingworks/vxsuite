import type React from 'react';
import styled from 'styled-components';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import type { ElectionId, PrecinctId } from '@votingworks/types';
import { LinkButton } from '@votingworks/ui';
import { useElectionDefinitionApi } from './election_definition_context.js';
import { FixedViewport, ListActionsRow } from './layout.js';
import {
  type ListDetailRoutes,
  useListDetailRoutes,
} from './list_detail_routes.js';
import { PrecinctForm } from './precincts_form.js';
import { PrecinctList } from './precincts_list.js';

export interface PrecinctsEditorProps {
  electionId: ElectionId;
  isLocked?: boolean;
  AudioPanel?: React.ComponentType;
}

interface ContentProps extends PrecinctsEditorProps {
  precinctRoutes: ListDetailRoutes;
}

export function PrecinctsEditor(props: PrecinctsEditorProps): JSX.Element {
  const precinctRoutes = useListDetailRoutes(
    'precinctId',
    ':stringKey/:subkey'
  );

  return (
    <Switch>
      <Route path={precinctRoutes.viewPath}>
        <Content {...props} precinctRoutes={precinctRoutes} />
      </Route>
      <Route path={precinctRoutes.rootPath}>
        <Content {...props} precinctRoutes={precinctRoutes} />
      </Route>
    </Switch>
  );
}

const Viewport = styled(FixedViewport)<{ hasActionsRow: boolean }>`
  display: grid;
  grid-template-rows: ${(p) => (p.hasActionsRow ? 'min-content 1fr' : '1fr')};
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

function Content(props: ContentProps): JSX.Element | null {
  const { electionId, isLocked, AudioPanel, precinctRoutes } = props;
  const { precinctId } = useParams<{ precinctId?: PrecinctId }>();

  const api = useElectionDefinitionApi();
  const precincts = api.listPrecincts.useQuery(electionId);
  const electionInfoQuery = api.getElectionInfo.useQuery(electionId);

  if (!precincts.isSuccess || !electionInfoQuery.isSuccess) {
    return null;
  }

  /**
   * Used as a route redirect, to auto-select the first available precinct for
   * convenience, when navigating to the root route:
   */
  const defaultPrecinctUrl =
    !precinctId && precincts.data.length > 0
      ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        precinctRoutes.viewUrl(precincts.data[0]!.id)
      : null;

  const hasExternalSource = Boolean(electionInfoQuery.data.externalSource);

  return (
    <Viewport hasActionsRow={!hasExternalSource}>
      {!hasExternalSource && (
        <ListActionsRow>
          <LinkButton
            variant="primary"
            icon="Add"
            to={precinctRoutes.addUrl}
            disabled={isLocked}
          >
            Add Precinct
          </LinkButton>
        </ListActionsRow>
      )}

      <Body>
        <PrecinctList electionId={electionId} precinctRoutes={precinctRoutes} />
        <Switch>
          {AudioPanel && (
            <Route path={precinctRoutes.audioPath}>
              <EditPanel>
                <AudioPanel />
              </EditPanel>
            </Route>
          )}

          <Route path={precinctRoutes.addPath}>
            <EditPanel>
              <PrecinctForm
                editing
                electionId={electionId}
                isLocked={isLocked}
                precinctRoutes={precinctRoutes}
                title="Add Precinct"
              />
            </EditPanel>
          </Route>

          <Route path={precinctRoutes.viewPath}>
            <EditPrecinctForm {...props} />
          </Route>

          {defaultPrecinctUrl && <Redirect to={defaultPrecinctUrl} />}
        </Switch>
      </Body>
    </Viewport>
  );
}

function EditPrecinctForm(props: ContentProps): JSX.Element | null {
  const { electionId, isLocked, AudioPanel, precinctRoutes } = props;
  const { precinctId } = useParams<{ precinctId: PrecinctId }>();

  const api = useElectionDefinitionApi();
  const listPrecinctsQuery = api.listPrecincts.useQuery(electionId);

  // @coverage-defer
  if (!listPrecinctsQuery.isSuccess) {
    return null;
  }

  const precincts = listPrecinctsQuery.data;
  const savedPrecinct = precincts.find((p) => p.id === precinctId);
  const canEdit = !isLocked && !!savedPrecinct;
  const audioUrl = AudioPanel ? precinctRoutes.audioUrl : undefined;

  return (
    <EditPanel>
      <Switch>
        {canEdit && (
          <Route path={precinctRoutes.editPath} exact>
            <PrecinctForm
              audioUrl={audioUrl}
              editing
              electionId={electionId}
              isLocked={isLocked}
              key={precinctId}
              precinctRoutes={precinctRoutes}
              savedPrecinct={savedPrecinct}
              title="Edit Precinct"
            />
          </Route>
        )}

        {savedPrecinct && (
          <Route path={precinctRoutes.viewPath} exact>
            <PrecinctForm
              audioUrl={audioUrl}
              electionId={electionId}
              editing={false}
              isLocked={isLocked}
              key={precinctId}
              precinctRoutes={precinctRoutes}
              savedPrecinct={savedPrecinct}
              title="Precinct Info"
            />
          </Route>
        )}

        <Redirect
          to={
            savedPrecinct
              ? precinctRoutes.viewUrl(precinctId)
              : precinctRoutes.rootUrl
          }
        />
      </Switch>
    </EditPanel>
  );
}
