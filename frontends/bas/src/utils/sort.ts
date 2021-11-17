interface Name {
  name: string;
}
export function compareName(a: Name, b: Name): number {
  return a.name.localeCompare(b.name);
}
