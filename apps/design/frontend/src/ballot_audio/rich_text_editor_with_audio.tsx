import styled from 'styled-components';

import { LinkButton } from '@votingworks/ui';
import React from 'react';
import { Tooltip, tooltipContainerCss } from '../tooltip';
import { RichTextEditor } from '../rich_text_editor';

const RichTextEditorWithAudioContainer = styled.div`
  align-items: stretch;
  display: flex;

  &[aria-disabled='true'] {
    > div:not(:last-child) {
      border-style: dashed;
    }
  }

  :has(button) {
    > div:not(:last-child) {
      border-bottom-right-radius: 0;
      border-right: 0;
      border-top-right-radius: 0;
    }
  }

  > div:first-child {
    /* border: 0; */
    flex-grow: 1;
  }

  > div:not(:last-child) {
    border-bottom-right-radius: 0;
    border-right: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
    border-top-right-radius: 0;
  }
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

  ${tooltipContainerCss}

  > button {
    border-bottom: ${(p) => p.theme.sizes.bordersRem.thin}rem solid
      ${(p) => p.theme.colors.outline};
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    border-top-left-radius: 0;
    padding: 0.75rem 0.75rem;
  }
`;

export function RichTextEditorWithAudio(
  props: React.ComponentProps<typeof RichTextEditor> & {
    editing?: boolean;
    href?: string;
  }
): JSX.Element {
  const { editing, href, ...rest } = props;
  const audioEnabled = !editing && !!rest.initialHtmlContent;

  return (
    <RichTextEditorWithAudioContainer aria-disabled={rest.disabled}>
      <RichTextEditor {...rest} />
      {audioEnabled && (
        <ButtonContainer>
          <LinkButton
            icon="VolumeUp"
            fill="transparent"
            variant="primary"
            to={href}
          />
          <Tooltip alignTo="right" bold>
            Preview/Edit Audio
          </Tooltip>
        </ButtonContainer>
      )}
    </RichTextEditorWithAudioContainer>
  );
}
