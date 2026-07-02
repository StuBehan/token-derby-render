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
  const raceClient = new RaceClient();

  let countdownInterval: number | null = null;
  let previousStatus = '';

  raceClient.onRaceUpdate = (race) => {
    const isNewFinish = race.status === 'finished' && previousStatus !== 'finished';
    previousStatus = race.status;

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
    sortedLiveHorses,
    joinRace,
    leaveRace,
    startCountdown,
    dispose,
    isHorseInactive,
  };
}
