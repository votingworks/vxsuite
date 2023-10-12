import React from 'react';
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

export type ProseProps = React.HTMLAttributes<HTMLDivElement> & {
  children?: React.ReactNode;
  themeDeprecated?: Theme;
  compact?: boolean;
  maxWidth?: boolean;
  textCenter?: boolean;
  textRight?: boolean;
};

const ProseContainer = styled('div')<ProseProps>`
  margin: ${({ textCenter }) => (textCenter ? '0 auto' : undefined)};
  max-width: ${({ maxWidth = true }) => (maxWidth ? '66ch' : undefined)};
  text-align: ${({ textCenter, textRight }) =>
    (textCenter && 'center') || (textRight && 'right')};
`;

/**
 * @deprecated The sizing flexibility provided here is incompatible with our
 * VVSG text size implementation - use the various semantic text components from
 * `@votingworks/ui` instead (e.g. <H1>, <P>, <Caption>).
 *
 * See libs/ui/src/typography.tsx
 */
export function Prose(props: ProseProps): JSX.Element {
  return <ProseContainer {...props} />;
}
