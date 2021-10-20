function stripQuotes(string: string): string {
  return string.replace(/['‘’"“”]/g, '');
}
export default stripQuotes;
