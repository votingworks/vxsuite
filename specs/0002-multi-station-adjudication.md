# Multi-Station Adjudication

**Author:** @caroline

**Status:** `in-progress`

## Problem

Adjudication is a bottleneck: only one VxAdmin can adjudicate at a time. For
large jurisdictions (e.g. Wayne County, ~1.5M CVRs, ~150K flagged for
adjudication), this is prohibitively slow. An initial implementation of
Multi-station adjudication will allow up to 24 stations (1 host + 23 clients) to
adjudicate simultaneously over a private wired ethernet network.

## Proposal

### Architecture: Pure Client/Server

- **Host:** Full VxAdmin functionality. Owns database, CVRs, ballot images.
  Assigns ballots to clients, saves results from clients. Can perform all
  regular VxAdmin tasks while adjudication runs.
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
network). Hosts track connected clients via the `machines` table, populated when
clients call `connectToHost` and kept alive via polling.

**Dual-Server Architecture** (following pollbook pattern): local API on PORT
(frontend Grout API) and peer API on PEER_PORT (host-client communication). Both
in the same process.

**IP Assignment:** Link-local via `avahi-autoipd` (169.254.x.x).

**Security:** IPSec via strongswan (FIPS compliant), adapted from pollbook's
wireless mesh to wired ethernet.

### Database Schema Changes (Host)

The existing `machines` table tracks connected client machines:

```sql
CREATE TABLE machines (
  machine_id TEXT NOT NULL,
  machine_mode TEXT NOT NULL CHECK (machine_mode IN ('host', 'client')),
  status TEXT NOT NULL
    CHECK (status IN ('offline', 'online_locked', 'active', 'adjudicating')),
  auth_type TEXT,
  last_seen_at INTEGER NOT NULL
);
```

One new table for tracking ballot assignments to machines (host and clients) and
maintaining an audit trail of which machine adjudicated which ballot:

```sql
CREATE TABLE machine_ballot_adjudication_assignments (
  cvr_id TEXT NOT NULL REFERENCES cvrs(id) ON DELETE CASCADE,
  election_id TEXT NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  machine_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'completed')),
  PRIMARY KEY (cvr_id, election_id)
);
```

Foreign keys use `ON DELETE CASCADE` so that deleting CVRs or elections
automatically cleans up assignment rows.

### Peer API (Host Endpoints)

```typescript
function buildPeerApi(context: PeerAppContext) {
  return grout.createApi({
    // Connection & Configuration
    connectToHost(input: { machineId; status; authType }):
      MachineConfig & { isClientAdjudicationEnabled: boolean },
    getElectionPackageHash(): Optional<string>,
    getCurrentElectionMetadata(): Optional<ElectionRecord>,
    getSystemSettings(): Optional<SystemSettings>,

    // Ballot Claiming
    claimBallot(input: { machineId; currentBallotStyleId?; excludeCvrIds? }):
      Optional<Id>,
    releaseBallot(input: { cvrId }): void,

    // Ballot Data
    getBallotAdjudicationData(input: { cvrId }): BallotAdjudicationData,
    getBallotImageMetadata(input: { cvrId }): Promise<BallotImages>,
    getMarginalMarks(input: { cvrId; contestId }): ContestOptionId[],
    getWriteInCandidates(input: { contestId? }): WriteInCandidateRecord[],

    // Adjudication Submission
    adjudicateCvrContest(input: AdjudicatedCvrContest): void,
    resolveBallotTags(input: { cvrId }): void,
  });
}

// Binary ballot image endpoint (Express, outside grout)
GET /api/ballot-image/:cvrId/:side → raw image bytes with Content-Type
```

`getBallotImageMetadata` returns layout, coordinates, and image URLs pointing to
the binary endpoint (e.g. `/api/ballot-image/{cvrId}/front`). Actual image bytes
are served via Express to avoid base64-in-JSON overhead through grout.

