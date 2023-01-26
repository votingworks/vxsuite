import makeDebug, { formatters } from 'debug';

formatters['x'] = (value: number) => `0x${value.toString(16).padStart(2, '0')}`;

/**
 * Base debug function.
 */
export const debug = makeDebug('custom');
