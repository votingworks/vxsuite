interface Name {
  name: string
}
export const compareName = (a: Name, b: Name) => a.name.localeCompare(b.name)

export default {
  compareName,
}
