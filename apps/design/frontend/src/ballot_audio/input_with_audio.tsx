import React from 'react';
import styled from 'styled-components';

import { LinkButton } from '@votingworks/ui';

import { Tooltip, TooltipContainer, TooltipProps } from '../tooltip';

export type InputWithAudioProps = {
  audioScreenUrl: string;
  editing: boolean;
  tooltipPlacement?: TooltipProps['attachTo'];
} & React.InputHTMLAttributes<HTMLInputElement>;

const InputWithAudioContainer = styled.div`
  display: flex;
  width: 100%;

  > input {
    /*
     * Inputs have min widths set across the app at the moment. Disabling
     * for the audio-related UI updates to support responsive UI scaling, but
     * keeping it contained to the WIP updates for now.
     *
     * [TODO] Remove input min widths at the top level and rely on layout width
     * limits instead.
     */
    min-width: unset !important;
    width: 100%;
  }

  > input:not(:last-child) {
    border-bottom-right-radius: 0;
    border-right: 0;
    border-top-right-radius: 0;
  }
`;

const ButtonContainer = styled(TooltipContainer)`
  display: flex;

  > button {
    border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
    border-bottom-left-radius: 0;
    border-top-left-radius: 0;

    /*
     * Vertical padding is a no-op here.
     * We rely on flex box stretch alignment to match button height to input
     * height.
    */
    padding: 0 0.75rem;
  }
`;

export function InputWithAudio(props: InputWithAudioProps): JSX.Element {
  const {
    editing,
    audioScreenUrl: audioScreenHref,
    tooltipPlacement,
    ...rest
  } = props;
  const audioEnabled = !editing && !!(rest.value || rest.defaultValue);

  return (
    <InputWithAudioContainer>
      <input {...rest} />

      {audioEnabled && (
        <ButtonContainer>
          <LinkButton
            aria-label="Preview or Edit Audio"
            fill="transparent"
            icon="VolumeUp"
            to={audioScreenHref}
            variant="primary"
          />

          <Tooltip alignTo="right" attachTo={tooltipPlacement} bold>
            Preview/Edit Audio
          </Tooltip>
        </ButtonContainer>
      )}
    </InputWithAudioContainer>
  );
}
