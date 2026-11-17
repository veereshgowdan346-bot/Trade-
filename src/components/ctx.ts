import type { AppState, MarketData, WatchRow } from "./types";

export type Tone = "ok" | "err" | "info";

export type Ctx = {
  state: AppState | null;
  market: MarketData | null;
  watch: WatchRow[];
  symbol: string;
  setSymbol: (s: string) => void;
  go: (page: number) => void;
  refresh: () => Promise<void>;
  toast: (msg: string, tone?: Tone) => void;
};
