import type React from 'react';
import styled from 'styled-components';
import { Switch, Route, Redirect, useParams } from 'react-router-dom';

import { H1, LinkButton } from '@votingworks/ui';

import {
  FixedViewport,
  ListActionsRow,
} from '@votingworks/election-definition-ui';
import { ElectionNavScreen, Header } from './nav_screen.js';
import {
  type ElectionIdParams,
  electionParamRoutes,
  routes,
} from './routes.js';
import {
  getBallotsFinalizedAt,
  getElectionInfo,
  listPrecincts,
} from './api.js';
import { useTitle } from './hooks/use_title.js';
import { PrecinctForm } from './precincts_form.js';
import { PrecinctList } from './precincts_list.js';
import { PrecinctAudioPanel } from './precinct_audio_panel.js';

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
