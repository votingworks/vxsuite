# Multi-Station Adjudication

**Author:** @caroline

**Status:** `planning`

## Problem

Adjudication is a bottleneck: only one VxAdmin can adjudicate at a time. For
large jurisdictions (e.g. Wayne County, ~1.5M CVRs, ~150K flagged for
adjudication), this is prohibitively slow. An initial implementation of
Multi-station adjudication will allow up to 24 stations (1 host + 23 clients) to
adjudicate simultaneously over a private wired ethernet network.

## Proposal

### Architecture: Pure Client/Server

- **Host:** Full VxAdmin functionality. Owns database, CVRs, ballot images.
  Manages adjudication sessions, assigns ballots, saves results from clients.
  Can perform all regular VxAdmin tasks while adjudication runs.
- **Client:** Adjudication-only mode. Configured from host over network (no
  USB). Fetches ballots on-demand, adjudicates, posts results back to host. No
  local CVR storage or ballot images.
- **Modes are switchable** by System Administrator when VxAdmin is unconfigured.
  Persists across elections. Default is host.

### Networking Stack

**Discovery:** Only hosts advertise via mDNS (`_vxadmin._http._tcp`, named
`VxAdmin-{machineId}`). Clients discover hosts by browsing for this service
type, then initiate a connection handshake (`connectToHost`). Hosts also browse
for `_vxadmin._http._tcp` to detect conflicts (multiple hosts on the same
network). Hosts track connected clients via the `adjudication_stations` table,
populated when clients call `connectToHost` and kept alive via heartbeats.

**Dual-Server Architecture** (following pollbook pattern): local API on PORT
(frontend Grout API) and peer API on PEER_PORT (host-client communication). Both
in the same process.

**IP Assignment:** Link-local via `avahi-autoipd` (169.254.x.x).

**Security:** IPSec via strongswan (FIPS compliant), adapted from pollbook's
wireless mesh to wired ethernet.

### Database Schema Changes (Host)

```sql
CREATE TABLE adjudication_sessions (
  id TEXT PRIMARY KEY,
  election_id TEXT NOT NULL REFERENCES elections(id),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed'))
);

CREATE TABLE adjudication_stations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES adjudication_sessions(id),
  machine_id TEXT NOT NULL,
  name TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'disconnected', 'locked'))
);

CREATE TABLE ballot_claims (
  cvr_id TEXT NOT NULL REFERENCES cvrs(id),
  session_id TEXT NOT NULL REFERENCES adjudication_sessions(id),
  claimed_by_station_id TEXT REFERENCES adjudication_stations(id),
  claimed_at TEXT,
  status TEXT NOT NULL DEFAULT 'unclaimed'
    CHECK (status IN ('unclaimed', 'claimed', 'completed', 'released')),
  PRIMARY KEY (cvr_id, session_id)
);
```

### Peer API (Host Endpoints)

```typescript
function buildPeerApi(context: PeerAppContext) {
  return grout.createApi({
    // Configuration
    getElectionConfiguration(): { electionDefinition; electionKey; systemSettings },

    // Session
    connectToHost(input: { machineId: string }): { sessionId; stationId },
    heartbeat(input: { stationId: string }): { sessionActive: boolean },

    // Adjudication
    claimBallot(input: { stationId; currentBallotStyleId? }): { cvrId; contestIds; ballotStyleId } | null,
    submitBallotAdjudication(input: { stationId; cvrId; adjudicatedContests }): void,
    releaseBallot(input: { stationId; cvrId }): void,

    // Ballot Data
    getBallotImage(input: { cvrId; side }): Buffer,
    getCvrVoteInfo(input: { cvrId }): CastVoteRecordVoteInfo,
    getCvrWriteIns(input: { cvrId }): WriteInRecord[],
    getWriteInCandidates(input: { contestId }): WriteInCandidate[],
    getMarginalMarks(input: { cvrId; contestId }): ContestOptionId[],
  });
}
```

### Ballot Assignment Logic

