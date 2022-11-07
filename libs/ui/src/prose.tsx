import styled from 'styled-components';
import { Theme } from './themes';

// Prose!
// Readable text content with typographic hierarchy using simple semantic html.
//
// - Use basic text block html tags inside the <Prose> block. (see basic tags
//   below) Use the <Text> components for adding additional styles to html.
// - This is not a layout component; include it within a layout component to
//   define the space around the Prose component.
// - First and last child HTML tags of Prose have no margins so that a parent
//   layout component may define the layout. The HTML class "ignore-prose" HTML
//   class is applied to tag.
// - Width is constrained to 1.5 alphabets (66ch) to improve readability.
// - Spacing between elements is defined such that headings are closer to the
//   text that follows them.
//
// For example useage, search codebase for "<Prose" (without closing bracket)

export interface ProseProps {
  theme?: Theme;
  compact?: boolean;
  maxWidth?: boolean;
  textCenter?: boolean;
  textRight?: boolean;
}

export const Prose = styled('div')<ProseProps>`
  margin: ${({ textCenter }) => (textCenter ? '0 auto' : undefined)};
  max-width: ${({ maxWidth = true }) => (maxWidth ? '66ch' : undefined)};
  text-align: ${({ textCenter, textRight }) =>
    (textCenter && 'center') || (textRight && 'right')};
  line-height: 1.2;
  color: ${({ theme }) => theme.color};
  font-size: ${({ theme }) => theme.fontSize};
  & h1 {
    margin: 2em 0 1em;
    line-height: 1.1;
    font-size: 1.5em;
  }
  & h2 {
    margin: 1.5em 0 0.75em;
    font-size: 1.25em;
  }
  & h3 {
    font-size: 1.17em;
  }
  & h4 {
    font-size: 1em;
  }
  & h5 {
    font-size: 0.9em;
  }
  & h3,
  & h4,
  & h5,
  & p,
  & ol,
  & ul,
  & hr {
    margin-top: ${({ compact }) => (compact ? '0' : '1em')};
    margin-bottom: ${({ compact }) => (compact ? '0' : '1em')};
  }
  & h1 + h2 {
    margin-top: -0.75em;
  }
  & h1,
  & h2 {
    & + p,
    & + ol,
    & + ul {
      margin-top: -0.75em;
    }
  }
  & h3,
  & h4,
  & h5 {
    & + p,
    & + ol,
    & + ul {
      margin-top: ${({ compact }) => (compact ? 0 : '-1em')};
    }
  }
  & > :not(.ignore-prose):first-child {
    margin-top: 0;
  }
  & > :not(.ignore-prose):last-child {
    margin-bottom: 0;
  }
  & dl {
    margin: 1em 0;
  }
  & hr {
    border: 0;
    border-top: 0.1em solid #666666;
  }
`;
