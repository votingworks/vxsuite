/**
 * Valid values for cert card type field
 */
export type CardType =
  | 'system-administrator'
  | 'election-manager'
  | 'poll-worker'
  | 'poll-worker-with-pin';

/**
 * Parsed custom cert fields
 */
export interface CustomCertFields {
  component: 'card' | 'admin' | 'central-scan' | 'mark' | 'scan';
  jurisdiction: string;
  cardType?: CardType;
  electionHash?: string;
}
