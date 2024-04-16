import userEvent from '@testing-library/user-event';

export function simulateKeyPress(key: string): void {
  userEvent.keyboard(key.length === 1 ? key : `{${key}}`);
}
