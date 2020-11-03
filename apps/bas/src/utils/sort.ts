interface Name {
  name: string
}
export const compareName = (a: Name, b: Name): number =>
  a.name.localeCompare(b.name)
