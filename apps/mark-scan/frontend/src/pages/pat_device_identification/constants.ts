export const behaviorToKeypressMap = {
  Move: '1',
  Select: '2',
} as const;

export const validKeypressValues: string[] = Object.values(
  behaviorToKeypressMap
);
