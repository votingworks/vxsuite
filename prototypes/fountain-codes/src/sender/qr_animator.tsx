import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { SymbolEncoder, EncodingMode, FrameHeader } from '../fountain/types';
import { encodeFrame } from '../utils/binary';

interface QrAnimatorProps {
  encoder: SymbolEncoder;
  mode: EncodingMode;
  frameIntervalMs: number;
  qrLevel: 'L' | 'M';
  onSymbolGenerated: () => void;
}

export function QrAnimator({
  encoder,
  mode,
  frameIntervalMs,
  qrLevel,
  onSymbolGenerated,
}: QrAnimatorProps): JSX.Element {
  const [frameData, setFrameData] = useState<string>('');
  const [currentSeed, setCurrentSeed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function generateFrame() {
      const symbol = encoder.nextSymbol();
      const header: FrameHeader = {
        mode,
        k: encoder.k,
        blockSize: encoder.blockSize,
        dataLength: encoder.dataLength,
        dataHash: encoder.dataHash,
        seed: symbol.seed,
      };
      const encoded = encodeFrame(header, symbol.data);
      setFrameData(encoded);
      setCurrentSeed(symbol.seed);
      onSymbolGenerated();
    }

    generateFrame();
    intervalRef.current = setInterval(generateFrame, frameIntervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [encoder, mode, frameIntervalMs, onSymbolGenerated]);

  if (!frameData) return <div>Generating...</div>;

  return (
    <div>
      <div
        style={{
          background: 'white',
          padding: 16,
          display: 'inline-block',
          borderRadius: 8,
        }}
      >
        <QRCodeSVG value={frameData} level={qrLevel} size={400} />
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: '#666' }}>
        {mode === 'round-robin'
          ? `Chunk ${currentSeed + 1}/${encoder.k}`
          : `Symbol #${currentSeed}`}
        {' | '}{frameData.length} chars
      </div>
    </div>
  );
}
