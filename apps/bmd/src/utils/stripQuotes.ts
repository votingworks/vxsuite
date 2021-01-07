const stripQuotes = (string: string): string => string.replace(/['‘’"“”]/g, '')
export default stripQuotes
