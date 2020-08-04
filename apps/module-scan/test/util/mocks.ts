import { Importer } from '../../src/importer'
import { Interpreter } from '../../src/interpreter'

export function makeMockInterpreter(): jest.Mocked<Interpreter> {
  return {
    addHmpbTemplate: jest.fn(),
    interpretFile: jest.fn(),
    setTestMode: jest.fn(),
  }
}

export function makeMockImporter(): jest.Mocked<Importer> {
  return {
    addHmpbTemplates: jest.fn(),
    addManualBallot: jest.fn(),
    configure: jest.fn(),
    doExport: jest.fn(),
    doImport: jest.fn(),
    importFile: jest.fn(),
    waitForImports: jest.fn(),
    doZero: jest.fn(),
    getStatus: jest.fn(),
    restoreConfig: jest.fn(),
    setTestMode: jest.fn(),
    unconfigure: jest.fn(),
  }
}
