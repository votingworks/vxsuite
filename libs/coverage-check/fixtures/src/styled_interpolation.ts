// Driver: renderButton({ compact: false }).

export interface StyleProps {
  compact: boolean;
}

type Interpolation = (props: StyleProps) => string;

// Mimics a styled-components tagged template, but only ever invokes the first
// interpolation, so the second arrow below is wholly uncovered.
function css(
  strings: TemplateStringsArray,
  ...interpolations: Interpolation[]
): (props: StyleProps) => string {
  return (props) => {
    const first = interpolations[0];
    // The '' case below is deliberately uncovered, producing a cond-expr branch in the report.
    return `${strings.raw.join('*')}${first === undefined ? '' : first(props)}`;
  };
}

export const buttonStyle = css`
  padding: ${
    // An inline directive on a ternary arm inside a template interpolation.
    (props) =>
      props.compact ? /* @coverage-exclude: compact padding is visual-only */ '2px' : '8px'
  };
  margin: ${
    // A line-level directive inside an interpolation binds the whole arrow
    // (segmented_button.tsx pattern).
    // @coverage-defer: margin interpolation untested
    (props) => (props.compact ? '0' : '4px')
  };
`;

export function renderButton(props: StyleProps): string {
  return buttonStyle(props);
}
