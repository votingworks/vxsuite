import express, { Application, response } from 'express';

function buildApp(): Application {
  const app: Application = express();

  app.get('/hello', (_request, response) => {
    response.json({ message: 'Hello World!' });
  });

  return app;
}

export async function start() {
  const app = buildApp();
  app.listen(3001);
}
