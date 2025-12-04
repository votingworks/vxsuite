import React from 'react';
import styled from 'styled-components';

import { RichTextEditor } from '../rich_text_editor';
import { Tooltip, TooltipContainer, TooltipProps } from '../tooltip';
import { AudioLinkButton } from './audio_link_button';

export type RickTextEditorWithAudioProps = {
  audioScreenUrl: string;
  editing: boolean;
  tooltipPlacement?: TooltipProps['attachTo'];
} & React.ComponentProps<typeof RichTextEditor>;

const RichTextEditorWithAudioContainer = styled.div`
  display: flex;

  > div:first-child {
    flex-grow: 1;
  }

  > div:not(:last-child) {
    border-bottom-right-radius: 0;
    border-right: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
    border-top-right-radius: 0;
  }

  :has(button) {
    > div:not(:last-child) {
      border-bottom-right-radius: 0;
      border-right: 0;
      border-top-right-radius: 0;
    }
  }

  &[aria-disabled='true'] {
    > div:not(:last-child) {
      border-style: dashed;
    }
  }
`;

const ButtonContainer = styled(TooltipContainer)`
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-bottom-right-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  border-top-right-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  display: flex;
  flex: 0;
  flex-direction: column;
  min-height: 100%;

  > button {
    border-bottom: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border-top-left-radius: 0;
    padding: 0.75rem;
  }
`;

export function RichTextEditorWithAudio(
  props: RickTextEditorWithAudioProps
): JSX.Element {
  const {
    editing,
    audioScreenUrl: audioScreenHref,
    tooltipPlacement,
    ...rest
  } = props;
  const audioEnabled = !editing && !!rest.initialHtmlContent;

  return (
    <RichTextEditorWithAudioContainer aria-disabled={rest.disabled}>
      <RichTextEditor {...rest} />

      {audioEnabled && (
        <ButtonContainer>
          <AudioLinkButton
            aria-label="Preview or Edit Audio"
            to={audioScreenHref}
          />

          <Tooltip alignTo="right" attachTo={tooltipPlacement} bold>
            Preview/Edit Audio
          </Tooltip>
        </ButtonContainer>
      )}
    </RichTextEditorWithAudioContainer>
  );
}
