import React from 'react';
import {
  Button,
  Callout,
  H1,
  DesktopPalette,
  useCurrentTheme,
  Modal,
  P,
} from '@votingworks/ui';
import { Switch, Route, useParams, useHistory } from 'react-router-dom';
import styled from 'styled-components';

import { type District, ElectionStringKey } from '@votingworks/types';

import type { DuplicateDistrictError } from '@votingworks/hub-backend';
import { assertDefined } from '@votingworks/basics';
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
import {
  getBallotsFinalizedAt,
  getElectionInfo,
  listDistricts,
  updateDistricts,
} from './api.js';
import { generateId } from './utils.js';
import { useTitle } from './hooks/use_title.js';
import { DistrictAudioPanel } from './district_audio_panel.js';
import { FormFixed } from './form_fixed.js';

export function DistrictsScreen(): JSX.Element {
  const { electionId } = useParams<ElectionIdParams>();
  const districtParamRoutes = electionParamRoutes.districts;

  const { title } = districtParamRoutes.root;
  useTitle(title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>{title}</H1>
      </Header>
      <Switch>
        <Route path={districtParamRoutes.edit.path}>
          <Contents editing />
        </Route>
        <Route path={districtParamRoutes.root.path}>
          <Contents editing={false} />
        </Route>
      </Switch>
    </ElectionNavScreen>
  );
}
