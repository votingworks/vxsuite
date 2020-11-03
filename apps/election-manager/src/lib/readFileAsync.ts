export default function readFileAsync(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const { result } = reader
      resolve(typeof result === 'string' ? result : '')
    }
    reader.onerror = reject
    reader.readAsText(file)
  })
}
