import React from 'react';
import { useParams } from 'react-router-dom';

import { H1, MainContent } from '@votingworks/ui';

import { ElectionNavScreen, Header } from './nav_screen.js';
import { ElectionIdParams, routes } from './routes.js';
import { useTitle } from './hooks/use_title.js';
import { Downloads } from './downloads.js';
import * as api from './api.js';
import { BallotsStatus } from './ballots_status.js';

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