**Claiming:** Client calls `claimBallot`. Host finds unclaimed CVR with ballot
style affinity preference, atomically marks as claimed, returns metadata. Client
fetches image and vote data via separate calls.

**Release:** Ballots released when client calls `releaseBallot`, screen locks
(heartbeat timeout), client disconnects, or session ends.

**Submission:** Client calls `submitBallotAdjudication` with all contest
adjudications. Host validates claim, calls existing `adjudicateCvrContest()` per
contest, marks claim completed.

### Frontend Changes

**Host:** Mode selector (unconfigured only), online/offline indicator, host
conflict warning, "Start Networked Adjudication" toggle, connected clients list
with status, adjudication progress display.

**Client:** "Searching for Host..." connecting screen, auto-configured from
host, adjudication UI reusing existing `ContestAdjudicationScreen` with data
fetched from host peer API, "Next Ballot" flow.

**Client API pattern:** Local backend proxies adjudication requests to host,
avoiding CORS issues. Frontend only talks to its own local backend.

### Scale

| Metric            | Value                               |
| ----------------- | ----------------------------------- |
| Max stations      | 24 (1 host + 23 clients)            |
| Ballot image size | ~800 KB per side                    |
| Bottleneck        | Human speed (~1 ballot/min/station) |

### Code Organization

Adapts VxPollBook's dual-server pattern for an **asymmetric** architecture. Key
difference: pollbook is symmetric (all peers equal, same code on every machine),
while VxAdmin has a host with full functionality and clients that are
adjudication-only thin proxies.

| Aspect    | VxPollBook                           | VxAdmin Multi-Station                        |
| --------- | ------------------------------------ | -------------------------------------------- |
| Topology  | Symmetric peers                      | Asymmetric host/client                       |
| Peer API  | Every machine serves it              | Host only                                    |
| Local API | Same on all machines                 | Full API on host, sysadmin + proxy on client |
| Database  | Same DB on all machines              | Full DB on host; minimal DB on client        |
| Store     | LocalStore + PeerStore (shared base) | HostStore + ClientStore (separate)           |
| Discovery | All machines advertise               | Host-only advertisement                      |

#### Server Architecture

**Host mode** — two Express servers in the same process, sharing one `HostStore`
instance (single SQLite DB, no sync needed):

- **Local API** on PORT (`app.ts`) — existing full VxAdmin API + new session
  management endpoints
- **Peer API** on PEER_PORT (`peer_app.ts`) — serves client requests. Calls the
  same shared functions (e.g. `adjudicateCvrContest()`) as the local API — no
  adjudication logic duplication.

**Client mode** — one Express server only:

- **Client Local API** on PORT (`client_app.ts`) — two categories of endpoints:
  1. **Local system endpoints** — auth, USB, power, diagnostics, mode config.
     Uses shared API builders (`createSystemCallApi`, etc.) identical to the
     host.
  2. **Adjudication proxy endpoints** — transparent forwarding to the host's
     peer API via a `grout.Client<PeerApi>`.

#### Machine Mode

Mode (`'host' | 'client'`) is stored in a **file** in the workspace directory
(`{ADMIN_WORKSPACE}/machine_mode`), not in the database. This solves the
bootstrapping problem: mode must be known before creating a store, since hosts
and clients use different store classes with different schemas.

Both `app.ts` and `client_app.ts` expose `getMachineMode()` / `setMachineMode()`
endpoints. `setMachineMode()` writes the file and triggers a backend restart.
Only changeable by System Administrator when unconfigured. Default is `'host'`.
Feature flag `ENABLE_MULTI_STATION_ADMIN` gates the entire feature.

#### Startup Flow (`server.ts`)

1. Read mode from file before creating any store
2. **Host:** create `HostStore` → start peer server on PEER_PORT → start local
   server on PORT → start host networking (avahi advertise, heartbeat
   monitoring)
3. **Client:** create `ClientStore` → start client networking (avahi discover,
   heartbeat) → start client local server on PORT

#### Store Classes

