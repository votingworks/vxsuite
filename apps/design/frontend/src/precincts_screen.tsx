import React from 'react';
import { Switch, Route, Redirect, useParams } from 'react-router-dom';

import { H1, MainContent, Breadcrumbs } from '@votingworks/ui';

import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, electionParamRoutes, routes } from './routes';
import { getBallotsFinalizedAt, listPrecincts } from './api';
import { useTitle } from './hooks/use_title';
import { PrecinctForm } from './precincts_form';
import { PrecinctList } from './precincts_list';

export function PrecinctsScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const precinctParamRoutes = electionParamRoutes.precincts;
  useTitle(routes.election(electionId).precincts.root.title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Switch>
        <Route
          path={precinctParamRoutes.add.path}
          exact
          component={AddPrecinctForm}
        />
        <Route
          path={precinctParamRoutes.edit(':precinctId').path}
          exact
          component={EditPrecinctForm}
        />
        <Route path={precinctParamRoutes.root.path}>
          <Header>
            <H1>Precincts</H1>
          </Header>
          <MainContent>
            <PrecinctList />
          </MainContent>
        </Route>
      </Switch>
    </ElectionNavScreen>
  );
}

function AddPrecinctForm(): JSX.Element | null {
  const { electionId } = useParams<ElectionIdParams>();
  const precinctRoutes = routes.election(electionId).precincts;
  const { title } = precinctRoutes.add;

  return (
    <React.Fragment>
      <Header>
        <Breadcrumbs
          currentTitle={title}
          parentRoutes={[precinctRoutes.root]}
        />
        <H1>{title}</H1>
      </Header>
      <MainContent>
        <PrecinctForm electionId={electionId} />
      </MainContent>
    </React.Fragment>
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

  const { title } = precinctRoutes.edit(precinctId);

  return (
    <Switch>
      {canEdit && (
        <Route path={precinctParamRoutes.edit(':precinctId').path} exact>
          <Header>
            <Breadcrumbs
              currentTitle={title}
              parentRoutes={[precinctRoutes.root]}
            />
            <H1>{title}</H1>
          </Header>
          <MainContent>
            <PrecinctForm
              electionId={electionId}
              savedPrecinct={savedPrecinct}
            />
          </MainContent>
        </Route>
      )}

      {/* [TODO] Add a `/view` route */}

      {/* [TODO] Redirect to `/view` if a saved precinct exists: */}
      <Redirect to={precinctRoutes.root.path} />
    </Switch>
  );
}
