import type { BrokerStatus } from "@/lib/brokers";
import type { Instrument } from "@/lib/instruments";
import type { RiskConfig } from "@/lib/risk";
import type { Consensus } from "@/lib/strategies";
import type { Charges } from "@/lib/tax";

export type BrokerKey = "angel" | "shoonya" | "groww";

export type WsStatus = {
  connected: boolean;
  connecting: boolean;
  reconnecting?: boolean;
  connectionState?: "DISCONNECTED" | "CONNECTING" | "LIVE STREAMING" | "RECONNECTING";
  subscribedCount: number;
  ticksReceived: number;
  lastTickAt: number | null;
  lastPongAt: number | null;
  lastError: string | null;
};

export type Pos = {
  id: number;
  symbol: string;
  exchange: string;
  side: "BUY" | "SELL";
  qty: number;
  entryPrice: number;
  slPrice: number;
  targetPrice: number;
  strategy: string;
  broker: BrokerKey;
  mode?: string;
  openedAt: string;
  ltp: number;
  mtm: number;
};

export type Trade = {
  id: number;
  symbol: string;
  side: string;
  qty: number;
  entryPrice: number;
  exitPrice: number | null;
  exitReason: string | null;
  grossPnl: number | null;
  totalCharges: number | null;
  netPnl: number | null;
  strategy: string;
  broker: string;
  mode?: string;
  openedAt: string;
  closedAt: string | null;
  charges: Charges | null;
};

export type SegregatedPnl = {
  realized: number;
  unrealized: number;
  total: number;
  charges: number;
  trades: number;
  wins: number;
};

export type Ord = {
  id: number;
  ts: string;
  symbol: string;
  exchange: string;
  side: string;
  qty: number;
  price: number;
  status: string;
  mode?: string;
  source: string;
  strategy: string;
  brokerRequested: string | null;
  brokerUsed: string | null;
  failover: boolean;
  latencyMs: number;
  slPrice: number | null;
  targetPrice: number | null;
  expectedNet: number | null;
  reason: string | null;
};

export type AuditRow = { id: number; ts: string; level: string; category: string; message: string };

export type AppState = {
  now: number;
  risk: RiskConfig;
  circuit: { tripped: boolean; date: string; ts: string | null; reason: string | null; recoveryMode?: boolean };
  recovery?: {
    active: boolean;
    enteredAt: string | null;
    deficit: number;
    remainingCapital: number;
    reason: string | null;
  };
  crashProtection?: {
    active: boolean;
    reason: string | null;
  };
  pnl: SegregatedPnl & {
    paper?: SegregatedPnl;
    live?: SegregatedPnl;
    activeMode?: "PAPER" | "LIVE";
  };
  session: { equityOpen: boolean; mcxOpen: boolean; istTime: string; istDate: string; weekday: boolean };
  positions: Pos[];
  orders: Ord[];
  trades: Trade[];
  brokers: Record<BrokerKey, BrokerStatus>;
  failures: Record<string, number>;
  vault: {
    summary: Record<string, { configured: boolean; fields: Record<string, string>; updatedAt?: string | null }>;
    fallbackKey: boolean;
  };
  audit: AuditRow[];
  tokenMaster: { at: string; rows: number; source: string } | null;
  ws?: WsStatus;
  feed?: string;
  feedStatus?: string;
  autoTrader?: {
    daemonRunning: boolean;
    intervalMs: number;
    lastTickAt: number | null;
    lastScanAt: number | null;
    lastScanCount: number;
    lastFiredCount: number;
    lastError: string | null;
  };
};

export type MarketData = {
  now: number;
  inst: Instrument;
  ltp: number | null;
  change: number;
  changePct: number;
  high: number | null;
  low: number | null;
  volume: number;
  candles: { t: number; o: number; h: number; l: number; c: number; v: number }[];
  ema9: number[];
  ema21: number[];
  vwap: number[];
  depth: { bids: { price: number; qty: number; orders: number }[]; asks: { price: number; qty: number; orders: number }[] };
  consensus: Consensus;
  feed: string;
  feedStatus?: string;
  ws?: WsStatus;
};

export type WatchRow = {
  symbol: string;
  name: string;
  exchange: string;
  lotSize: number;
  ltp: number | null;
  change: number;
  changePct: number;
  high: number | null;
  low: number | null;
  volume: number;
  regime: string;
  adx: number;
  direction: string;
  quorum: number;
  gbm: number;
  qualifies: boolean;
  source?: string;
};

export const BROKER_NAMES: Record<BrokerKey, string> = {
  angel: "Angel One",
  shoonya: "Shoonya",
  groww: "Groww",
};
