// Driver: renderButton({ compact: false }). The css stub only invokes the
// FIRST interpolation, so the second arrow is wholly uncovered.
// Locks: inline flag on a ternary arm inside a template interpolation, and an
// own-line flag inside an interpolation binding the whole arrow function
// (segmented_button.tsx pattern).

import { css, StyleProps } from '../support/css';

export const buttonStyle = css`
  padding: ${(props) =>
    props.compact ? /* @coverage-exclude: compact padding is visual-only */ '2px' : '8px'};
  margin: ${
    // @coverage-defer: margin interpolation untested
    (props) => (props.compact ? '0' : '4px')
  };
`;

export function renderButton(props: StyleProps): string {
  return buttonStyle(props);
}
