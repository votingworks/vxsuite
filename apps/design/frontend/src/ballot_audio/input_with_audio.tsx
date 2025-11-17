import styled from 'styled-components';

import { LinkButton } from '@votingworks/ui';
import React from 'react';
import { Tooltip, tooltipContainerCss, TooltipProps } from '../tooltip';

const InputWithAudioContainer = styled.div`
  /* border-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem; */
  display: flex;
  /* width: min-content; */
  width: 100%;

  > input {
    min-width: unset !important;
    width: 100%;
  }

  > input:not(:last-child) {
    border-bottom-right-radius: 0;
    border-right: 0;
    border-top-right-radius: 0;
  }
`;

const ButtonContainer = styled.div`
  display: flex;
  ${tooltipContainerCss}

  > button {
    border-bottom-left-radius: 0;
    border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
    border-top-left-radius: 0;
    padding: 0.5rem 0.75rem;
  }
`;

export function InputWithAudio(
  props: React.InputHTMLAttributes<HTMLInputElement> & {
    editing?: boolean;
    href?: string;
    skip?: boolean;
    tooltipPlacement?: TooltipProps['attachTo'];
  }
): JSX.Element {
  const { editing, href, skip, tooltipPlacement, ...rest } = props;
  const audioEnabled = !editing && !skip && !!(rest.value || rest.defaultValue);

  return (
    <InputWithAudioContainer>
      <input {...rest} />
      {audioEnabled && (
        <ButtonContainer>
          <LinkButton
            icon="VolumeUp"
            fill="transparent"
            variant="primary"
            to={href}
          />
          <Tooltip alignTo="right" attachTo={tooltipPlacement} bold>
            Preview/Edit Audio
          </Tooltip>
        </ButtonContainer>
      )}
    </InputWithAudioContainer>
  );
}
