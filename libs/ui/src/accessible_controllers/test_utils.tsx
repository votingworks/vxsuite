import { userEvent } from '../user_event.js';

export function simulateKeyPress(key: string): void {
  userEvent.keyboard(key.length === 1 ? key : `{${key}}`);
}
