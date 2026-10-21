export type ChatRole = 'user' | 'assistant' | 'tool' | 'system';
export type SSEEventType = 'token' | 'tool_start' | 'tool_result' | 'suggestions' | 'done' | 'error';

export interface ChatMessage {
  id: string;
  threadId: string;
  role: ChatRole;
  content: string;
  toolJson: Record<string, unknown> | null;
  createdAt: string;
  feedback: 'up' | 'down' | null;
}

export interface ChatThread {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  data: Record<string, unknown>;
  cardType: string; // 'title' | 'forecast' | 'pulse' | 'compare' | 'action' | 'list' | 'accuracy' | 'contrarian'
  summary?: string;
  error?: string;
}

export interface PendingAction {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  description: string;
  titleId?: string;
}

export interface ChatRequest {
  threadId?: string;
  message: string;
  titleContext?: string; // preloaded titleId for context
  history?: Array<{ role: 'user' | 'assistant'; content: string }>; // for anonymous session-only context
}

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
}

export interface ForecastCardData {
  titleId: string;
  title: string;
  poster: string | null;
  releaseDate: string | null;
  hitProbability: number;
  flopProbability: number;
  revenueRange: [number, number] | null;
  revenueEstimate: number | null;
  confidence: string;
  topDrivers: string[];
  disclaimer: string;
  sampleSize?: number;
}

export interface PulseCardData {
  titleId: string;
  title: string;
  count: number;
  hit: number;
  flop: number;
  hitShare: number | null;
  stage: string;
  sampleSizeWarning: boolean;
  target?: string;
}

export interface CompareCardData {
  titleA: {
    id: string;
    title: string;
    poster: string | null;
    hitProbability: number;
    revenueEstimate: number | null;
    voteAverage: number | null;
  };
  titleB: {
    id: string;
    title: string;
    poster: string | null;
    hitProbability: number;
    revenueEstimate: number | null;
    voteAverage: number | null;
  };
  verdict: string;
}

export interface TitleCardData {
  id: string;
  title: string;
  overview: string;
  poster: string | null;
  releaseDate: string | null;
  genres: string[];
  runtime: number | null;
  voteAverage: number | null;
  mediaType: string;
}

export interface ActionCardData {
  id: string;
  toolName: 'add_to_library' | 'make_opening_call';
  args: Record<string, unknown>;
  description: string;
  titleId: string;
  titleName: string;
}
