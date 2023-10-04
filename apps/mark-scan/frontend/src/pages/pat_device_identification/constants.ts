export const behaviorToKeypressMap = {
  Navigate: '1',
  Activate: '2',
} as const;

export const validKeypressValues: string[] = Object.values(
  behaviorToKeypressMap
);
