import { DesktopPalette } from '@votingworks/ui';
import styled, { css } from 'styled-components';
import { cssThemedScrollbars } from './scrollbars';
import { StyledRichTextEditor } from './rich_text_editor';

export const FormBody = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: 1.5rem;
  height: 100%;
  overflow: auto;
  padding: 1rem;

  ${cssThemedScrollbars}

  input[type='text'] {
    min-width: 18rem;
  }

  .search-select {
    min-width: 18rem;
  }
`;

export const FormErrorContainer = styled.div`
  margin: 0 1rem;
  padding-bottom: 1rem;

  :empty {
    display: none;
  }

  > * {
    max-width: calc(55ch + 2rem);
  }
`;

export const FormFooter = styled.div`
  border-top: ${(p) => p.theme.sizes.bordersRem.hairline}rem solid
    ${DesktopPalette.Gray30};
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0 1rem;
  padding: 1rem 0;
`;

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
