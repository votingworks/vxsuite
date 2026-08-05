export interface VNode {
  tag: string;
  children: unknown[];
}

export function h(tag: string, _props: unknown, ...children: unknown[]): VNode {
  return { tag, children };
}
