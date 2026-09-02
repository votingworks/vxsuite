/** @jsx h */
// Driver: StatusPanel({}).

export interface VNode {
  tag: string;
  children: unknown[];
}

export function h(tag: string, _props: unknown, ...children: unknown[]): VNode {
  return { tag, children };
}

export function StatusPanel(props: { error?: string }): VNode {
  // A directive inside a JSX expression container binds the logical expression
  // that follows it (smart_cards_screen.tsx pattern).
  return (
    <div>
      <span>ready</span>
      {/* @coverage-exclude: error banner exercised in integration tests */ props.error !==
        undefined && <strong>{props.error}</strong>}
    </div>
  );
}
