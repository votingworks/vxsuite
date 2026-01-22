import React from 'react';
import { useParams } from 'react-router-dom';

import { H1, MainContent } from '@votingworks/ui';

import { ElectionNavScreen, Header } from './nav_screen';
import { ElectionIdParams, routes } from './routes';
import { useTitle } from './hooks/use_title';
import { Downloads } from './downloads';

export function DownloadsScreen(): React.ReactNode {
  const { electionId } = useParams<ElectionIdParams>();
  const { title } = routes.election(electionId).downloads;

  useTitle(title);

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>{title}</H1>
      </Header>
      <MainContent>
        <Downloads />
      </MainContent>
    </ElectionNavScreen>
  );
}
