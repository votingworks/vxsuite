import { useCallback, useRef, useState } from 'react';
import { decodeFrame } from '../utils/binary';
import { createDecoder, addSymbol, isComplete, reassemble } from '../fountain/decoder';
import {
  createRoundRobinDecoder,
  addRoundRobinSymbol,
  isRoundRobinComplete,
  reassembleRoundRobin,
  RoundRobinDecoderState,
} from '../fountain/round_robin_decoder';
import { computeTruncatedHash, toHex } from '../utils/test_data';
import { DecoderState, EncodingMode, FrameHeader } from '../fountain/types';
import {
  QrScannerWrapper,
  ScanMode,
  SCAN_MODE_LABELS,
  ScanStats,
} from './qr_scanner_wrapper';

interface SessionState {
  mode: EncodingMode;
  fountainDecoder: DecoderState | null;
  roundRobinDecoder: RoundRobinDecoderState | null;
  header: FrameHeader;
  seenSeeds: Set<number>;
  startTime: number;
  symbolsReceived: number;
  uniqueSymbols: number;
}

type VerificationResult =
  | { status: 'pending' }
  | { status: 'pass'; expectedHash: string; receivedHash: string }
  | { status: 'fail'; expectedHash: string; receivedHash: string };

interface LogEntry {
  time: number;
  message: string;
  type: 'info' | 'success' | 'duplicate' | 'error';
}

const EMPTY_SCAN_STATS: ScanStats = {
  framesSent: 0,
  qrFound: 0,
  qrMissed: 0,
  errors: 0,
  avgRoundTripMs: 0,
  lastResult: 'Not started',
  resolution: '',
  cropSize: '',
  payloadKb: '',
};

const MAX_LOG_ENTRIES = 50;

