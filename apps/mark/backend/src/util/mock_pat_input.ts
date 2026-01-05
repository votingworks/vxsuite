/* istanbul ignore file - @preserve used only in internal dev and testing */
let mockPatInputConnected = true;

export function setMockPatInputConnected(connected: boolean): void {
  mockPatInputConnected = connected;
}

export function getMockPatInputConnected(): boolean {
  return mockPatInputConnected;
}
