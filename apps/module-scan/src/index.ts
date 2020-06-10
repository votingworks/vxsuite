// Import the rest of our application.
import * as server from './server'
import LoopScanner from './LoopScanner'

function getScanner(): LoopScanner | undefined {
  const files = process.env.MOCK_SCANNER_FILES?.split(',')

  if (files) {
    process.stdout.write(
      'Using mock scanner that scans these files repeatedly:\n'
    )
    for (const file of files) {
      process.stdout.write(`- ${file}\n`)
    }
    return new LoopScanner(files)
  }

  return undefined
}

server.start({ scanner: getScanner() })
