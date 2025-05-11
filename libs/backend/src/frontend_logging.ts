import { Logger } from '@votingworks/logging';
import express, { Application } from 'express';

/**
 * Placeholder
 */
export function setupFrontendLogging(app: Application, logger: Logger): void {
  app.use(express.json());
  app.post('/log', (req, res) => {
    const { eventId, user, ...logData } = req.body;
    logger.log(eventId, user, logData);
    res.status(200).json({ status: 'ok' });
  });
}
