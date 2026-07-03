import { generateMockRace } from './MockRaceGenerator';

export type AchievementName =
  | 'Racer!'
  | 'Overtake!'
  | 'Pacesetter!'
  | 'Stampede!'
  | 'Took the lead!'
  | 'Comeback!'
  | 'Pulled Away!';

export interface RecentEvent {
  at: number;
  name: AchievementName;
  xp: number;
}

export interface HorseColors {
  body: string;
  mane: string;
  tail: string;
  saddle: string;
}

export interface HorseView {
  horse_id: string;
  name: string;
  colors: HorseColors;
  current_tokens: number;
  user_name: string;
  xp: number;
  live_xp?: number;
  rank: number;
  recent_events?: RecentEvent[];
  last_heartbeat: string;
  /** Trailing 15-minute token pace, already expressed as tokens/min by the server. */
  pace_15m?: number;
}

export interface RaceView {
  race_id: string;
  name: string;
  join_code: string;
  start_time: string;
  end_time: string;
  status: 'pending' | 'live' | 'finished';
  time_left_seconds: number;
  horses: HorseView[];
  server_time: string;
}

export class RaceClient {
  private apiBase: string;
  private intervalId: number | null = null;
  private joinCode: string | null = null;
  private abortController: AbortController | null = null;
  private demoStartTime: number | null = null;

  public onRaceUpdate?: (race: RaceView) => void;
  public onRaceError?: (error: Error) => void;

  constructor(apiBase: string = 'https://token-derby.mauricode.co.uk/api') {
    this.apiBase = apiBase;
  }

  public setJoinCode(joinCode: string) {
    this.joinCode = joinCode;
    if (joinCode === 'DEMO') {
      this.demoStartTime = Date.now();
    }
  }

  public getJoinCode(): string | null {
    return this.joinCode;
  }

  public startPolling(intervalMs: number = 2000) {
    this.stopPolling();
    this.poll();
    this.intervalId = window.setInterval(() => this.poll(), intervalMs);
  }

  public stopPolling() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  public async fetchOnce(): Promise<RaceView | null> {
    if (!this.joinCode) return null;
    if (this.joinCode === 'DEMO') {
      if (!this.demoStartTime) {
        this.demoStartTime = Date.now();
      }
      return generateMockRace(this.demoStartTime);
    }

    const url = `${this.apiBase}/races/${encodeURIComponent(this.joinCode)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json() as RaceView;
  }

  private async poll() {
    if (!this.joinCode) return;

    if (this.joinCode === 'DEMO') {
      const data = generateMockRace(this.demoStartTime);
      setTimeout(() => {
        this.onRaceUpdate?.(data);
      }, 50);
      return;
    }

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    try {
      const url = `${this.apiBase}/races/${encodeURIComponent(this.joinCode)}`;
      const response = await fetch(url, { signal: this.abortController.signal });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json() as RaceView;
      this.onRaceUpdate?.(data);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.onRaceError?.(error instanceof Error ? error : new Error('Unknown race polling error'));
    }
  }

}
