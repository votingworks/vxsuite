import React from 'react';
import {
  H1,
  Button,
  Callout,
  DesktopPalette,
  Font,
  useCurrentTheme,
} from '@votingworks/ui';
import { Route, Switch, useParams, useHistory } from 'react-router-dom';
import { ElectionStringKey, type Party } from '@votingworks/types';
import type { DuplicatePartyError } from '@votingworks/hub-backend';
import styled from 'styled-components';
import {
  TooltipContainer,
  Tooltip,
  FixedViewport,
  FormBody,
  FormFooter,
  InputWithAudio,
  ListActionsRow,
} from '@votingworks/election-definition-ui';
import { ElectionNavScreen, Header } from './nav_screen.js';
import {
  type ElectionIdParams,
  electionParamRoutes,
  routes,
} from './routes.js';
import { getBallotsFinalizedAt, getElectionInfo, listParties } from './api.js';
import { useTitle } from './hooks/use_title.js';
import { generateId } from './utils.js';
import * as api from './api.js';
import { FormFixed } from './form_fixed.js';
import { PartyAudioPanel } from './party_audio_panel.js';

export function PartiesScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const partiesParamRoutes = electionParamRoutes.parties;

  const { title } = partiesParamRoutes.root;
  useTitle(title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>{title}</H1>
      </Header>
      <Switch>
        <Route path={partiesParamRoutes.edit.path}>
          <Contents editing />
        </Route>
        <Route path={partiesParamRoutes.root.path}>
          <Contents editing={false} />
        </Route>
      </Switch>
    </ElectionNavScreen>
  );
}
