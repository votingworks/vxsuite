// Import the rest of our application.
import { MockScannerClient, ScannerClient } from '@votingworks/plustek-sdk'
import { ok, Result } from '@votingworks/types'
import LoopScanner, { parseBatchesFromEnv } from './LoopScanner'
import { plustekMockServer, PlustekScanner, Scanner } from './scanners'
import * as server from './server'

async function getScanner(): Promise<Scanner | undefined> {
  if (process.env.VX_MACHINE_TYPE === 'precinct-scanner') {
    if (process.env.MOCK_SCANNER_HTTP) {
      const client = new MockScannerClient()
      await client.connect()
      const port = 9999
      process.stdout.write(
        `Starting mock plustek scanner API at http://localhost:${port}/mock\n`
      )
      process.stdout.write(
        `→ Load paper: curl -X PUT -d '{"files":["/path/to/front.jpg", "/path/to/back.jpg"]}' -H 'Content-Type: application/json' http://localhost:${port}/mock\n`
      )
      process.stdout.write(
        `→ Remove paper: curl -X DELETE http://localhost:${port}/mock\n`
      )
      plustekMockServer(client).listen(port)
      return new PlustekScanner({
        get: async (): Promise<Result<ScannerClient, Error>> => ok(client),
      })
    }
  } else {
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
  }

  return undefined
}

async function main(): Promise<number> {
  server.start({ scanner: await getScanner() })
  return 0
}

main()
  .catch((error) => {
    console.error('CRASH:', error)
    return 1
  })
  .then((code) => {
    process.exitCode = code
  })
