import React from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';

import {
  Button,
  Callout,
  Caption,
  Card,
  Font,
  Icons,
  P,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { BackgroundTask } from '@votingworks/design-backend';

import { ElectionIdParams, routes } from './routes';
import { Row } from './layout';
import * as api from './api';
import { TaskProgress } from './task_progress';

const Container = styled.div`
  align-items: flex-start;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

export function ProofingStatus(): React.ReactNode {
  const { electionId } = useParams<ElectionIdParams>();

  const approvedAt = api.getBallotsApprovedAt.useQuery(electionId);
  const finalizedAt = api.getBallotsFinalizedAt.useQuery(electionId);
  const mainExports = api.getElectionPackage.useQuery(electionId);
  const testDecks = api.getTestDecks.useQuery(electionId);
  const user = api.getUser.useQuery();

  const approve = api.approveBallots.useMutation();
  const unfinalize = api.unfinalizeBallots.useMutation();

  if (
    !approvedAt.isSuccess ||
    !finalizedAt.isSuccess ||
    !mainExports.isSuccess ||
    !testDecks.isSuccess ||
    !user.isSuccess
  ) {
    return null;
  }

  const hasTestDecks = !!testDecks.data.task;
  const exporting =
    !mainExports.data.task?.completedAt ||
    (hasTestDecks && !testDecks.data.task?.completedAt);

  const hasError =
    !!mainExports.data.task?.error || !!testDecks.data.task?.error;

  const approving = approve.isLoading;
  const unfinalizing = unfinalize.isLoading;
  const approveDisabled = approving || exporting || hasError || unfinalizing;
  const approved = !!approvedAt.data;
  const finalized = !!finalizedAt.data;

  return (
    <Container>
      <Font weight="bold">Proofing Status</Font>

      {finalizedAt.data ? (
        <React.Fragment>
          <StatusLine date={finalizedAt.data} done>
            Ballots finalized
          </StatusLine>

          <ExportStatus
            task={mainExports.data.task}
            title="Election Package & Ballots"
          />

          {hasTestDecks && (
            <ExportStatus task={testDecks.data.task} title="Test Decks" />
          )}
        </React.Fragment>
      ) : (
        <StatusLine done={false}>Ballots not finalized</StatusLine>
      )}

      {approvedAt.data ? (
        <React.Fragment>
          <StatusLine date={approvedAt.data} done>
            Ballots approved
          </StatusLine>
          <ApprovalNextSteps />
        </React.Fragment>
      ) : (
        <StatusLine done={false}>Ballots not approved</StatusLine>
      )}

      {finalized && (
        <Row style={{ flexWrap: 'wrap-reverse', gap: '0.5rem' }}>
          <Button
            disabled={unfinalizing || approving}
            icon="Delete"
            onPress={unfinalize.mutate}
            value={{ electionId }}
            variant="danger"
          >
            Unfinalize
          </Button>

          {user.data.type === 'support_user' && !approved && (
            <Button
              disabled={approveDisabled}
              icon="Done"
              onPress={approve.mutate}
              value={{ electionId }}
              variant={approveDisabled ? 'neutral' : 'primary'}
            >
              Approve
            </Button>
          )}
        </Row>
      )}
    </Container>
  );
}

function ApprovalNextSteps(): React.ReactNode {
  const [justCopied, setJustCopied] = React.useState(false);

  const { electionId } = useParams<ElectionIdParams>();
  const baseUrl = api.getBaseUrl.useQuery();

  React.useEffect(() => {
    if (!justCopied) return;

    const timer = window.setTimeout(() => setJustCopied(false), 1000);
    return () => window.clearTimeout(timer);
  }, [justCopied]);

  if (!baseUrl.isSuccess) return null;

  const downloadsPath = routes.election(electionId).downloads.path;
  const downloadsUrl = new URL(`${downloadsPath}`, baseUrl.data).toString();

  return (
    <Card>
      <Row style={{ alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <P weight="bold">Customer Downloads URL</P>
          <Font breakWord>{downloadsUrl}</Font>
        </div>

        <Button
          color="primary"
          disabled={justCopied}
          fill="outlined"
          icon={justCopied ? 'Done' : 'Copy'}
          onPress={async () => {
            await navigator.clipboard.writeText(downloadsUrl);
            setJustCopied(true);
          }}
        >
          {justCopied ? 'Copied' : 'Copy URL'}
        </Button>
      </Row>
    </Card>
  );
}

function ExportStatus(props: {
  task?: BackgroundTask;
  title: string;
}): React.ReactNode {
  const { task, title } = props;

  if (!task) return null;

  if (task.error) {
    return (
      <Callout color="danger" icon="Danger">
        <div>
          <P weight="bold">{title} &bull; Export Error</P>
          <P>{task.error}</P>
          <Caption>
            To restart the export, unfinalize and re-finalize the election.
          </Caption>
        </div>
      </Callout>
    );
  }

  if (!task.completedAt) {
    return (
      <TaskProgress
        style={{ alignSelf: 'stretch', maxWidth: '35rem' }}
        title={`Exporting ${title}`}
        task={task}
      />
    );
  }

  return (
    <StatusLine date={task.completedAt} done>
      {title} exported
    </StatusLine>
  );
}

export function StatusLine(props: {
  children: React.ReactNode;
  date?: Date;
  done: boolean;
}): JSX.Element {
  const { children, date, done } = props;

  return (
    <Row style={{ alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
      <Row style={{ alignItems: 'center', gap: '0.25rem' }}>
        {done ? (
          <Icons.Done color="success" />
        ) : (
          <Icons.Circle color="warning" />
        )}
        {date && (
          <Caption style={{ lineHeight: 1 }} weight="semiBold">
            {format.localeShortDateAndTime(date)}:
          </Caption>
        )}
      </Row>

      {children}
    </Row>
  );
}
