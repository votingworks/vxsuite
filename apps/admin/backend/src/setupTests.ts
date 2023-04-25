import { cleanupTestSuiteTmpFiles } from '../test/cleanup';

afterAll(() => {
  cleanupTestSuiteTmpFiles();
});
