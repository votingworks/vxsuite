import type { Browser } from 'playwright';

export interface SimpleRenderer {
  getBrowser(): Browser;
  cleanup(): Promise<void>;
}
