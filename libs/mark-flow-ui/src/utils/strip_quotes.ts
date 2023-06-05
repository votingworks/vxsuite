export function stripQuotes(string: string): string {
  return string.replace(/['‘’"“”]/g, '');
}
