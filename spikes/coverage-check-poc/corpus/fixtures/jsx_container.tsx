/** @jsx h */
// Driver: StatusPanel({}).
// Locks: flag inside a JSX expression container binding the logical
// expression that follows it (smart_cards_screen.tsx pattern).

import { h, VNode } from '../support/jsx';

export function StatusPanel(props: { error?: string }): VNode {
  return (
    <div>
      <span>ready</span>
      {/* @coverage-exclude: error banner exercised in integration tests */ props.error !==
        undefined && <strong>{props.error}</strong>}
    </div>
  );
}
