export async function copyFile(inputFile: File): Promise<File> {
  const reader = new FileReader()
  return new Promise((resolve) => {
    reader.onload = () => {
      resolve(new File([reader.result! as string], inputFile.name))
    }
    reader.readAsText(inputFile)
  })
}

export function convertFileToStorageString(
  inputFile: File,
  fileContent: string
): string {
  return JSON.stringify({
    name: inputFile.name,
    lastModified: inputFile.lastModified,
    content: fileContent,
  })
}

export function convertStorageStringToFile(
  inputString: string
): { file: File; content: string } | undefined {
  const { name, lastModified, content } = JSON.parse(inputString)
  if (!content || !name) {
    return undefined
  }
  const file = new File([content], name, { lastModified })
  return {
    file,
    content,
  }
}
