# VotingWorks Modules

The VotingWorks source code, which implements every component of the
voting system, is organized into modules as detailed below.

## Libraries

Programmatic libraries that are used across VotingWorks subsystems are organized within the `/libs` directory.

### Ballot Encoder

Utilities for encoding a ballot as a compact bitstring and decoding a
bitstring back into a ballot. This is used notably to encode a voter's
choices in a QR code on a BMD summary ballot.

### ESLint Plugin Vx

A code linter that implements our coding styleguide.

### Fixtures

Test data structures, i.e. sample elections and CVRs, for various
types of elections, used in automated testing.

### HMPB Interpreter

A library for interpreting images of hand-marked paper ballots.

### Logging

A library that handles all logging across VotingWorks components.

### LSD (Line Segment Detector)

A library used for detecting line segments in images, used as one of the tools by HMPB Interpreter to interpret hand-marked paper ballot images.

### Plustek SDK

A programmatic interface to the Plustek scanning hardware module,
which we use in our precinct scanner.

### Test Utils

Utilities used in tests across the VotingWorks systems.

### Types

The common data types used across VotingWorks applications,
e.g. election, cast-vote record, tallies, etc.

### UI

Common user-interface components used across the VotingWorks voting
system, including some low-level components like button, button bar,
number pad, progress bar, and some higher-level components like tally
report summary, tally reports, tally QR codes.

### Utils

Utility functions used across VotingWorks components, including
notably working with ballot packages, dates, tallies, USB stick
interfaces.

## Frontends

VotingWorks Frontends are standalone user-facing programs that run as part of a
VotingWorks component. They are organized inside the `/frontends` directory.

Frontends correspond to components that are distinct to the user, for example
"Precinct Scanner" is one frontend, and "BMD" is another.
  
### Frontend: Ballot Activation System

The vote-card encoding system used in vote-center configurations.

### Frontend: Ballot Marking Device

The ballot-marking device.

### Frontend: Ballot Scanning Device

The central scanner.

### Frontend: Election Manager

The election manager that manages the election definition and results
from all scanners.

### Frontend: Precinct Scanner

The precinct scanner.

## Services

VotingWorks Services run as part of individual components and provide
functionality that may be used by more than one component. For example, the
"Scan" service interfaces with our scanning hardware, processes ballots, and
produces cast-vote records. "Scan" is used by two frontends: "Precinct Scanner"
and "Ballot Scanning Device" (which is our central scanner).

### Service: Converter SEMS Ms

The service that converts election definitions and cast-vote records
to and from Mississippi's State Election Management System.

Used by:
* Election Manager

### Service: Scan

The service that interfaces with the scanning hardware, interprets
ballots, and produces cast-vote records.

Used by:
* Ballot Scanning Device
* Precinct Scanner

### Service: Smartcards

The service that interfaces with smart cards.

Used by:
* Election Manager
* Ballot Scanning Device
* Precinct Scanner
* Ballot Marking Device
* Ballot Activation System

## Integration Testing

Integration tests that test whole components (e.g. Election Manager,
or BMD) are located in the `/integration-testing` directory.
