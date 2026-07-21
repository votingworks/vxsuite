function z2(number: number) {
  return number.toString().padStart(2, '0');
}

export function shortDateTime(iso8601Timestamp: string): string {
  const d = new Date(iso8601Timestamp);
  return `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(
    d.getDate()
  )} ${d.getHours()}:${z2(d.getMinutes())}:${z2(d.getSeconds())}`;
}
