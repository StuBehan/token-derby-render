import { computed, ref } from 'vue';
import { RaceClient, type RaceView, type HorseView } from '../engine/RaceClient';
import type { WeatherType } from '../engine/Weather';
import { fetchDaylight, fetchWeather } from '../engine/WeatherService';
import { defaultLocation, type Location } from '../engine/locations';

export interface DaylightSync {
  currentHour: number;
  sunriseHour: number;
  sunsetHour: number;
}

interface LiveRaceOptions {
  onRaceUpdate: (race: RaceView) => void;
  onInitialRace: (race: RaceView) => void;
  onRaceFinished: () => void;
  onLocationConditions: (weather: WeatherType, daylight: DaylightSync) => void;
  onLeave: () => void;
  /** Called at sync time to read the currently selected location, so location changes take effect on the next join. */
  getLocation?: () => Location;
}

export function useLiveRace(options: LiveRaceOptions) {
  const joinCodeInput = ref('');
  const joinedRace = ref<RaceView | null>(null);
  const isPolling = ref(false);
  const errorMessage = ref('');
  const timeLeftSeconds = ref(0);
  // Fallback rate for races that don't provide the server's pace_15m (e.g. the DEMO mock race),
  // derived from the delta between consecutive polls. Noisier than pace_15m since token arrivals
  // are bursty, so pace_15m is preferred whenever a horse has it.
  const fallbackRatesPerSecond = ref<Map<string, number>>(new Map());
  const raceClient = new RaceClient();

  let countdownInterval: number | null = null;
  let previousStatus = '';
  const lastTickTokens = new Map<string, { tokens: number; atMs: number }>();

  function seedTokenBaseline(race: RaceView) {
    const nowMs = Date.parse(race.server_time);
    lastTickTokens.clear();
    race.horses.forEach((horse) => {
      lastTickTokens.set(horse.horse_id, { tokens: horse.current_tokens, atMs: nowMs });
    });
  }

  function updateFallbackRates(race: RaceView) {
    const nowMs = Date.parse(race.server_time);
    const nextRates = new Map<string, number>();
    race.horses.forEach((horse) => {
      const prevTick = lastTickTokens.get(horse.horse_id);
      if (prevTick && nowMs > prevTick.atMs) {
        const deltaSeconds = (nowMs - prevTick.atMs) / 1000;
        nextRates.set(horse.horse_id, (horse.current_tokens - prevTick.tokens) / deltaSeconds);
      }
      lastTickTokens.set(horse.horse_id, { tokens: horse.current_tokens, atMs: nowMs });
    });
    fallbackRatesPerSecond.value = nextRates;
  }

  const tokensPerMinuteMap = computed(() => {
    const map = new Map<string, number>();
    const race = joinedRace.value;
    if (!race) return map;

    race.horses.forEach((horse) => {
      if (typeof horse.pace_15m === 'number') {
        // pace_15m is already tokens/min (server sums the trailing-window deltas
        // and divides by the window's minutes) - see token-derby's series-transform.ts.
        if (horse.pace_15m > 0) map.set(horse.horse_id, Math.round(horse.pace_15m));
        return;
      }
      const perSecond = fallbackRatesPerSecond.value.get(horse.horse_id);
      if (perSecond && perSecond > 0) {
        map.set(horse.horse_id, Math.round(perSecond * 60));
      }
    });

    return map;
  });

  raceClient.onRaceUpdate = (race) => {
    const isNewFinish = race.status === 'finished' && previousStatus !== 'finished';
    previousStatus = race.status;

    updateFallbackRates(race);
    joinedRace.value = race;
    timeLeftSeconds.value = race.time_left_seconds;
    isPolling.value = false;
    options.onRaceUpdate(race);

    if (isNewFinish) {
      options.onRaceFinished();
    }
  };

  raceClient.onRaceError = (err) => {
    errorMessage.value = `Connection error: ${err.message}`;
    isPolling.value = false;
  };

  const sortedLiveHorses = computed(() => {
    if (!joinedRace.value) return [];
    return [...joinedRace.value.horses].sort((a, b) => a.rank - b.rank);
  });

  function startCountdown() {
    if (countdownInterval !== null) return;

    countdownInterval = window.setInterval(() => {
      if (joinedRace.value && joinedRace.value.status === 'live' && timeLeftSeconds.value > 0) {
        timeLeftSeconds.value -= 1;
      }
    }, 1000);
  }

  async function joinRace() {
    const code = joinCodeInput.value.trim().toUpperCase();
    if (!code) {
      errorMessage.value = 'Please enter a join code.';
      return;
    }

    errorMessage.value = '';
    isPolling.value = true;
    raceClient.setJoinCode(code);

    try {
      const initialRace = await raceClient.fetchOnce();
      if (!initialRace) {
        errorMessage.value = 'Race not found.';
        isPolling.value = false;
        return;
      }

      previousStatus = initialRace.status;
      seedTokenBaseline(initialRace);
      joinedRace.value = initialRace;
      timeLeftSeconds.value = initialRace.time_left_seconds;
      options.onRaceUpdate(initialRace);
      options.onInitialRace(initialRace);

      syncLocationConditions();
      raceClient.startPolling(2000);

      if (initialRace.status === 'finished') {
        options.onRaceFinished();
      }
    } catch (err: unknown) {
      errorMessage.value = err instanceof Error ? err.message : 'Error connecting to race server.';
      isPolling.value = false;
    }
  }

  function leaveRace() {
    raceClient.stopPolling();
    joinedRace.value = null;
    timeLeftSeconds.value = 0;
    isPolling.value = false;
    errorMessage.value = '';
    previousStatus = '';
    lastTickTokens.clear();
    fallbackRatesPerSecond.value = new Map();
    options.onLeave();
  }

  function dispose() {
    raceClient.stopPolling();
    if (countdownInterval !== null) {
      window.clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  function isHorseInactive(horse: HorseView): boolean {
    if (!joinedRace.value || joinedRace.value.status === 'finished') return false;
    const lastHeartbeatMs = Date.parse(horse.last_heartbeat);
    const serverTimeMs = Date.parse(joinedRace.value.server_time);
    return serverTimeMs - lastHeartbeatMs > 75000;
  }

  function syncLocationConditions() {
    const location = options.getLocation?.() ?? defaultLocation;
    Promise.all([fetchWeather(location.weather), fetchDaylight(location.weather)])
      .then(([weather, daylight]) => {
        options.onLocationConditions(weather, daylight);
      })
      .catch((err) => {
        console.error('Failed to sync location weather/daylight on join:', err);
      });
  }

  return {
    joinCodeInput,
    joinedRace,
    isPolling,
    errorMessage,
    timeLeftSeconds,
    tokensPerMinuteMap,
    sortedLiveHorses,
    joinRace,
    leaveRace,
    startCountdown,
    dispose,
    isHorseInactive,
  };
}
