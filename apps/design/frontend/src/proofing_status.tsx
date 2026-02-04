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
  Modal,
  P,
  useQueryChangeListener,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { BackgroundTask, ExportQaRun } from '@votingworks/design-backend';

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
  const isExportInProgress =
    (mainExports.isSuccess &&
      mainExports.data.task &&
      !mainExports.data.task.completedAt) ||
    (testDecks.isSuccess &&
      testDecks.data.task &&
      !testDecks.data.task.completedAt) ||
    false;
  const latestQaRunQuery = api.getLatestExportQaRun.useQuery(electionId, {
    isExportInProgress,
  });

  const approve = api.approveBallots.useMutation();
  const unfinalize = api.unfinalizeBallots.useMutation();

  const [showQaWarningModal, setShowQaWarningModal] = React.useState(false);

  useQueryChangeListener(latestQaRunQuery, {
    onChange(newLatestRun) {
      if (newLatestRun?.status === 'success') {
        setShowQaWarningModal(false);
      }
    }
  });

  if (
    !approvedAt.isSuccess ||
    !finalizedAt.isSuccess ||
    !mainExports.isSuccess ||
    !testDecks.isSuccess ||
    !latestQaRunQuery.isSuccess
  ) {
    return null;
  }

  const hasTestDecks = !!testDecks.data.task;
  const exporting =
    !mainExports.data.task?.completedAt ||
    (hasTestDecks && !testDecks.data.task?.completedAt);

  const hasError =
    !!mainExports.data.task?.error || !!testDecks.data.task?.error;

  // Get the most recent QA run (if any)
  const latestQaRun = latestQaRunQuery.data;
  const qaInProgress =
    latestQaRun?.status === 'pending' ||
    latestQaRun?.status === 'in_progress';
  const qaFailed = latestQaRun?.status === 'failure';
  const qaComplete = latestQaRun?.status === 'success';
  const qaIncompleteOrFailed = latestQaRun && !qaComplete;

  const approving = approve.isLoading;
  const unfinalizing = unfinalize.isLoading;
  const approveDisabled = approving || exporting || hasError || unfinalizing;
  const approved = !!approvedAt.data;
  const finalized = !!finalizedAt.data;

  function handleApproveClick() {
    if (qaIncompleteOrFailed) {
      setShowQaWarningModal(true);
    } else {
      approve.mutate({ electionId });
    }
  }

  function handleConfirmApprove() {
    setShowQaWarningModal(false);
    approve.mutate({ electionId });
  }

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

          {latestQaRun && <QaStatus qaRun={latestQaRun} />}
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

          {!approved && (
            <Button
              disabled={approveDisabled}
              icon="Done"
              onPress={handleApproveClick}
              variant={approveDisabled ? 'neutral' : 'primary'}
            >
              Approve
            </Button>
          )}
        </Row>
      )}

      {showQaWarningModal && (
        <Modal
          title="QA Check Incomplete"
          content={
            <div>
              {qaFailed ? (
                <P>
                  The automated QA check has failed
                  {latestQaRun?.statusMessage &&
                    `: ${latestQaRun.statusMessage}`}
                  . Are you sure you want to approve these ballots?
                </P>
              ) : qaInProgress ? (
                <P>
                  The automated QA check is still running. Are you sure you want
                  to approve these ballots before QA is complete?
                </P>
              ) : (
                <P>
                  The automated QA check has not completed. Are you sure you
                  want to approve these ballots?
                </P>
              )}
              {latestQaRun?.resultsUrl && (
                <P>
                  <a
                    href={latestQaRun.resultsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    (📑 Results)
                  </a>
                </P>
              )}
            </div>
          }
          actions={
            <React.Fragment>
              <Button onPress={handleConfirmApprove} variant="danger">
                Approve Anyway
              </Button>
              <Button onPress={() => setShowQaWarningModal(false)}>
                Cancel
              </Button>
            </React.Fragment>
          }
          onOverlayClick={() => setShowQaWarningModal(false)}
        />
      )}
    </Container>
  );
}

function JobLink({ jobUrl }: { jobUrl?: string }): React.ReactNode {
  if (!jobUrl) return null;
  return (
    <Caption>
      <a href={jobUrl} target="_blank" rel="noopener noreferrer">
        (View CI Job)
      </a>
    </Caption>
  );
}

function QaStatus({ qaRun }: { qaRun: ExportQaRun }): React.ReactNode {
  const { status, statusMessage, resultsUrl, jobUrl, createdAt, updatedAt } = qaRun;

  if (status === 'pending') {
    return (
      <StatusLine done={false}>
        QA check pending&hellip;
      </StatusLine>
    );
  }

  if (status === 'in_progress') {
    return (
      <Callout color="warning" icon="Info">
        <div>
          <P style={{ lineHeight: 1 }} weight="bold">
            QA Check Running
          </P>
          {statusMessage && <P>{statusMessage}</P>}
          <JobLink jobUrl={jobUrl} />
        </div>
      </Callout>
    );
  }

  if (status === 'failure') {
    return (
      <Callout color="danger" icon="Danger">
        <div>
          <P style={{ lineHeight: 1 }} weight="bold">
            QA Check Failed
            {resultsUrl && (
              <P>
                <a href={resultsUrl} target="_blank" rel="noopener noreferrer">
                  (📑 Results)
                </a>
              </P>
            )}
          </P>
          {statusMessage && <P>{statusMessage}</P>}
          <JobLink jobUrl={jobUrl} />
        </div>
      </Callout>
    );
  }

  if (status === 'success') {
    return (
      <StatusLine date={updatedAt ?? createdAt} done>
        QA check passed
        {resultsUrl && (
          <Caption>
            <a href={resultsUrl} target="_blank" rel="noopener noreferrer">
              (📑 Results)
            </a>
          </Caption>
        )}
        <JobLink jobUrl={jobUrl} />
      </StatusLine>
    );
  }

  return null;
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
          <P style={{ lineHeight: 1 }} weight="bold">
            {title} &bull; Export Error
          </P>
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
