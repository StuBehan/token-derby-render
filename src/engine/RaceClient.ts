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
      return this.generateMockRace();
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
      const data = this.generateMockRace();
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

  private generateMockRace(): RaceView {
    const startOffsetMs = 30000; // 30 seconds pending
    const durationMs = 120000;   // 120 seconds live
    const createdTime = this.demoStartTime || Date.now();
    const startTime = createdTime + startOffsetMs;
    const endTime = startTime + durationMs;
    const now = Date.now();

    let status: 'pending' | 'live' | 'finished' = 'pending';
    let timeLeft = 0;
    let t_live_sec = 0;

    if (now < startTime) {
      status = 'pending';
      timeLeft = Math.ceil((startTime - now) / 1000);
    } else if (now < endTime) {
      status = 'live';
      timeLeft = Math.ceil((endTime - now) / 1000);
      t_live_sec = (now - startTime) / 1000;
    } else {
      status = 'finished';
      timeLeft = 0;
      t_live_sec = 120; // freeze at 2 minutes
    }

    const horseColors = [
      { body: '#f1c40f', mane: '#f39c12', tail: '#d35400', saddle: '#e74c3c' }, // Glinting Gold
      { body: '#3498db', mane: '#2980b9', tail: '#1abc9c', saddle: '#f1c40f' }, // Blue Bullet
      { body: '#e74c3c', mane: '#c0392b', tail: '#2c3e50', saddle: '#9b59b6' }, // Crimson Comet
      { body: '#2ecc71', mane: '#27ae60', tail: '#34495e', saddle: '#3498db' }, // Green Gale
      { body: '#9b59b6', mane: '#8e44ad', tail: '#f1c40f', saddle: '#2ecc71' }, // Purple Pegasus
      { body: '#e67e22', mane: '#d35400', tail: '#7f8c8d', saddle: '#16a085' }, // Orange Outlaw
    ];

    const names = ["Glinting Gold", "Blue Bullet", "Crimson Comet", "Green Gale", "Purple Pegasus", "Orange Outlaw"];
    const users = ["Alice", "Bob", "Charlie", "David", "Eva", "Frank"];

    const mockEvents: Record<number, { atOffset: number; name: AchievementName; xp: number }[]> = {
      2: [ // Crimson Comet
        { atOffset: 8000, name: 'Took the lead!', xp: 5 }
      ],
      0: [ // Glinting Gold
        { atOffset: 25000, name: 'Racer!', xp: 1 }
      ],
      3: [ // Green Gale
        { atOffset: 45000, name: 'Stampede!', xp: 2 }
      ],
      1: [ // Blue Bullet
        { atOffset: 70000, name: 'Overtake!', xp: 3 }
      ],
      5: [ // Orange Outlaw
        { atOffset: 95000, name: 'Comeback!', xp: 5 },
        { atOffset: 110000, name: 'Pulled Away!', xp: 3 }
      ]
    };

    const horses: HorseView[] = names.map((name, index) => {
      let tokens = 0;
      if (status === 'live' || status === 'finished') {
        const t = t_live_sec;
        if (index === 0) {
          // Glinting Gold: steady builder
          tokens = 100 + Math.floor(t * 45);
        } else if (index === 1) {
          // Blue Bullet: late accelerator
          tokens = 50 + Math.floor(t * 30 + Math.max(0, t - 60) * 55);
        } else if (index === 2) {
          // Crimson Comet: starts fast, fades
          tokens = 150 + Math.floor(t * 60 - Math.max(0, t - 45) * 32);
        } else if (index === 3) {
          // Green Gale: wave patterns / erratic
          tokens = 80 + Math.floor(t * 38 + Math.sin(t * 0.18) * 220);
        } else if (index === 4) {
          // Purple Pegasus: slow and steady
          tokens = 60 + Math.floor(t * 35);
        } else {
          // Orange Outlaw: massive comeback from behind
          tokens = 30 + Math.floor(t * 22 + Math.max(0, t - 80) * 135);
        }
      }

      const eventsForHorse = mockEvents[index] || [];
      const recent_events: RecentEvent[] = [];
      let live_xp = 0;
      for (const ev of eventsForHorse) {
        const evTime = startTime + ev.atOffset;
        if (now >= evTime) {
          live_xp += ev.xp;
          if (now - evTime <= 90000) {
            recent_events.push({
              at: evTime,
              name: ev.name,
              xp: ev.xp
            });
          }
        }
      }

      return {
        horse_id: `mock-horse-${index}`,
        name,
        colors: horseColors[index],
        current_tokens: tokens,
        user_name: users[index],
        xp: 1500 + index * 100,
        live_xp,
        rank: index + 1,
        recent_events
      };
    });

    const sorted = [...horses].sort((a, b) => b.current_tokens - a.current_tokens);
    horses.forEach((h) => {
      h.rank = sorted.findIndex((sh) => sh.horse_id === h.horse_id) + 1;
    });

    return {
      race_id: 'demo-race-id',
      name: 'Demo Championship',
      join_code: 'DEMO',
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      status,
      time_left_seconds: timeLeft,
      horses,
      server_time: new Date(now).toISOString(),
    };
  }
}
