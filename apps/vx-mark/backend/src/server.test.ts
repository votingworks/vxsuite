import { start } from './server';

test('can start server', () => {
  const server = start();
  expect(server.listening).toBeTruthy();
  server.close();
});
