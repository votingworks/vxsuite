import { userEvent } from '@testing-library/user-event';

export async function simulateKeyPress(key: string): Promise<void> {
  await userEvent.keyboard(key.length === 1 ? key : `{${key}}`);
}
