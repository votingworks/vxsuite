import styled from 'styled-components';

import { ElectionStringKey } from '@votingworks/types';
import { DesktopPalette, richTextStyles } from '@votingworks/ui';

import { cssThemedScrollbars } from '../scrollbars';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  border-bottom: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${DesktopPalette.Gray30};

  > :last-child {
    padding-bottom: 0.75rem;
  }
`;

const ContestDescription = styled.div`
  height: max-content;
  line-height: 1.4;
  overflow-y: auto;

  /*
  * These bounds can be tweaked as needed. Tuned to provide decent
  * responsiveness on a 1920 x 1080 viewport, when paired with the
  * TtsTextEditor component, with the latter taking up more or the viewport.
  */
  max-height: calc(0.25 * calc(100vh - 10rem));
  min-height: 4rem;

  /*
   * Hide for short viewports, since there isn't enough room to show a useful
   * preview anyway.
   */
  @media (max-height: 600px) {
    height: 0;
    min-height: 0;
    padding: 0 !important;
  }

  ${cssThemedScrollbars}
  ${richTextStyles}
`;

export interface UiStringPreviewProps {
  stringKey: string;
  text: string;
}

/**
 * Displays the original for a given UI string, to provide a reference for users
 * when making text-to-speech edits.
 */
export function UiStringPreview(props: UiStringPreviewProps): JSX.Element {
  const { stringKey, text } = props;

  if (stringKey === ElectionStringKey.CONTEST_DESCRIPTION) {
    return (
      <Container>
        <ContestDescription dangerouslySetInnerHTML={{ __html: text }} />
      </Container>
    );
  }

  return (
    <Container>
      <span>{text}</span>
    </Container>
  );
}
