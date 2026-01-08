/* istanbul ignore file - @preserve used only in internal dev and testing */
let mockAccessibleControllerConnected = true;

export function setMockAccessibleControllerConnected(connected: boolean): void {
  mockAccessibleControllerConnected = connected;
}

export function getMockAccessibleControllerConnected(): boolean {
  return mockAccessibleControllerConnected;
}
