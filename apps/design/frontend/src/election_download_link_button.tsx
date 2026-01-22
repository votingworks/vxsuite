import { ButtonVariant, Icons, LinkButton } from '@votingworks/ui';
import React from 'react';
import type { ElectionListing } from '@votingworks/design-backend';
import * as api from './api';
import { Tooltip, TooltipContainer } from './tooltip';
import { routes } from './routes';

export interface CloneElectionButtonProps {
  election: ElectionListing;
  variant?: ButtonVariant;
}

export function ElectionDownloadLinkButton(
  props: CloneElectionButtonProps
): React.ReactNode {
  const { election, variant } = props;
  const buttonLabel = 'Downloads';

  const approvedAt = api.getBallotsApprovedAt.useQuery(election.electionId);
  if (!approvedAt.data) return null;

  return (
    <TooltipContainer>
      <Tooltip alignTo="right" bold>
        {buttonLabel}
      </Tooltip>
      <LinkButton
        variant={variant}
        to={routes.election(election.electionId).downloads.path}
        aria-label={buttonLabel}
      >
        <Icons.Download />
      </LinkButton>
    </TooltipContainer>
  );
}
