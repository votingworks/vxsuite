import React from 'react';

type ReactUiStringFragment = React.ReactNode | Record<string, unknown>;

/**
 * Modified React component children type that supports interpolated parameter
 * objects used in string translations.
 *
 * e.g.
 * ```
 *   const interpolatedValue = 24;
 *   return (
 *     <UiString>This is an {{ interpolatedValue }}.</UiString>
 *   );
 * ```
 */
export type ReactUiString =
  | ReactUiStringFragment
  | readonly ReactUiStringFragment[];