export function ReceiverPage(): JSX.Element {
  const [scanning, setScanning] = useState(false);
  const [session, setSession] = useState<SessionState | null>(null);
  const [progress, setProgress] = useState(0);
  const [symbolStats, setSymbolStats] = useState({ received: 0, unique: 0 });
  const [verification, setVerification] = useState<VerificationResult>({
    status: 'pending',
  });
  const [elapsedMs, setElapsedMs] = useState(0);
  const [complete, setComplete] = useState(false);
  const [solitonC, setSolitonC] = useState(0.2);
  const [solitonDelta, setSolitonDelta] = useState(0.2);
  const [scanStats, setScanStats] = useState<ScanStats>(EMPTY_SCAN_STATS);
  const [parseFailures, setParseFailures] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [blocksDecoded, setBlocksDecoded] = useState(0);
  const [detectedMode, setDetectedMode] = useState<EncodingMode | null>(null);
  const [scanMode, setScanMode] = useState<ScanMode>('jsqr');
  const [receivedData, setReceivedData] = useState<Uint8Array | null>(null);
  const [showData, setShowData] = useState(false);

  const sessionRef = useRef<SessionState | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completeRef = useRef(false);
  const parseFailRef = useRef(0);
  const startTimeRef = useRef(0);

  function addLog(message: string, type: LogEntry['type']) {
    const time = startTimeRef.current
      ? (Date.now() - startTimeRef.current) / 1000
      : 0;
    setLog((prev) => {
      const next = [...prev, { time, message, type }];
      return next.length > MAX_LOG_ENTRIES ? next.slice(-MAX_LOG_ENTRIES) : next;
    });
  }

  function handleStart() {
    setScanning(true);
    setSession(null);
    sessionRef.current = null;
    completeRef.current = false;
    parseFailRef.current = 0;
    startTimeRef.current = Date.now();
    setProgress(0);
    setSymbolStats({ received: 0, unique: 0 });
    setVerification({ status: 'pending' });
    setElapsedMs(0);
    setComplete(false);
    setScanStats(EMPTY_SCAN_STATS);
    setParseFailures(0);
    setLog([]);
    setBlocksDecoded(0);
    setDetectedMode(null);

    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedMs(Date.now() - startTimeRef.current);
      }
    }, 100);
  }

  function handleStop() {
    setScanning(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function handleReset() {
    handleStop();
    setSession(null);
    sessionRef.current = null;
    completeRef.current = false;
    parseFailRef.current = 0;
    startTimeRef.current = 0;
    setProgress(0);
    setSymbolStats({ received: 0, unique: 0 });
    setVerification({ status: 'pending' });
    setElapsedMs(0);
    setComplete(false);
    setScanStats(EMPTY_SCAN_STATS);
    setParseFailures(0);
    setLog([]);
    setBlocksDecoded(0);
    setDetectedMode(null);
    setReceivedData(null);
    setShowData(false);
  }

  const onStatsUpdate = useCallback((stats: ScanStats) => {
    setScanStats(stats);
  }, []);

  const onScan = useCallback(
    (data: Uint8Array) => {
      if (completeRef.current) return;

      const frame = decodeFrame(data);
      if (!frame) {
        parseFailRef.current += 1;
        setParseFailures(parseFailRef.current);
        addLog(`Parse failed (raw ${data.length} bytes)`, 'error');
        return;
      }

      const { header, symbolData } = frame;

      let currentSession = sessionRef.current;

      if (!currentSession) {
        const mode = header.mode;
        const fountainDec =
          mode === 'fountain'
            ? createDecoder(header.k, header.blockSize)
            : null;
        const roundRobinDec =
          mode === 'round-robin'
            ? createRoundRobinDecoder(header.k, header.blockSize)
            : null;

        currentSession = {
          mode,
          fountainDecoder: fountainDec,
          roundRobinDecoder: roundRobinDec,
          header,
          seenSeeds: new Set(),
          startTime: Date.now(),
          symbolsReceived: 0,
          uniqueSymbols: 0,
        };
        sessionRef.current = currentSession;
        setSession(currentSession);
        setDetectedMode(mode);
        addLog(
          `Session started: mode=${mode}, K=${header.k}, blockSize=${header.blockSize}, data=${(header.dataLength / 1024).toFixed(1)}KB`,
          'info'
        );
      }

      if (
        header.k !== currentSession.header.k ||
        header.blockSize !== currentSession.header.blockSize ||
        header.dataLength !== currentSession.header.dataLength
      ) {
        addLog('Mismatched frame (different session), skipped', 'error');
        return;
      }

      currentSession.symbolsReceived += 1;

      if (currentSession.seenSeeds.has(header.seed)) {
        setSymbolStats({
          received: currentSession.symbolsReceived,
          unique: currentSession.uniqueSymbols,
        });
        addLog(`Seed ${header.seed}: duplicate, skipped`, 'duplicate');
        return;
      }

      currentSession.seenSeeds.add(header.seed);
      currentSession.uniqueSymbols += 1;

      let numDecodedAfter: number;
      let numDecodedBefore: number;
      let k: number;
      let sessionComplete: boolean;

      if (currentSession.mode === 'fountain' && currentSession.fountainDecoder) {
        const dec = currentSession.fountainDecoder;
        numDecodedBefore = dec.numDecoded;
        addSymbol(dec, header.seed, symbolData, {
          c: solitonC,
          delta: solitonDelta,
        });
        numDecodedAfter = dec.numDecoded;
        k = dec.k;
        sessionComplete = isComplete(dec);
      } else if (currentSession.roundRobinDecoder) {
        const dec = currentSession.roundRobinDecoder;
        numDecodedBefore = dec.numDecoded;
        addRoundRobinSymbol(dec, header.seed, symbolData);
        numDecodedAfter = dec.numDecoded;
        k = dec.k;
        sessionComplete = isRoundRobinComplete(dec);
      } else {
        return;
      }

      const newBlocks = numDecodedAfter - numDecodedBefore;
      const newProgress = numDecodedAfter / k;
      setProgress(newProgress);
      setBlocksDecoded(numDecodedAfter);
      setSymbolStats({
        received: currentSession.symbolsReceived,
        unique: currentSession.uniqueSymbols,
      });

      if (currentSession.mode === 'round-robin') {
        if (newBlocks > 0) {
          addLog(
            `Block ${header.seed + 1}/${k}: received → ${numDecodedAfter}/${k} (${(newProgress * 100).toFixed(0)}%)`,
            'success'
          );
        } else {
          addLog(
            `Block ${header.seed + 1}/${k}: already have it`,
            'duplicate'
          );
        }
      } else if (newBlocks > 0) {
        addLog(
          `Seed ${header.seed}: +${newBlocks} block${newBlocks > 1 ? 's' : ''} decoded → ${numDecodedAfter}/${k} (${(newProgress * 100).toFixed(0)}%)`,
          'success'
        );
      } else {
        addLog(
          `Seed ${header.seed}: new symbol, no blocks resolved yet (${numDecodedAfter}/${k})`,
          'info'
        );
      }

      if (sessionComplete && !completeRef.current) {
        completeRef.current = true;
        setComplete(true);
        setScanning(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        const totalTime = Date.now() - startTimeRef.current;
        setElapsedMs(totalTime);

        addLog(
          `COMPLETE in ${(totalTime / 1000).toFixed(1)}s! Verifying...`,
          'success'
        );

        let reassembled: Uint8Array;
        if (
          currentSession.mode === 'fountain' &&
          currentSession.fountainDecoder
        ) {
          reassembled = reassemble(
            currentSession.fountainDecoder,
            currentSession.header.dataLength
          );
        } else {
          reassembled = reassembleRoundRobin(
            currentSession.roundRobinDecoder!,
            currentSession.header.dataLength
          );
        }

        setReceivedData(reassembled);

        const expectedHash = toHex(currentSession.header.dataHash);

        computeTruncatedHash(reassembled).then((receivedHashBytes) => {
          const receivedHash = toHex(receivedHashBytes);
          const pass = expectedHash === receivedHash;
          setVerification(
            pass
              ? { status: 'pass', expectedHash, receivedHash }
              : { status: 'fail', expectedHash, receivedHash }
          );
          addLog(
            `Verification: ${pass ? 'PASS' : 'FAIL'} (${expectedHash} vs ${receivedHash})`,
            pass ? 'success' : 'error'
          );
        });
      }
    },
    [solitonC, solitonDelta]
  );

  const k = session?.header.k ?? 0;
  const dataLength = session?.header.dataLength ?? 0;
  const scanSuccessRate =
    scanStats.framesSent > 0
      ? ((scanStats.qrFound / scanStats.framesSent) * 100).toFixed(1)
      : '0.0';

  // Estimated total symbols needed for fountain mode: K + R where R = c * ln(K/delta) * sqrt(K)
  const estimatedSymbolsNeeded =
    detectedMode === 'fountain' && k > 0
      ? k + solitonC * Math.log(k / solitonDelta) * Math.sqrt(k)
      : k;
  const receiveProgress =
    estimatedSymbolsNeeded > 0
      ? Math.min(symbolStats.unique / estimatedSymbolsNeeded, 1)
      : 0;

  return (
    <div>
      <h2>Receiver</h2>

      {/* Soliton params - only relevant for fountain mode */}
      {(!detectedMode || detectedMode === 'fountain') && (
        <div
          style={{
            marginBottom: 12,
            display: 'flex',
            gap: 12,
            alignItems: 'end',
            fontSize: 13,
          }}
        >
          <label>
            Soliton c:
            <input
              type="number"
              step={0.01}
              min={0.01}
              max={1}
              value={solitonC}
              onChange={(e) => setSolitonC(Number(e.target.value))}
              disabled={scanning}
              style={{ width: 80, padding: 4, marginLeft: 4 }}
            />
          </label>
          <label>
            Soliton delta:
            <input
              type="number"
              step={0.01}
              min={0.01}
              max={1}
              value={solitonDelta}
              onChange={(e) => setSolitonDelta(Number(e.target.value))}
              disabled={scanning}
              style={{ width: 80, padding: 4, marginLeft: 4 }}
            />
          </label>
        </div>
      )}

      {/* QR decode library toggle */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(['jsqr', 'zxing', 'server'] as ScanMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setScanMode(m)}
            disabled={scanning}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              background: scanMode === m ? '#0066cc' : '#eee',
              color: scanMode === m ? '#fff' : '#333',
              border: 'none',
              borderRadius: 4,
              cursor: scanning ? 'default' : 'pointer',
            }}
          >
            {SCAN_MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        {!scanning && !complete && (
          <button
            onClick={handleStart}
            style={{
              padding: '8px 20px',
              fontSize: 15,
              background: '#0a0',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Start Scanning
          </button>
        )}
        {scanning && (
          <button
            onClick={handleStop}
            style={{
              padding: '8px 20px',
              fontSize: 15,
              background: '#c00',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Stop
          </button>
        )}
        <button
          onClick={handleReset}
          style={{
            padding: '8px 20px',
            fontSize: 15,
            background: '#666',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
        {detectedMode && (
          <span
            style={{
              alignSelf: 'center',
              fontSize: 13,
              background: detectedMode === 'fountain' ? '#e3f2fd' : '#f3e5f5',
              padding: '4px 10px',
              borderRadius: 4,
              fontWeight: 'bold',
            }}
          >
            {detectedMode === 'fountain' ? 'Fountain Code' : 'Round-Robin'}
          </span>
        )}
      </div>

      {/* Compact layout: video + progress side by side on larger screens */}
      {scanning && (
        <div style={{ marginBottom: 8 }}>
          <QrScannerWrapper
            onScan={onScan}
            onStatsUpdate={onStatsUpdate}
            active={scanning}
            scanMode={scanMode}
          />
        </div>
      )}

      {/* Progress bars - always visible once session starts */}
      {session && (
        <div style={{ marginTop: 4 }}>
          {detectedMode === 'fountain' ? (
            <>
              {/* Receive progress: smooth, advances with each unique symbol */}
              <div
                style={{
                  marginBottom: 2,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: '#666',
                }}
              >
                <span>
                  Receive: {symbolStats.unique} /{' '}
                  ~{Math.ceil(estimatedSymbolsNeeded)} symbols
                </span>
                <span>{(receiveProgress * 100).toFixed(0)}%</span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: 12,
                  background: '#eee',
                  borderRadius: 6,
                  overflow: 'hidden',
                  marginBottom: 4,
                }}
              >
                <div
                  style={{
                    width: `${receiveProgress * 100}%`,
                    height: '100%',
                    background: complete ? '#0a0' : '#42a5f5',
                    transition: 'width 0.15s',
                    borderRadius: 6,
                  }}
                />
              </div>
              {/* Decode progress: actual blocks resolved via belief propagation */}
              <div
                style={{
                  marginBottom: 2,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  fontWeight: 'bold',
                }}
              >
                <span>
                  Decode: {blocksDecoded} / {k} blocks
                  {complete && ' — COMPLETE'}
                </span>
                <span>{(progress * 100).toFixed(1)}%</span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: 20,
                  background: '#eee',
                  borderRadius: 10,
                  overflow: 'hidden',
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: `${progress * 100}%`,
                    height: '100%',
                    background: complete ? '#0a0' : '#0066cc',
                    transition: 'width 0.15s',
                    borderRadius: 10,
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>
                {blocksDecoded} / {k} blocks ({(progress * 100).toFixed(1)}%)
                {complete && ' — COMPLETE'}
              </div>
              <div
                style={{
                  width: '100%',
                  height: 20,
                  background: '#eee',
                  borderRadius: 10,
                  overflow: 'hidden',
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: `${progress * 100}%`,
                    height: '100%',
                    background: complete ? '#0a0' : '#0066cc',
                    transition: 'width 0.15s',
                    borderRadius: 10,
                  }}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Live scan log */}
      {(scanning || log.length > 0) && (
        <div
          style={{
            marginTop: 4,
            padding: 6,
            background: '#1a1a2e',
            color: '#e0e0e0',
            borderRadius: 4,
            fontFamily: 'monospace',
            fontSize: 11,
            maxHeight: 150,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column-reverse',
          }}
        >
          <div>
            {[...log].reverse().map((entry, i) => (
              <div
                key={log.length - 1 - i}
                style={{
                  color:
                    entry.type === 'success'
                      ? '#4caf50'
                      : entry.type === 'error'
                        ? '#f44336'
                        : entry.type === 'duplicate'
                          ? '#666'
                          : '#90caf9',
                  padding: '1px 0',
                }}
              >
                [{entry.time.toFixed(1)}s] {entry.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scanner diagnostics */}
      {(scanning || session) && (
        <div
          style={{
            marginTop: 6,
            padding: 8,
            background: '#fff8e1',
            borderRadius: 4,
            border: '1px solid #ffc107',
            fontFamily: 'monospace',
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
            Scanner Diagnostics
          </div>
          <div>
            <strong>Camera:</strong> {scanStats.resolution || 'connecting...'}
            {scanStats.cropSize && ` → crop ${scanStats.cropSize}`}
            {scanStats.payloadKb && ` (${scanStats.payloadKb} KB/req)`}
          </div>
          <div>
            <strong>Frames:</strong> {scanStats.framesSent} sent |{' '}
            {scanStats.qrFound} found | {scanStats.qrMissed} missed |{' '}
            {scanSuccessRate}% hit rate
          </div>
          {parseFailures > 0 && (
            <div>
              <strong>Parse failures:</strong> {parseFailures}
            </div>
          )}
          <div>
            <strong>Avg round-trip:</strong> {scanStats.avgRoundTripMs}ms
            {scanStats.avgRoundTripMs > 0 && (
              <span>
                {' '}(~{(1000 / scanStats.avgRoundTripMs).toFixed(1)} fps)
              </span>
            )}
          </div>
          {scanStats.errors > 0 && (
            <div style={{ color: '#c00' }}>
              <strong>Errors:</strong> {scanStats.errors}
            </div>
          )}
        </div>
      )}

      {/* Decode stats */}
      {session && (
        <div
          style={{
            marginTop: 6,
            padding: 8,
            background: '#f5f5f5',
            borderRadius: 4,
            fontFamily: 'monospace',
            fontSize: 12,
          }}
        >
          <div>
            <strong>Data:</strong> {(dataLength / 1024).toFixed(1)} KB |{' '}
            <strong>K:</strong> {k} |{' '}
            <strong>Block:</strong> {session.header.blockSize}B |{' '}
            <strong>Mode:</strong> {session.mode}
          </div>
          <div>
            <strong>Symbols:</strong> {symbolStats.received} total,{' '}
            {symbolStats.unique} unique,{' '}
            {symbolStats.received - symbolStats.unique} dupes
          </div>
          {session.mode === 'fountain' && (
            <div>
              <strong>Overhead:</strong>{' '}
              {k > 0 ? (((symbolStats.unique - k) / k) * 100).toFixed(1) : 0}%
              ({symbolStats.unique - k} extra symbols)
            </div>
          )}
          <div>
            <strong>Time:</strong> {(elapsedMs / 1000).toFixed(1)}s
          </div>
          {complete && dataLength > 0 && elapsedMs > 0 && (
            <div>
              <strong>Throughput:</strong>{' '}
              {((dataLength / 1024) / (elapsedMs / 1000)).toFixed(2)} KB/s
            </div>
          )}
        </div>
      )}

      {/* Verification */}
      {verification.status !== 'pending' && (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            background: verification.status === 'pass' ? '#e6ffe6' : '#ffe6e6',
            borderRadius: 8,
            border: `2px solid ${verification.status === 'pass' ? '#0a0' : '#c00'}`,
          }}
        >
          <h3
            style={{
              color: verification.status === 'pass' ? '#060' : '#900',
              marginBottom: 4,
              fontSize: 16,
            }}
          >
            Verification: {verification.status === 'pass' ? 'PASS' : 'FAIL'}
          </h3>
          <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
            <div>
              <strong>Expected:</strong> {verification.expectedHash}
            </div>
            <div>
              <strong>Received:</strong> {verification.receivedHash}
            </div>
          </div>
        </div>
      )}

      {/* Received data viewer */}
      {receivedData && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => setShowData((prev) => !prev)}
            style={{
              padding: '6px 16px',
              fontSize: 13,
              background: showData ? '#0066cc' : '#eee',
              color: showData ? '#fff' : '#333',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {showData ? 'Hide' : 'View'} Received Data (
            {(receivedData.length / 1024).toFixed(1)} KB)
          </button>
          {showData && (
            <pre
              style={{
                marginTop: 6,
                padding: 10,
                background: '#1a1a2e',
                color: '#e0e0e0',
                borderRadius: 4,
                fontFamily: 'monospace',
                fontSize: 11,
                maxHeight: 400,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {new TextDecoder('utf-8', { fatal: false }).decode(receivedData)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