### Ballot Assignment Logic

**Claiming:** Client calls `claimBallot`. Host selects the next unclaimed,
unresolved CVR using a SELECT with `LIMIT 1` (SQLite's single-writer guarantee
prevents double-claiming). Ballot style affinity is implemented via ORDER BY
preference when a `currentBallotStyleId` is provided. An optional
`excludeCvrIds` parameter allows the client to skip specific ballots (used by
the skip feature to avoid re-claiming the same ballot).

```sql
SELECT c.id AS cvr_id
FROM cvrs c
LEFT JOIN cvr_tags ct ON ct.cvr_id = c.id
WHERE c.election_id = ?
  AND c.id IN (
    SELECT cvr_id FROM cvr_contest_tags WHERE is_resolved = 0
    UNION
    SELECT cvr_id FROM cvr_tags WHERE is_resolved = 0
  )
  AND c.id NOT IN (
    SELECT cvr_id FROM machine_ballot_adjudication_assignments
    WHERE election_id = ? AND status IN ('claimed', 'completed')
  )
  AND c.id NOT IN (?, ?, ...)  -- excludeCvrIds (optional, for skip)
ORDER BY
  CASE WHEN c.ballot_style_group_id = ? THEN 0 ELSE 1 END,
  CASE WHEN ct.is_blank_ballot = 1 THEN 1 ELSE 0 END,
  CASE WHEN c.card_type = 'bmd' THEN 1 ELSE 0 END,
  c.ballot_style_group_id,
  c.sheet_number,
  c.id
LIMIT 1
```

