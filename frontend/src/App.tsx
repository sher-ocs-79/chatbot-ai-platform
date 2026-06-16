import { useEffect, useRef, useState, useCallback, FormEvent } from 'react';
import { ChatbotClient, ChatbotMessage } from './chatbot-client';

const DEFAULT_SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';
const DEFAULT_API_KEY    = import.meta.env.VITE_API_KEY    ?? 'bk_7ce1641a70c20cd5136d4ab9b90821bd96f31a32b3f410d62321218fc1fb1100';

export default function App() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [apiKey, setApiKey]       = useState(DEFAULT_API_KEY);

  const [connected, setConnected] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [messages, setMessages]   = useState<ChatbotMessage[]>([]);
  const [isTyping, setIsTyping]   = useState(false);
  const [input, setInput]         = useState('');

  const clientRef = useRef<ChatbotClient | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Receive serverUrl + apiKey from the WordPress parent via postMessage.
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'buink-config') {
        if (e.data.serverUrl) setServerUrl(e.data.serverUrl);
        if (e.data.apiKey)    setApiKey(e.data.apiKey);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Re-connect whenever serverUrl or apiKey changes.
  useEffect(() => {
    clientRef.current?.disconnect();

    const client = new ChatbotClient({ serverUrl });
    clientRef.current = client;

    client.onConnection((c) => setConnected(c));
    client.onAuthError((err) => setAuthError(err.message));
    client.onTyping((t) => setIsTyping(t));
    client.onMessage((msg) => setMessages((prev) => [...prev, msg]));

    client.connect(apiKey);
    inputRef.current?.focus();

    return () => client.disconnect();
  }, [serverUrl, apiKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = useCallback((e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !connected) return;
    try {
      clientRef.current?.sendMessage(input.trim());
      setInput('');
    } catch (err) {
      console.error(err);
    }
  }, [input, connected]);

  const statusLabel = connected ? 'Online' : 'Connecting…';
  const statusClass = connected ? 'status--connected' : 'status--connecting';

  return (
    <div className="chat-screen">
      {/* Header */}
      <header className="chat-header">
        <div className="chat-header__left">
          <span className="logo-mark logo-mark--sm">B</span>
          <div>
            <div className="chat-header__name">Blink Chat</div>
            <div className={`chat-header__status ${statusClass}`}>
              <span className="status__dot" />
              {statusLabel}
            </div>
          </div>
        </div>
        {authError && <div className="auth-error">{authError}</div>}
      </header>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && connected && (
          <div className="chat-empty">
            <span className="logo-mark logo-mark--lg">B</span>
            <p>How can I help you today?</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`msg msg--${msg.role}`}>
            {msg.role === 'assistant' && (
              <span className="msg__avatar">B</span>
            )}
            <div className="msg__body">
              <p className="msg__text">{msg.message}</p>
              {msg.cacheHit && (
                <span className="msg__badge">cached</span>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="msg msg--assistant">
            <span className="msg__avatar">B</span>
            <div className="msg__body">
              <span className="typing-indicator">
                <span /><span /><span />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-footer">
        <form className="chat-input-form" onSubmit={handleSend}>
          <input
            ref={inputRef}
            className="chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Blink Chat…"
            disabled={!connected}
          />
          <button
            className="btn btn--send"
            type="submit"
            disabled={!connected || !input.trim()}
            aria-label="Send"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
