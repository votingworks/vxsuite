import React from 'react';
import styled, { css } from 'styled-components';

import { SizeTheme } from '@votingworks/types';

export type Align = 'left' | 'center' | 'right';
type HeadingType = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/** Props for {@link Font}, {@link P}, and {@link Caption}. */
export interface FontProps {
  'aria-label'?: string;
  align?: Align;
  children?: React.ReactNode;
  className?: string;
  id?: string;
  italic?: boolean;
  noWrap?: boolean;
  style?: React.CSSProperties;
  weight?: keyof SizeTheme['fontWeight'];
  maxLines?: number;
}

/**
 * Props for {@link H1}, {@link H2}, {@link H3}, {@link H4}, {@link H5}, and
 * {@link H6}
 */
export type HeadingProps = Omit<FontProps, 'weight'> & {
  /**
   * Enables rendering smaller headings with HTML tags for larger headings in
   * order to preserve heading hierarchy on a page for a11y reasons.
   * See https://www.w3.org/WAI/tutorials/page-structure/headings/
   */
  as?: HeadingType;
};

const maxLinesStyles = css<FontProps>`
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: ${(p) => p.maxLines};
`;

const fontStyles = css<FontProps>`
  font-size: 1em;
  font-style: ${(p) => (p.italic ? 'italic' : undefined)};
  font-weight: ${(p) =>
    p.weight ? p.theme.sizes.fontWeight[p.weight] : undefined};
  line-height: ${(p) => p.theme.sizes.lineHeight};
  margin: 0;
  text-align: ${(p) => p.align};
  white-space: ${(p) => (p.noWrap ? 'nowrap' : undefined)};
  ${(p) => p.maxLines && maxLinesStyles}
`;

const StyledFont = styled.span<FontProps>`
  ${fontStyles}
`;

const StyledCaption = styled.span<FontProps>`
  ${fontStyles}

  font-size: 0.75rem;
`;

const StyledP = styled.p<FontProps>`
  ${fontStyles}

  font-size: 1rem;
  margin-bottom: 0.5em;
`;

const headingStyles = css<HeadingProps>`
  ${fontStyles}

  font-weight: 500;
  line-height: ${(p) => p.theme.sizes.lineHeight * 0.9};
  margin-bottom: 0.3em;

  &:not(:first-child) {
    margin-top: 1.25em;
  }

  /* Override the top-margin spacing for adjacent headings. */
  & + h1,
  & + h2,
  & + h3,
  & + h4,
  & + h5,
  & + h6 {
    margin-top: 0 !important;
  }
`;

const StyledH1 = styled.h1<HeadingProps>`
  ${headingStyles}

  font-size: ${(p) => p.theme.sizes.headingsRem.h1}rem;
  font-weight: 600;
`;

const StyledH2 = styled.h2<HeadingProps>`
  ${headingStyles}

  font-size: ${(p) => p.theme.sizes.headingsRem.h2}rem;
  font-weight: 600;
`;

const StyledH3 = styled.h3<HeadingProps>`
  ${headingStyles}

  font-size: ${(p) => p.theme.sizes.headingsRem.h3}rem;
`;

const StyledH4 = styled.h4<HeadingProps>`
  ${headingStyles}

  font-size: ${(p) => p.theme.sizes.headingsRem.h4}rem;
`;

const StyledH5 = styled.h5<HeadingProps>`
  ${headingStyles}

  font-size: ${(p) => p.theme.sizes.headingsRem.h5}rem;
`;

const StyledH6 = styled.h6<HeadingProps>`
  ${headingStyles}

  font-size: ${(p) => p.theme.sizes.headingsRem.h6}rem;
  line-height: ${(p) => p.theme.sizes.lineHeight * 0.85};
  font-weight: 600;
`;

/** Adjusts the font styles for a given piece of inline text. */
export function Font(props: FontProps): JSX.Element {
  return <StyledFont {...props} />;
}

/** Styled h1 heading. */
export function H1(props: HeadingProps): JSX.Element {
  return <StyledH1 {...props} />;
}

/** Styled h2 heading. */
export function H2(props: HeadingProps): JSX.Element {
  return <StyledH2 {...props} />;
}

/** Styled h3 heading. */
export function H3(props: HeadingProps): JSX.Element {
  return <StyledH3 {...props} />;
}

/** Styled h4 heading. */
export function H4(props: HeadingProps): JSX.Element {
  return <StyledH4 {...props} />;
}

/** Styled h5 heading. */
export function H5(props: HeadingProps): JSX.Element {
  return <StyledH5 {...props} />;
}

/** Styled h6 heading. */
export function H6(props: HeadingProps): JSX.Element {
  return <StyledH6 {...props} />;
}

/** Styled block paragraph text for regular copy. */
export function P(props: FontProps): JSX.Element {
  return <StyledP {...props} />;
}

/** Styled block caption for small sub-text copy. */
export function Caption(props: FontProps): JSX.Element {
  return <StyledCaption {...props} />;
}

/**
 * Some props to override theme styles for use without a theme
 * (e.g. in HMPBs).
 */
interface RichTextProps {
  tableBorderWidth?: string;
  tableBorderColor?: string;
  tableHeaderBackgroundColor?: string;
}

export const richTextStyles = css<RichTextProps>`
  /* stylelint-disable no-descending-specificity */
  ul {
    list-style-type: disc;
  }

  ol {
    list-style-type: decimal;
  }

  ul,
  ol {
    padding-inline-start: 2em;

    li p {
      margin: 0.25em 0;
    }
  }

  table {
    margin: 1em 0;
    border-collapse: collapse;

    th,
    td {
      border-width: ${(p) =>
        p.tableBorderWidth || `${p.theme.sizes.bordersRem.thin}rem`};
      border-style: solid;
      border-color: ${(p) => p.tableBorderColor || p.theme.colors.outline};
      text-align: left;
      padding: 0.25em 0.5em;
    }

    th {
      background: ${(p) =>
        p.tableHeaderBackgroundColor || p.theme.colors.container};
    }

    p {
      margin: 0;
    }
  }

  p,
  ul,
  ol,
  table {
    &:first-child {
      margin-top: 0;
    }

    &:last-child {
      margin-bottom: 0;
    }
  }

  img {
    max-width: 100%;
    height: auto;
  }
`;

/**
 * Styled rich-text block for basic HTML content (inline styles, lists, tables,
 * images).
 */
export const RichText = styled.div<RichTextProps>`
  ${richTextStyles}
`;
