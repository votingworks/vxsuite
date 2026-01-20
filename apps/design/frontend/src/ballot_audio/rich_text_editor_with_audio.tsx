import React from 'react';
import styled from 'styled-components';

import { RichTextEditor } from '../rich_text_editor';
import { TooltipProps } from '../tooltip';
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
`;

const StyledRichTextEditor = styled(RichTextEditor)<{ audioEnabled?: boolean }>`
  ${(p) =>
    p.audioEnabled &&
    `
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-right-width: 0;
    `}
`;

const ButtonContainer = styled.div`
  border: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
    ${(p) => p.theme.colors.outline};
  border-bottom-right-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  border-top-right-radius: ${(p) => p.theme.sizes.borderRadiusRem}rem;
  display: flex;
  flex: 0;
  flex-direction: column;
  min-height: 100%;

  button {
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
): React.ReactNode {
  const { editing, audioScreenUrl, tooltipPlacement, ...rest } = props;

  const audioEnabled = !editing && !!rest.initialHtmlContent;

  return (
    <RichTextEditorWithAudioContainer aria-disabled={rest.disabled}>
      <StyledRichTextEditor {...rest} audioEnabled={audioEnabled} />

      {audioEnabled && (
        <ButtonContainer>
          <AudioLinkButton
            aria-label="Preview or Edit Audio"
            to={audioScreenUrl}
            tooltipPlacement={tooltipPlacement}
            tooltip="Preview/Edit Audio"
          />
        </ButtonContainer>
      )}
    </RichTextEditorWithAudioContainer>
  );
}
