export function canViewAndPrintBallotsWithConverter(
  converter?: string
): boolean {
  return converter !== 'nh-accuvote';
}
