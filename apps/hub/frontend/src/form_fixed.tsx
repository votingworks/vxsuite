import { H2 } from '@votingworks/ui';
import {
  cssFormViewMode,
  FormFixed as BaseFormFixed,
} from '@votingworks/election-definition-ui';
import styled, { css } from 'styled-components';
import { StyledRichTextEditor } from './rich_text_editor.js';

export const FormFixed = styled(BaseFormFixed)`
  ${(p) =>
    !p.editing &&
    css`
      ${StyledRichTextEditor} {
        ${cssFormViewMode}
      }
    `}
`;

export const FormTitle = styled(H2)`
  /*
   * Offset the vertical flex gap a bit to keep this visually attached to the
   * rest of the form body.
   */
  margin-bottom: -0.25rem;
  padding: 0;
`;
