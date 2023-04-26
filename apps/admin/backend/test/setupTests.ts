import { cleanupTestSuiteTmpFiles } from './cleanup';

afterAll(() => {
  cleanupTestSuiteTmpFiles();
});
