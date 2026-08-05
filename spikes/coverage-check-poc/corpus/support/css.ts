export interface StyleProps {
  compact: boolean;
}

export type Interpolation = (props: StyleProps) => string;

// Mimics a styled-components-style tagged template, but only ever invokes the
// FIRST interpolation so fixtures can hold a deliberately-uncovered second one.
export function css(
  strings: TemplateStringsArray,
  ...interpolations: Interpolation[]
): (props: StyleProps) => string {
  return (props) => {
    const first = interpolations[0];
    return `${strings.raw.join('*')}${first === undefined ? '' : first(props)}`;
  };
}
