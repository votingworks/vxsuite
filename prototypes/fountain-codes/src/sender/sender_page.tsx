import { useCallback, useMemo, useState } from 'react';
import { createEncoder } from '../fountain/encoder';
import { createRoundRobinEncoder } from '../fountain/round_robin_encoder';
import { generateTestData, computeTruncatedHash, toHex } from '../utils/test_data';
import { frameSizeBase64, maxBlockSizeForLevel, QR_CAPACITY } from '../utils/binary';
import { EncodingMode, SymbolEncoder } from '../fountain/types';
import { QrAnimator } from './qr_animator';
import {
  WAYNE_COUNTY_PRESETS,
  SIGNING_OVERHEAD_BYTES,
} from '../utils/wayne_county_data';

interface SenderConfig {
  mode: EncodingMode;
  dataSource: 'random' | string; // 'random' or preset ID
  dataSizeKb: number;
  blockSize: number;
  frameRate: number;
  qrLevel: 'L' | 'M';
  dataSeed: number;
  solitonC: number;
  solitonDelta: number;
}

const DEFAULT_CONFIG: SenderConfig = {
  mode: 'round-robin',
  dataSource: 'random',
  dataSizeKb: 10,
  blockSize: 400,
  frameRate: 4,
  qrLevel: 'M',
  dataSeed: 42,
  solitonC: 0.2,
  solitonDelta: 0.2,
};

