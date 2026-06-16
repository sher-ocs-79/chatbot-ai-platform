import { io, type Socket } from 'socket.io-client';

export interface ChatbotClientOptions {
  /** URL of the Socket.IO chatbot server (e.g. http://localhost:3001) */
  serverUrl: string;
}

export interface ChatbotMessage {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  answerSource?: 'ai' | 'qa_cache';
  cacheHit?: boolean;
}

export type MessageHandler      = (message: ChatbotMessage) => void;
export type TypingHandler       = (isTyping: boolean) => void;
export type ConnectionHandler   = (connected: boolean) => void;
export type AuthErrorHandler    = (error: { message: string }) => void;
export type NameUpdatedHandler  = (name: string) => void;

const SESSION_TOKEN_KEY = 'chatbot_session_token';

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getOrCreateSessionToken(): string {
  try {
    const existing = localStorage.getItem(SESSION_TOKEN_KEY);
    if (existing) return existing;
    const token = generateId();
    localStorage.setItem(SESSION_TOKEN_KEY, token);
    return token;
  } catch {
    return generateId();
  }
}

export class ChatbotClient {
  private socket: Socket | null = null;
  private readonly serverUrl: string;
  private apiKey: string | null = null;
  private readonly sessionToken: string;

  private messageHandlers     = new Set<MessageHandler>();
  private typingHandlers      = new Set<TypingHandler>();
  private connectionHandlers  = new Set<ConnectionHandler>();
  private authErrorHandlers   = new Set<AuthErrorHandler>();
  private nameUpdatedHandlers = new Set<NameUpdatedHandler>();

  constructor(options: ChatbotClientOptions) {
    this.serverUrl   = options.serverUrl;
    this.sessionToken = getOrCreateSessionToken();
  }

  /**
   * Open the socket connection using an API key issued by the dashboard.
   * Call disconnect() first if you need to switch keys.
   */
  connect(apiKey: string): void {
    if (this.socket?.connected) return;

    this.apiKey = apiKey;

    const socket = io(this.serverUrl, {
      // Pass the token via Socket.IO auth so server middleware can inspect it.
      auth: apiKey ? { token: apiKey } : undefined,
      autoConnect: true,
    });
    this.socket = socket;

    socket.on('connect', () => this.fire('connection', true));
    socket.on('disconnect', () => this.fire('connection', false));

    socket.on('connect_error', (err: Error & { data?: { type?: string } }) => {
      if ((err as any).data?.type === 'auth' || err.message === 'Authentication failed') {
        this.authErrorHandlers.forEach((h) => h({ message: err.message }));
      }
    });

    socket.on('auth_error', (data: { message: string }) => {
      this.authErrorHandlers.forEach((h) => h(data));
    });

    // Server-side typing indicator (optional — client-side fallback is in sendMessage)
    socket.on('typing', (isTyping: boolean) => {
      this.fire('typing', isTyping);
    });

    socket.on(
      'message',
      (data: { message: string; answer_source?: string; cache_hit?: boolean }) => {
        this.fire('typing', false);
        this.fire('message', {
          id:           generateId(),
          role:         'assistant',
          message:      data.message,
          answerSource: data.answer_source as ChatbotMessage['answerSource'],
          cacheHit:     data.cache_hit,
        });
      },
    );

    socket.on('name_updated', ({ name }: { name: string }) => {
      this.nameUpdatedHandlers.forEach((h) => h(name));
    });
  }

  /**
   * Send a message. The user message is delivered synchronously to registered
   * handlers; the assistant reply arrives asynchronously via onMessage.
   * Throws if connect() has not been called yet.
   */
  sendMessage(text: string): ChatbotMessage {
    if (!this.socket?.connected) {
      throw new Error('Not connected — call connect(apiKey) first');
    }
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Message cannot be empty');

    const userMessage: ChatbotMessage = {
      id:      generateId(),
      role:    'user',
      message: trimmed,
    };

    // Deliver user message synchronously so the UI can optimistically render it
    this.fire('message', userMessage);
    this.fire('typing', true);

    this.socket.emit('chat', {
      message:      trimmed,
      apiKey:       this.apiKey,
      sessionToken: this.sessionToken,
    });

    return userMessage;
  }

  /** Register a handler for incoming messages (both user and assistant). */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /** Register a handler for the assistant typing indicator. */
  onTyping(handler: TypingHandler): () => void {
    this.typingHandlers.add(handler);
    return () => this.typingHandlers.delete(handler);
  }

  /** Register a handler for socket connection state changes. */
  onConnection(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  /** Register a handler for API key auth failures. */
  onAuthError(handler: AuthErrorHandler): () => void {
    this.authErrorHandlers.add(handler);
    return () => this.authErrorHandlers.delete(handler);
  }

  /** Register a handler for name-gate resolution (server emits name_updated). */
  onNameUpdated(handler: NameUpdatedHandler): () => void {
    this.nameUpdatedHandlers.add(handler);
    return () => this.nameUpdatedHandlers.delete(handler);
  }

  /** Disconnect and clear state. */
  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.apiKey = null;
    this.fire('connection', false);
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private fire(event: 'message', payload: ChatbotMessage): void;
  private fire(event: 'typing', payload: boolean): void;
  private fire(event: 'connection', payload: boolean): void;
  private fire(event: string, payload: unknown): void {
    if (event === 'message') {
      this.messageHandlers.forEach((h) => h(payload as ChatbotMessage));
    } else if (event === 'typing') {
      this.typingHandlers.forEach((h) => h(payload as boolean));
    } else if (event === 'connection') {
      this.connectionHandlers.forEach((h) => h(payload as boolean));
    }
  }
}
