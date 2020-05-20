import SystemImporter from '../src/importer'

export default function getScannerCVRCountWaiter(
  importer: SystemImporter
): {
  waitForCount(count: number): Promise<void>
} {
  let cvrCount = 0

  importer.addAddCVRCallback(() => {
    cvrCount += 1
  })

  return {
    waitForCount(count): Promise<void> {
      return new Promise((resolve) => {
        function checkCVRCount(): void {
          if (count <= cvrCount) {
            resolve()
          } else {
            setTimeout(checkCVRCount, 10)
          }
        }

        checkCVRCount()
      })
    },
  }
}