export function SenderPage(): JSX.Element {
  const [config, setConfig] = useState<SenderConfig>(DEFAULT_CONFIG);
  const [encoder, setEncoder] = useState<SymbolEncoder | null>(null);
  const [dataHashHex, setDataHashHex] = useState<string>('');
  const [dataLabel, setDataLabel] = useState<string>('');
  const [symbolCount, setSymbolCount] = useState(0);
  const [running, setRunning] = useState(false);

  const isPreset = config.dataSource !== 'random';
  const activePreset = isPreset
    ? WAYNE_COUNTY_PRESETS.find((p) => p.id === config.dataSource)
    : undefined;

  const maxBlock = maxBlockSizeForLevel(config.qrLevel);
  const effectiveBlockSize = Math.min(config.blockSize, maxBlock);
  const base64Size = frameSizeBase64(effectiveBlockSize);
  const qrCapacity = QR_CAPACITY[config.qrLevel];
  const theoreticalKbps = (effectiveBlockSize * config.frameRate) / 1024;

  async function handleStart() {
    let data: Uint8Array;
    let label: string;

    if (config.dataSource === 'random') {
      const sizeBytes = config.dataSizeKb * 1024;
      data = generateTestData(config.dataSeed, sizeBytes);
      label = `${config.dataSizeKb}KB (${data.length}B)`;
    } else {
      const preset = WAYNE_COUNTY_PRESETS.find(
        (p) => p.id === config.dataSource
      );
      if (!preset) return;
      data = preset.buildData();
      const totalKb = (data.length / 1024).toFixed(1);
      if (preset.precinctCount > 0) {
        const tallyKb = (preset.tallyBytes / 1024).toFixed(1);
        const overheadKb = (SIGNING_OVERHEAD_BYTES / 1024).toFixed(1);
        label = `${preset.label} (${preset.precinctCount} precincts) — ${tallyKb} KB tally + ${overheadKb} KB signing = ${totalKb} KB`;
      } else {
        label = `${preset.label} — ${totalKb} KB`;
      }
    }

    const hash = await computeTruncatedHash(data);

    let enc: SymbolEncoder;
    if (config.mode === 'fountain') {
      enc = createEncoder(data, hash, {
        blockSize: effectiveBlockSize,
        c: config.solitonC,
        delta: config.solitonDelta,
      });
    } else {
      enc = createRoundRobinEncoder(data, hash, effectiveBlockSize);
    }

    setDataHashHex(toHex(hash));
    setDataLabel(label);
    setEncoder(enc);
    setSymbolCount(0);
    setRunning(true);
  }

  function handleStop() {
    setRunning(false);
    setEncoder(null);
  }

  const onSymbolGenerated = useCallback(() => {
    setSymbolCount((c) => c + 1);
  }, []);

  const frameIntervalMs = useMemo(
    () => Math.round(1000 / config.frameRate),
    [config.frameRate]
  );

  return (
    <div>
      <h2>Sender</h2>

      {/* Mode toggle */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 4 }}>
        {(['round-robin', 'fountain'] as EncodingMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setConfig({ ...config, mode: m })}
            disabled={running}
            style={{
              padding: '6px 16px',
              fontSize: 14,
              background: config.mode === m ? '#0066cc' : '#eee',
              color: config.mode === m ? '#fff' : '#333',
              border: 'none',
              borderRadius: 4,
              cursor: running ? 'default' : 'pointer',
            }}
          >
            {m === 'round-robin' ? 'Round-Robin' : 'Fountain Code'}
          </button>
        ))}
      </div>

      {/* Throughput estimate */}
      <div
        style={{
          marginBottom: 12,
          padding: 8,
          background: '#e8f0fe',
          borderRadius: 4,
          fontFamily: 'monospace',
          fontSize: 12,
        }}
      >
        <strong>Max:</strong> {theoreticalKbps.toFixed(1)} KB/s
        ({effectiveBlockSize}B x {config.frameRate}fps)
        {' | '}QR: {base64Size}/{qrCapacity}B
        ({((base64Size / qrCapacity) * 100).toFixed(0)}%)
        {' | '}Mode: {config.mode}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginBottom: 12,
          maxWidth: 500,
          fontSize: 13,
        }}
      >
        <label style={{ gridColumn: '1 / -1' }}>
          Data source:
          <select
            value={config.dataSource}
            onChange={(e) =>
              setConfig({ ...config, dataSource: e.target.value })
            }
            disabled={running}
            style={{ width: '100%', padding: 4 }}
          >
            <option value="random">Random Data</option>
            <optgroup label="Wayne County MI">
              {WAYNE_COUNTY_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.description}
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        {!isPreset && (
          <label>
            Data size:
            <input
              type="range"
              min={1}
              max={500}
              value={config.dataSizeKb}
              onChange={(e) =>
                setConfig({ ...config, dataSizeKb: Number(e.target.value) })
              }
              disabled={running}
              style={{ width: '100%' }}
            />
            <span>{config.dataSizeKb} KB</span>
          </label>
        )}

        {isPreset && activePreset && (
          <label>
            Preset info:
            <div
              style={{
                padding: 4,
                background: '#f0f0f0',
                borderRadius: 4,
                marginTop: 4,
              }}
            >
              {activePreset.precinctCount > 0
                ? `${activePreset.precinctCount} precincts`
                : activePreset.label}
            </div>
          </label>
        )}

        <label>
          Block size:
          <input
            type="range"
            min={100}
            max={2200}
            step={50}
            value={config.blockSize}
            onChange={(e) =>
              setConfig({ ...config, blockSize: Number(e.target.value) })
            }
            disabled={running}
            style={{ width: '100%' }}
          />
          <span>
            {effectiveBlockSize}B
            {config.blockSize > maxBlock && (
              <span style={{ color: '#c00' }}> (capped)</span>
            )}
          </span>
        </label>

        <label>
          Frame rate:
          <input
            type="range"
            min={1}
            max={30}
            value={config.frameRate}
            onChange={(e) =>
              setConfig({ ...config, frameRate: Number(e.target.value) })
            }
            disabled={running}
            style={{ width: '100%' }}
          />
          <span>{config.frameRate} fps</span>
        </label>

        <label>
          QR Level:
          <select
            value={config.qrLevel}
            onChange={(e) =>
              setConfig({ ...config, qrLevel: e.target.value as 'L' | 'M' })
            }
            disabled={running}
            style={{ width: '100%', padding: 4 }}
          >
            <option value="L">L (max {maxBlockSizeForLevel('L')}B)</option>
            <option value="M">M (max {maxBlockSizeForLevel('M')}B)</option>
          </select>
        </label>

        {!isPreset && (
          <label>
            Seed:
            <input
              type="number"
              value={config.dataSeed}
              onChange={(e) =>
                setConfig({ ...config, dataSeed: Number(e.target.value) })
              }
              disabled={running}
              style={{ width: '100%', padding: 4 }}
            />
          </label>
        )}

        {config.mode === 'fountain' && (
          <>
            <label>
              Soliton c:
              <input
                type="number"
                step={0.01}
                min={0.01}
                max={1}
                value={config.solitonC}
                onChange={(e) =>
                  setConfig({ ...config, solitonC: Number(e.target.value) })
                }
                disabled={running}
                style={{ width: '100%', padding: 4 }}
              />
            </label>
            <label>
              Soliton delta:
              <input
                type="number"
                step={0.01}
                min={0.01}
                max={1}
                value={config.solitonDelta}
                onChange={(e) =>
                  setConfig({ ...config, solitonDelta: Number(e.target.value) })
                }
                disabled={running}
                style={{ width: '100%', padding: 4 }}
              />
            </label>
          </>
        )}
      </div>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        {!running ? (
          <button
            onClick={handleStart}
            style={{
              padding: '10px 24px',
              fontSize: 16,
              background: '#0a0',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Start
          </button>
        ) : (
          <button
            onClick={handleStop}
            style={{
              padding: '10px 24px',
              fontSize: 16,
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
      </div>

      {encoder && running && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#ededed',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <h4 style={{ margin: '0 0 0.3em 0' }}>
            Scan the QR code to receive data
          </h4>
          <QrAnimator
            encoder={encoder}
            mode={config.mode}
            frameIntervalMs={frameIntervalMs}
            qrLevel={config.qrLevel}
            onSymbolGenerated={onSymbolGenerated}
          />
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <button
              onClick={handleStop}
              style={{
                padding: '10px 24px',
                fontSize: 16,
                background: '#c00',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Stop
            </button>
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              right: 8,
              padding: 8,
              background: 'rgba(245,245,245,0.95)',
              borderRadius: 4,
              fontFamily: 'monospace',
              fontSize: 12,
              textAlign: 'center',
            }}
          >
            <strong>Data:</strong> {dataLabel}
            {' | '}<strong>K:</strong> {encoder.k}
            {' | '}<strong>Block:</strong> {encoder.blockSize}B
            {' | '}<strong>Hash:</strong> {dataHashHex}
            {' | '}<strong>Sent:</strong> {symbolCount}
            {config.mode === 'round-robin' && encoder.k > 0 && (
              <span> (cycle {Math.floor(symbolCount / encoder.k) + 1})</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
