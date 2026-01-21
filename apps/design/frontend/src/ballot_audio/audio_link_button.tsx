import React, { ReactNode } from 'react';
import { useParams } from 'react-router-dom';

import { LinkButton } from '@votingworks/ui';

import * as api from '../api';
import { Tooltip, TooltipContainer, TooltipProps } from '../tooltip';
import { ElectionIdParams } from '../routes';

export interface AudioLinkButtonProps {
  buttonClassName?: string;
  className?: string;
  to: string;
  tooltip: ReactNode;
  tooltipPlacement?: TooltipProps['attachTo'];
}

export function AudioLinkButton(props: AudioLinkButtonProps): React.ReactNode {
  const { buttonClassName, className, to, tooltip, tooltipPlacement, ...rest } =
    props;

  const { electionId } = useParams<ElectionIdParams>();

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
