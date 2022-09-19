import React from 'react';

/**
 * A component that renders nothing.
 */
export function Nothing(): JSX.Element {
  // This unusual construct is to make the types and the linter mutually happy.
  // `null` by itself is not a valid JSX element, but a fragment containing
  // `null` is. The linter doesn't like `<React.Fragment />` because it's
  // "unnecessary", but it's necessary to make the types happy.
  return <React.Fragment>{null}</React.Fragment>;
}
