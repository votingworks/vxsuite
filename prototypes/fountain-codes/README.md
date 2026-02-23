# Fountain Codes QR Prototype

Prototype for transferring data via animated QR codes using LT (Luby Transform)
fountain codes. Tests how much data can be reliably transferred and at what
throughput.

## How It Works

**Fountain codes** are rateless erasure codes. The sender generates an unlimited
stream of encoded symbols from the original data. The receiver can reconstruct
the data from any sufficient subset of symbols — it doesn't matter which ones
are missed. This is ideal for QR code video transfer where individual frames may
fail to scan.

The prototype has two views:

- **Sender** — generates deterministic test data, encodes it with LT codes, and
  displays animated QR codes
- **Receiver** — scans QR codes via webcam (decoded server-side by zedbar),
  reconstructs the data via belief propagation, and verifies integrity with
  SHA-256

## Setup

From the repo root:

```sh
pnpm install
```

## Running

```sh
cd prototypes/fountain-codes
pnpm start
```

Opens at http://localhost:3100.

## Usage

### Sender

1. Adjust parameters (data size, block size, frame rate, etc.)
2. Click **Start** to begin displaying animated QR codes
3. The info panel shows the data hash, source block count (K), and symbols
   generated

### Receiver

1. Ensure the Soliton c and delta parameters match the sender
2. Click **Start Scanning** and point your webcam at the sender's QR code
   display
3. The progress bar fills as blocks are decoded
4. When complete, a verification panel shows whether the SHA-256 hash matches

### Two-Device Setup

Open the sender on one screen (laptop/monitor). Open the receiver on a second
device or browser window with a webcam pointed at the sender's screen.

### Single-Device Setup

Open two browser windows side by side. Use an external webcam or phone camera
pointed at the sender window.

## Tunable Parameters

| Parameter        | Default | Range       | Notes                                   |
| ---------------- | ------- | ----------- | --------------------------------------- |
| Data size        | 50 KB   | 1–500 KB    | Amount of test data to transfer         |
| Block size       | 1800 B  | 100–2900 B  | Bytes per fountain symbol (capped by QR capacity) |
| Frame rate       | 15 fps  | 1–30 fps    | QR codes displayed per second           |
| QR error corr.   | M       | L / M       | L = more data, M = more scan resilience |
| Soliton c        | 0.2     | 0.01–1.0    | Robust Soliton distribution parameter   |
| Soliton delta    | 0.05    | 0.01–1.0    | Robust Soliton failure probability      |
| Data seed        | 42      | any integer | Seed for deterministic test data        |

The sender UI shows a theoretical throughput estimate based on block size and
frame rate before you start.

## Architecture

```
src/
  fountain/          LT code implementation
    prng.ts            Seeded PRNG (splitmix32)
    distribution.ts    Robust Soliton degree distribution
    encoder.ts         Symbol generation (XOR of random block subsets)
    decoder.ts         Belief propagation decoder
    types.ts           Shared types
  sender/            Sender UI
    sender_page.tsx    Config controls + status
    qr_animator.tsx    Animated QR display
  receiver/          Receiver UI
    receiver_page.tsx  Progress, stats, verification
    qr_scanner_wrapper.tsx  Webcam capture + server-side zedbar scanning
  utils/
    binary.ts          Frame serialization (Latin-1 binary encoding)
    test_data.ts       Deterministic data generation + SHA-256

vite-plugin-zedbar-scanner.ts   Vite dev server middleware for QR decoding
```

QR scanning uses **zedbar** (Rust/WASM port of ZBar) running server-side via a
Vite dev server middleware endpoint. The browser captures webcam frames, converts
to grayscale, and POSTs to `/api/scan` for decoding.
