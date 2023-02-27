import { ElectionDefinition } from '@votingworks/types';
import { Application } from 'express';
import request from 'supertest';

/**
 * Sets the election via request, for testing
 */
export async function setElection(
  testApp: Application,
  electionDefinition: ElectionDefinition
): Promise<void> {
  await request(testApp)
    .post('/admin/elections')
    .set('Content-Type', 'application/json')
    .send(electionDefinition)
    .expect(200);
}
