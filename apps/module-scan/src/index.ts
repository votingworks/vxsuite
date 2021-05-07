// Import the rest of our application.
import LoopScanner, { parseBatchesFromEnv } from './LoopScanner'
import RemoteControlScanner from './RemoteControlScanner'
import { Scanner } from './scanner'
import * as server from './server'

function getScanner(): Scanner | undefined {
  if (process.env.MOCK_SCANNER === 'remote') {
    return new RemoteControlScanner()
  }

  const mockScannerFiles = parseBatchesFromEnv(process.env.MOCK_SCANNER_FILES)

  if (mockScannerFiles) {
    process.stdout.write(
      `Using mock scanner that scans ${mockScannerFiles.reduce(
        (count, sheets) => count + sheets.length,
        0
      )} sheet(s) in ${mockScannerFiles.length} batch(es) repeatedly.\n`
    )
    return new LoopScanner(mockScannerFiles)
  }

  return undefined
}

server.start({ scanner: getScanner() })
