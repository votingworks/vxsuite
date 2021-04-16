export async function copyFile(inputFile: File): Promise<File> {
  const reader = new FileReader()
  return new Promise((resolve) => {
    reader.onload = () => {
      resolve(new File([reader.result! as string], inputFile.name))
    }
    reader.readAsText(inputFile)
  })
}