The host's adjudication queue (`getBallotAdjudicationQueue`) includes claimed
ballots so the "Ballot X of N" display is stable regardless of client activity.
`getNextCvrIdForBallotAdjudication` excludes claimed ballots so the host starts
at an unclaimed ballot. When multi-station adjudication is enabled, the host
also claims the ballot it is currently adjudicating (via
`claimBallotForAdjudication`) and releases on navigation or exit, preventing
clients from claiming the same ballot. `getClaimedBallotCvrIds` (excluding the
host's own machine ID) provides the set of ballots claimed by other machines for
the blocking UI. Stale host claims from a previous process are released on
server startup.

**Completion:** When `resolveBallotTags` is called, the claim is marked
`status = 'completed'` with a `completed_at` timestamp within the same
transaction as tag resolution. Completed claims are preserved as an audit trail
of which machine adjudicated which ballot.

**Release:** Claimed (but not completed) ballots are released (row deleted)
when: client calls `releaseBallot`, client exits the adjudication screen, host
navigates away from a ballot, client machine goes offline (detected by stale
machine cleanup), or multi-station adjudication is toggled. Bulk release
functions (`releaseAllClaimsForMachine`, `releaseAllActiveClaims`) only delete
rows with `status = 'claimed'`, preserving completed audit records.

**Skip:** Client tracks skipped CVR IDs in a session-scoped set. On skip, the
current ballot is released and the next claim passes all skipped IDs as
`excludeCvrIds`. When all ballots have been skipped, the set clears and the
cycle restarts. This ensures skipped ballots don't reappear until other options
are exhausted.

### Client Machine Status on Host

The `connectToHost` heartbeat includes the client's auth-derived status
(`Active` / `OnlineLocked`). The host overrides this to `Adjudicating` when the
client has active ballot claims in `machine_ballot_adjudication_assignments`.
This allows the host's clients table to show real-time adjudication activity
without the client needing to explicitly report UI state.

### Frontend Changes

**Host:** The Adjudication screen shows "Start Adjudication" (primary) and
"Enable/Disable Multi-Station Adjudication" buttons side by side when the
feature flag is enabled. Below, a "Clients" section shows network status
(online/offline, multiple host conflict warnings) and a connected clients table
with machine ID, status (active/locked/disconnected/adjudicating), user role,
and relative last-seen time. The host can also adjudicate ballots itself in
parallel with clients. The host claims each ballot it navigates to (via
`claimBallotForAdjudication`) and releases on navigation or exit. When the host
navigates to a ballot claimed by another machine, the ballot image is still
shown but the contest list is replaced with a "currently being adjudicated by
another machine" message and adjudication is disabled — only Next/Back
navigation is available. Host adjudication queue queries
(`getBallotAdjudicationQueue`, `getBallotAdjudicationQueueMetadata`,
`getNextCvrIdForBallotAdjudication`, `getClaimedBallotCvrIds`) poll every 1
second with `staleTime: 0` so the host sees queue changes from client activity
without manual refresh.

**Client:** Shows adjudication status and a "Start Adjudication" button (enabled
when host has enabled client adjudication). When clicked, claims a ballot from
the host before navigating — if successful, navigates to the ballot adjudication
screen with the claimed CVR ID in the route.

1. "Start Adjudication" button claims a ballot (`claimBallot`), navigates to
   `/adjudication/ballots/:cvrId`
2. `ClientBallotAdjudicationScreen` reads `cvrId` from route params, starts in
   `adjudicating` state immediately (no mount-time claim)
3. `ClientBallotAdjudicationDataLoader` fetches data via client `api.ts` hooks
   and passes as props to the shared `BallotAdjudicationScreen`
4. User can: **Accept** (resolves tags, completes claim, auto-claims next),
   **Skip** (releases claim, claims next excluding skipped IDs), or **Exit**
   (releases claim, navigates back)
5. When no ballots remain, shows completion screen with nav back to adjudication

**Shared adjudication screen (data as props):** `BallotAdjudicationScreen` was
refactored from an internal component with queue awareness to an exported
component that accepts all data and mutation callbacks as props:
`ballotAdjudicationData`, `ballotImages`, `writeInCandidates`, `systemSettings`,
`onResolveBallotTags`, `onAdjudicateCvrContest`, plus navigation callbacks
(`onAcceptDone`, `onSkip?`, `onBack?`, `onExit`). It has no hooks and no
knowledge of where data comes from.

The host wraps it in `HostBallotAdjudicationScreenDataLoader` (fetches data via
host `api.ts` hooks, manages queue navigation, claims ballots when multi-station
is enabled). The client wraps it in `ClientBallotAdjudicationDataLoader`
(fetches data via client `api.ts` hooks).

`ContestAdjudicationScreen` similarly accepts `writeInCandidates` (pre-filtered
by contest) and `onAdjudicateCvrContest` as props — no internal data fetching.

**Client error handling:** Client proxy endpoints throw on host disconnection
(`requireHostConnection` throws if the host connection is unavailable). This
matches the host's API return types — both host and client return plain values
for adjudication methods, no Result wrapping. In practice, host disconnection is
handled by the backend: the networking layer clears the cached election record,
which causes the auth state to transition to `logged_out`, logging the user out
before any grout error reaches the UI.

**Client API pattern:** Local backend proxies adjudication requests to host's
peer API. Proxy endpoints throw on host disconnection rather than returning
errors — grout surfaces the throw as an error to the frontend. `getBallotImages`
fetches metadata via the grout `getBallotImageMetadata` endpoint and binary
images via the Express `GET /api/ballot-image/:cvrId/:side` endpoint in
parallel, then reconstructs data URLs locally. Frontend only talks to its own
local backend, avoiding CORS issues.

### Logging

Eight new log event types for multi-station adjudication:

| Event ID                          | Type               | Description                                           |
| --------------------------------- | ------------------ | ----------------------------------------------------- |
| `AdminNetworkStatus`              | application-status | Network connection state changes, client heartbeats   |
| `AdminMachineModeChanged`         | user-action        | Host/client mode switch                               |
| `AdminClientAdjudicationToggled`  | user-action        | Enable/disable multi-station adjudication             |
| `AdminBallotClaimed`              | application-action | Ballot claimed by client (logged on both host+client) |
| `AdminContestAdjudicated`         | application-action | A contest on a ballot was adjudicated                 |
| `AdminBallotAdjudicationComplete` | application-action | Ballot adjudication completed (both host+client)      |
| `AdminBallotReleased`             | application-action | Ballot released back to queue                         |
| `AdminAdjudicationProxyError`     | application-status | Client proxy request failed (no host connection)      |

Logging occurs on both sides: the host peer API logs claim/release/complete
events with the client machine ID, and the client proxy endpoints log the same
events from the client's perspective.

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

**Host mode** — two Express servers in the same process, sharing one `Store`
instance (single SQLite DB, no sync needed):

- **Local API** on PORT (`app.ts`) — existing full VxAdmin API + multi-station
  management endpoints (`getNetworkStatus`, `setIsClientAdjudicationEnabled`)
- **Peer API** on PEER_PORT (`peer_app.ts`) — serves client requests. Calls the
  same store methods as the local API — no adjudication logic duplication.

**Client mode** — one Express server only:

- **Client Local API** on PORT (`client_app.ts`) — two categories of endpoints:
  1. **Local system endpoints** — auth, USB, power, diagnostics, mode config.
     Uses shared API builders (`createSystemCallApi`, etc.) identical to the
     host.
  2. **Adjudication proxy endpoints** — transparent forwarding to the host's
     peer API via a `grout.Client<PeerApi>`. Throws on host disconnection
     (matching the host's plain return types).

#### Machine Mode

Mode (`'host' | 'client'`) is stored in a **file** in the workspace directory
(`{ADMIN_WORKSPACE}/machine_mode`), not in the database. This solves the
bootstrapping problem: mode must be known before creating a store, since hosts
and clients use different store classes with different schemas.

Both `app.ts` and `client_app.ts` expose `getMachineMode()` / `setMachineMode()`
endpoints. `setMachineMode()` writes the file and requires a machine restart.
Only changeable by System Administrator when unconfigured. Default is `'host'`.
Feature flag `ENABLE_MULTI_STATION_ADMIN` gates the entire feature.

#### Startup Flow (`server.ts`)

1. Read mode from file before creating any store
2. **Host:** create `Store` → start peer server on PEER_PORT → start local
   server on PORT → start host networking (avahi advertise, conflict detection,
   stale machine cleanup)
3. **Client:** create `ClientStore` → start client networking (avahi discover,
   connect to host, sync election data) → start client local server on PORT

#### Store Classes

**`Store`** — existing store class. The only schema addition for multi-station
is the `machine_ballot_adjudication_assignments` table. Existing `machines` and
`settings` tables already handle client tracking and the adjudication toggle.

**`ClientStore`** — in-memory store holding ephemeral connection state, cached
election data synced from host, and cached system settings. No local database.

#### Networking (`networking.ts`)

Two functions with structured logging via `LogEventId.AdminNetworkStatus`:

- **`startHostNetworking`:** avahi advertise, poll for host conflicts, stale
  machine cleanup (marks offline, releases ballot claims for stale machines),
  online/offline transition logging
- **`startClientNetworking`:** avahi discover host, connect via `connectToHost`,
  sync election data on hash change, connection state transition logging

#### Frontend

The client is a separate app experience — no election management, reports, or
tabulation. Rather than branching on mode throughout the existing `AppRoot`, the
client gets its own component tree:

- `index.tsx` queries `getMachineMode()`, renders `<App />` (host, unchanged) or
  `<ClientApp />` (new)
- `client/` directory: own app shell, app root, API file, and screens
  (adjudication, ballot adjudication flow, settings, diagnostics)
- Shared adjudication components (`BallotAdjudicationScreen`,
  `ContestAdjudicationScreen`, `BallotStaticImageViewer`) accept all data as
  props — each parent (host/client) fetches using its own API hooks
