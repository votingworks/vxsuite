import { useState } from 'react';
import { SenderPage } from './sender/sender_page';
import { ReceiverPage } from './receiver/receiver_page';

type View = 'sender' | 'receiver';

export function App(): JSX.Element {
  const [view, setView] = useState<View>('sender');

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <h1 style={{ marginBottom: 16 }}>Fountain Codes QR Prototype</h1>
      <nav style={{ marginBottom: 24, display: 'flex', gap: 8 }}>
        <button
          onClick={() => setView('sender')}
          style={{
            padding: '8px 20px',
            fontWeight: view === 'sender' ? 'bold' : 'normal',
            background: view === 'sender' ? '#0066cc' : '#eee',
            color: view === 'sender' ? '#fff' : '#333',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          Sender
        </button>
        <button
          onClick={() => setView('receiver')}
          style={{
            padding: '8px 20px',
            fontWeight: view === 'receiver' ? 'bold' : 'normal',
            background: view === 'receiver' ? '#0066cc' : '#eee',
            color: view === 'receiver' ? '#fff' : '#333',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          Receiver
        </button>
      </nav>
      {view === 'sender' ? <SenderPage /> : <ReceiverPage />}
    </div>
  );
}
