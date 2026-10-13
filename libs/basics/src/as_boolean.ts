/**
 * Convert a string value to a boolean, such as from an environment variable.
 */
export function asBoolean(value?: string): boolean {
  switch (value?.toLowerCase().trim()) {
    case 'true':
    case 'yes':
    case '1':
      return true;

    default:
      return false;
  }
}