**`HostStore`** — existing `Store` class (renamed) plus new methods for the
adjudication session tables. Full `schema.sql`.

**`ClientStore`** — minimal store for diagnostics only. Small
`client_schema.sql` with no election/CVR/adjudication tables.

#### Networking (`networking.ts`)

Follows pollbook's `setupMachineNetworking` pattern with two functions:

- **`startHostNetworking`:** avahi advertise, poll for host conflicts, monitor
  heartbeat timeouts and release stale ballot claims
- **`startClientNetworking`:** avahi discover host, connect, send heartbeats,
  reconnect on disconnect

#### Frontend

The client is a separate app experience — no election management, reports, or
tabulation. Rather than branching on mode throughout the existing `AppRoot`, the
client gets its own component tree:

- `index.tsx` queries `getMachineMode()`, renders `<App />` (host, unchanged) or
  `<ClientApp />` (new)
- `client/` directory: own app shell, app root, API file, and screens
  (connecting, adjudication flow, mode selector)
- `host/` directory: new host-only multi-station screens (session management,
  connected clients)
- Shared adjudication components (e.g. `ContestAdjudicationScreen`) are reused
  by the client without modification

## Task Breakdown

### Hardware

- [ ] Test candidate ethernet switches with current laptop setup
- [ ] Test USB-C to ethernet adapters
- [ ] Finalize ethernet switch, cable, and adapter certification decisions
- [ ] Handle packaging and presentation of networking peripherals

### System Level

- [x] Prototype networking stack changes from pollbook for ethernet in VxDev
- [x] Determine if ethernet switches require configuration
- [ ] Upgrade to FIPS compliance in strongswan implementation
- [ ] Add networking changes to VxAdmin image build script (conditional on ENV)

### Application Networking Setup & Configuration

- [ ] Add feature flag for multi-station (`ENABLE_MULTI_STATION_ADMIN`)
- [ ] Add host/client mode toggle with networking connections over avahi
- [ ] Host tracking of connected clients
- [ ] Client configuration from host (election info, auth setup)
- [ ] Basic client screens
- [ ] Basic host monitoring screen for viewing clients

### Adjudication MVP

- [ ] Database schema for adjudication sessions, stations, ballot claims
- [ ] Implement peer API on host
- [ ] Host UI to start and manage adjudication session
- [ ] Host views for adjudication progress
- [ ] Client ballot fetch, assignment, adjudication screen integration, result
      submission
- [ ] Ballot assignment logic with ballot style affinity
- [ ] Ballot release on disconnect/lock (heartbeat timeout)
- [ ] Ballot image serving endpoint on host

### Adjudication Parallelism

- [ ] Allow viewing reports with partial adjudicated results during adjudication
- [ ] Allow importing CVRs in parallel with other tasks
- [ ] Address polish/feedback from initial workflow passes

## Key Files

| File                                     | Role                                          |
| ---------------------------------------- | --------------------------------------------- |
| `libs/networking/src/avahi.ts`           | Shared avahi publish/discover/online-check    |
| `apps/admin/backend/src/server.ts`       | Entry point — mode-aware startup              |
| `apps/admin/backend/src/app.ts`          | Host local API                                |
| `apps/admin/backend/src/peer_app.ts`     | **NEW** — Host peer API                       |
| `apps/admin/backend/src/client_app.ts`   | **NEW** — Client local API (sysadmin + proxy) |
| `apps/admin/backend/src/networking.ts`   | **NEW** — Avahi advertisement/discovery       |
| `apps/admin/backend/src/machine_mode.ts` | **NEW** — File-based mode read/write          |
| `apps/admin/backend/src/host_store.ts`   | Host store (renamed from store.ts)            |
| `apps/admin/backend/src/client_store.ts` | **NEW** — Client store (minimal)              |
| `apps/admin/frontend/src/client/`        | **NEW** — Client frontend app                 |
| `apps/admin/frontend/src/host/`          | **NEW** — Host multi-station screens          |
| `apps/pollbook/backend/src/`             | Reference: pollbook peer API + networking     |
