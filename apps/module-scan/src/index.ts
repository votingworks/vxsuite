// Import the rest of our application.
import * as server from './server'
import { join } from 'path'
import LoopScanner from './LoopScanner'

const sampleBallotImagesPath = join(__dirname, '..', 'sample-ballot-images/')
const ballotImagePaths = ['1', '2'].map(suffix =>
  join(sampleBallotImagesPath, `sample-batch-1-ballot-${suffix}.jpg`)
)

function getScanner() {
  if (process.env.MOCK_SCANNER) {
    process.stdout.write(
      'Using mock scanner that scans these files repeatedly:\n'
    )
    for (const file of ballotImagePaths) {
      process.stdout.write(`- ${file}\n`)
    }
    return new LoopScanner(ballotImagePaths)
  }

  return undefined
}

server.start({ scanner: getScanner() })
