import { MockScannerClient } from '@votingworks/plustek-scanner';
import request from 'supertest';
import { plustekMockServer } from './plustek_mock_server';

test('mock server', async () => {
  const client = new MockScannerClient({
    passthroughDuration: 0,
    toggleHoldDuration: 0,
  });
  const app = plustekMockServer(client);

  // before connect fails
  await request(app)
    .put('/mock')
    .set('Content-Type', 'application/json')
    .send({ files: ['front.jpg', 'back.jpg'] })
    .expect(400);

  await client.connect();

  // bad request
  await request(app)
    .put('/mock')
    .set('Content-Type', 'application/json')
    .send({
      /* missing files */
    })
    .expect(400);

  // successful
  await request(app)
    .put('/mock')
    .set('Content-Type', 'application/json')
    .send({ files: ['front.jpg', 'back.jpg'] })
    .expect(200);

  // removes mock
  await request(app).delete('/mock').expect(200);

  // fails because it's already removed
  await request(app).delete('/mock').expect(400);
});
