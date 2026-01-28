import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';

import {
  LinkButton,
  P,
  Button,
  H3,
  Icons,
  Modal,
  Callout as CalloutBase,
  CalloutProps,
  Font,
} from '@votingworks/ui';
import { FinalizationBlocker } from '@votingworks/design-backend';

import * as api from './api';
import { ElectionIdParams, routes } from './routes';
import { Row } from './layout';

function getBlockerMessage(blocker: FinalizationBlocker): string {
  switch (blocker) {
    case 'missingSignature':
      return 'A clerk signature is required. Please add a signature on the Election Info screen.';
    case 'missingSeal':
      return 'A jurisdiction seal is required. Please add a seal on the Election Info screen.';
    case 'noDistricts':
      return 'At least one district is required. Please add districts on the Districts screen.';
    case 'noContests':
      return 'At least one contest is required. Please add contests on the Contests screen.';
    case 'noPrecincts':
      return 'At least one precinct is required. Please add precincts on the Precincts screen.';
    default:
      return 'An unknown error occurred.';
  }
}

export function BallotsStatus(): React.ReactNode {
  const [isConfirmingFinalize, setIsConfirmingFinalize] = useState(false);
  const [finalizationError, setFinalizationError] = useState<
    FinalizationBlocker[]
  >([]);

  const { electionId } = useParams<ElectionIdParams>();
  const listBallotStylesQuery = api.listBallotStyles.useQuery(electionId);
  const approvedAtQuery = api.getBallotsApprovedAt.useQuery(electionId);
  const finalizedAtQuery = api.getBallotsFinalizedAt.useQuery(electionId);

  const finalizeBallotsMutation = api.finalizeBallots.useMutation();

  if (
    !listBallotStylesQuery.isSuccess ||
    !finalizedAtQuery.isSuccess ||
    !approvedAtQuery.isSuccess
  ) {
    return null;
  }

  const ballotStyles = listBallotStylesQuery.data;
  const finalized = !!finalizedAtQuery.data;
  const approved = !!approvedAtQuery.data;

  if (ballotStyles.length === 0) {
    return (
      <Callout color="neutral" icon={<Icons.Info />} title="Ballots Incomplete">
        VxDesign will create ballot styles for your election once you have
        created districts, precincts, and contests.
      </Callout>
    );
  }

  if (approved) {
    return (
      <Callout
        action={
          <LinkButton
            rightIcon="Next"
            variant="primary"
            to={routes.election(electionId).downloads.path}
          >
            View Downloads
          </LinkButton>
        }
        color="primary"
        icon={<Icons.Done color="primary" />}
        title="Ready for Download"
      >
        Ballots are finalized and approved for download.
      </Callout>
    );
  }

  if (finalized) {
    return (
      <Callout
        color="neutral"
        icon={<Icons.Done color="primary" />}
        title="Ballots Finalized"
      >
        You will receive an email when the election package is ready for
        download.
      </Callout>
    );
  }

  return (
    <React.Fragment>
      <Callout
        action={
          <Button
            icon="Done"
            color="primary"
            fill="outlined"
            disabled={finalizeBallotsMutation.isLoading}
            onPress={() => setIsConfirmingFinalize(true)}
          >
            Finalize Ballots
          </Button>
        }
        color="neutral"
        icon={<Icons.Info />}
        title="Ballots Not Finalized"
      >
        Proof each ballot style, then finalize ballots.
      </Callout>

      {isConfirmingFinalize && (
        <Modal
          title="Confirm Finalize Ballots"
          content={
            <P>
              Once ballots are finalized, the election may not be edited
              further.
            </P>
          }
          actions={
            <React.Fragment>
              <Button
                icon="Done"
                onPress={() =>
                  finalizeBallotsMutation.mutate(
                    { electionId },
                    {
                      onSuccess: (result) => {
                        if (result.isOk()) {
                          setIsConfirmingFinalize(false);
                          setFinalizationError([]);
                        } else {
                          setIsConfirmingFinalize(false);
                          setFinalizationError(result.err());
                        }
                      },
                    }
                  )
                }
                variant="primary"
              >
                Finalize Ballots
              </Button>
              <Button onPress={() => setIsConfirmingFinalize(false)}>
                Cancel
              </Button>
            </React.Fragment>
          }
          onOverlayClick={
            /* istanbul ignore next - manually tested */
            () => setIsConfirmingFinalize(false)
          }
        />
      )}

      {finalizationError.length > 0 && (
        <Modal
          title="Cannot Finalize Ballots"
          content={
            <React.Fragment>
              <P>The following issues must be resolved before finalizing:</P>
              <ul>
                {finalizationError.map((blocker) => (
                  <li key={blocker}>{getBlockerMessage(blocker)}</li>
                ))}
              </ul>
            </React.Fragment>
          }
          actions={
            <Button onPress={() => setFinalizationError([])}>Close</Button>
          }
          onOverlayClick={
            /* istanbul ignore next - manually tested */
            () => setFinalizationError([])
          }
        />
      )}
    </React.Fragment>
  );
}

const CalloutContent = styled.div`
  align-items: baseline;
  display: flex;
  flex-grow: 1;
  gap: 0.5rem;
`;

function Callout(
  props: CalloutProps & {
    action?: React.ReactNode;
    icon: React.ReactNode;
    title: React.ReactNode;
  }
) {
  const { action, children, icon, title, ...rest } = props;
  return (
    <CalloutBase style={{ maxWidth: '40rem', minWidth: '4rem' }} {...rest}>
      <CalloutContent>
        <H3 aria-hidden>{icon}</H3>
        <Row
          style={{
            alignItems: 'center',
            flexGrow: 1,
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ flexGrow: 1 }}>
            <H3>{title}</H3>
            <Font>{children}</Font>
          </div>

          {action}
        </Row>
      </CalloutContent>
    </CalloutBase>
  );
}
