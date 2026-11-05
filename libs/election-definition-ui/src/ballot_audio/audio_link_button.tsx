import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';

import { LinkButton } from '@votingworks/ui';

import type { ElectionId } from '@votingworks/types';
import { useElectionDefinitionApi } from '../election_definition_context.js';
import { Tooltip, TooltipContainer, type TooltipProps } from '../tooltip.js';

export interface AudioLinkButtonProps {
  buttonClassName?: string;
  className?: string;
  to: string;
  tooltip: ReactNode;
  tooltipPlacement?: TooltipProps['attachTo'];
}

export function AudioLinkButton(props: AudioLinkButtonProps): ReactNode {
  const { buttonClassName, className, to, tooltip, tooltipPlacement, ...rest } =
    props;

  const { electionId } = useParams<{ electionId: ElectionId }>();

  const api = useElectionDefinitionApi();
  const features = api.getStateFeatures.useQuery(electionId).data;
  if (!features?.AUDIO_ENABLED) return null;

  return (
    <TooltipContainer className={className}>
      <LinkButton
        {...rest}
        className={buttonClassName}
        icon="VolumeUp"
        fill="transparent"
        variant="primary"
        to={to}
      />
      <Tooltip alignTo="right" attachTo={tooltipPlacement} bold>
        {tooltip}
      </Tooltip>
    </TooltipContainer>
  );
}
