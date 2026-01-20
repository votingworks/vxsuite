import React from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';

import { Button, Card, H3, P } from '@votingworks/ui';

import {
  MainExportTaskMetadata,
  TestDecksTaskMetadata,
} from '@votingworks/design-backend';
import * as api from './api';
import { ElectionIdParams } from './routes';
import { downloadFile } from './utils';

export const DownloadsContainer = styled.div`
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;

  > * {
    width: 100%;
  }

  :empty {
    display: none;
  }

  @media (min-width: 60rem) {
    grid-template-columns: 1fr 1fr;
  }

  @media (min-width: 90rem) {
    grid-template-columns: 1fr 1fr 1fr;
  }

  @media (min-width: 150rem) {
    grid-template-columns: 1fr 1fr 1fr 1fr;
  }
`;

export function Downloads(): React.ReactNode {
  const { electionId } = useParams<ElectionIdParams>();
  const mainTask = api.getElectionPackage.useQuery(electionId);
  const testDecks = api.getTestDecks.useQuery(electionId);

  if (!testDecks.isSuccess || !testDecks.isSuccess) return null;

  return (
    <DownloadsContainer>
      <ElectionPackage meta={mainTask.data} />
      <OfficialBallots meta={mainTask.data} />
      <SampleBallots meta={mainTask.data} />
      <TestBallots meta={mainTask.data} />
      <TestDecks meta={testDecks.data} />
    </DownloadsContainer>
  );
}

function ElectionPackage(props: { meta?: MainExportTaskMetadata }) {
  const { meta } = props;
  return !meta ? null : (
    <DownloadCard title="Election Package" url={meta.electionPackageUrl}>
      Save this package to a USB drive and use it to configure the VxAdmin
      laptop.
    </DownloadCard>
  );
}

function OfficialBallots(props: { meta?: MainExportTaskMetadata }) {
  const { meta } = props;
  return !meta ? null : (
    <DownloadCard title="Official Ballots" url={meta.officialBallotsUrl}>
      Official precinct and absentee ballots, ready for printing.
    </DownloadCard>
  );
}

function SampleBallots(props: { meta?: MainExportTaskMetadata }) {
  const { meta } = props;
  return !meta ? null : (
    <DownloadCard title="Sample Ballots" url={meta.sampleBallotsUrl}>
      Sample copies of all official precinct and absentee ballots.
    </DownloadCard>
  );
}

function TestBallots(props: { meta?: MainExportTaskMetadata }) {
  const { meta } = props;
  return !meta ? null : (
    <DownloadCard title="Test Ballots" url={meta.testBallotsUrl}>
      Unofficial ballots for use with VotingWorks machines in Test Mode.
    </DownloadCard>
  );
}

function TestDecks(props: { meta?: TestDecksTaskMetadata }) {
  const { meta } = props;
  return !meta ? null : (
    <DownloadCard title="L&A Test Decks" url={meta.url}>
      Marked ballots for Logic and Accuracy testing.
    </DownloadCard>
  );
}

const DownloadCardContents = styled.div`
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr min-content;
  height: 100%;

  > :last-child {
    align-self: center;
    justify-self: end;
  }

  @media (min-width: 40rem) {
    grid-template-columns: 1fr min-content;
    grid-template-rows: 1fr;
  }
`;

interface DownloadCardProps {
  children?: React.ReactNode;
  title: React.ReactNode;
  url?: string;
}

function DownloadCard(props: DownloadCardProps): React.ReactNode {
  const { children, title, url } = props;

  if (!url) return null;

  const action = (
    <Button
      icon="Download"
      color="primary"
      fill="tinted"
      onPress={downloadFile}
      value={url}
    >
      Download
    </Button>
  );

  return (
    <Card footerAlign="right">
      <DownloadCardContents>
        <div>
          <H3>{title}</H3>
          <P style={{ maxWidth: '30rem' }}>{children}</P>
        </div>
        <div>{action}</div>
      </DownloadCardContents>
    </Card>
  );
}
