import React from 'react';
import { useParams } from 'react-router-dom';

import { H1, MainContent } from '@votingworks/ui';

import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, routes } from './routes';
import { useTitle } from './hooks/use_title';
import { Downloads } from './downloads';
import * as api from './api';
import { BallotsStatus } from './ballots_status';

export function DownloadsScreen(): React.ReactNode {
  const { electionId } = useParams<ElectionIdParams>();
  const { title } = routes.election(electionId).downloads;

  useTitle(title);

  const approvedAt = api.getBallotsApprovedAt.useQuery(electionId);
  if (!approvedAt.isSuccess) return null;

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>{title}</H1>
      </Header>
      <MainContent>
        {approvedAt.data ? <Downloads /> : <BallotsStatus />}
      </MainContent>
    </ElectionNavScreen>
  );
}
