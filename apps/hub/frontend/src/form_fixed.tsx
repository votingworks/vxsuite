import { H2 } from '@votingworks/ui';
import styled, { css } from 'styled-components';
import { StyledRichTextEditor } from './rich_text_editor.js';

export interface FormFixedProps {
  editing: boolean;
}

/**
 * Removes the default "disabled" state's low-contrast styling to optimize for
 * readability when not editing.
 */
const cssFormViewMode = css`
  input,
  .search-select > div,
  ${StyledRichTextEditor} {
    background-color: ${(p) => p.theme.colors.background} !important;
    color: ${(p) => p.theme.colors.onBackground} !important;
  }
`;

export const FormFixed = styled.form<FormFixedProps>`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
  width: 100%;

  input:disabled {
    cursor: not-allowed;
  }

  ${(p) => !p.editing && cssFormViewMode}
`;

export const FormTitle = styled(H2)`
  /*
   * Offset the vertical flex gap a bit to keep this visually attached to the
   * rest of the form body.
   */
  margin-bottom: -0.25rem;
  padding: 0;
`;
