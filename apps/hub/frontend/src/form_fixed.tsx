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
