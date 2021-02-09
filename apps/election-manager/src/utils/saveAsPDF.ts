import { Election } from '@votingworks/types'

export default async function saveAsPDF(
  fileNamePrefix: string,
  election: Election,
  precinctName = 'all-precincts'
): Promise<boolean> {
  const data = await window.kiosk!.printToPDF()
  const fileWriter = await window.kiosk!.saveAs({
    defaultPath: `${`${fileNamePrefix}-${election.county.name}-${election.title}-${precinctName}`
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/(^-|-$)+/g, '')
      .toLocaleLowerCase()}.pdf`,
  })
  if (!fileWriter) {
    return false
  }
  fileWriter.write(data)
  await fileWriter.end()
  return true
}
