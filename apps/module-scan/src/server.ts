
//
// Just the HTTP glue to the functionality, no implementations.
// All actual implementations are in scanner.ts
//

import express, {Application, Request, Response} from "express"
import {configure, doScan, doExport, getStatus, doZero} from "./scanner"
import * as store from "./store"

import {Election} from "./types"

// for now, we reset on every start
store.reset()

export const app : Application = express()
const port = 3002

app.use(express.json())

app.get("/", (_request : Request, response : Response) => {
  response.send("Hello!")
})

app.post("/scan/configure", (request: Request, response: Response) => {
  // store the election file
  const election = request.body as Election
  configure(election)
  response.json({"status": "ok"})
})

app.post("/scan/scan", (_request: Request, response: Response) => {
  doScan(store.getDB())
  response.json({"status": "ok"})
})

app.post("/scan/export", (_request: Request, response: Response) => {
  doExport(store.getDB())
  response.json({"status": "ok"})
})

app.get("/scan/status", (_request: Request, response: Response) => {
  getStatus()
    .then(status => {
      response.json(status)
    })
})

app.post("/scan/zero", (_request: Request, response: Response) => {
  doZero(store.getDB())
  response.json({"status": "ok"})
})

export function start() {
  app.listen(port, () => {
        console.log(`Listening at http://localhost:${port}/`);
  });
}
