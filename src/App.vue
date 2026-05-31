<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed } from 'vue';
import { DerbyScene } from './engine/DerbyScene';
import type { Horse } from './engine/Horse';
import type { WeatherType } from './engine/Weather';
import { RaceClient, type RaceView } from './engine/RaceClient';

const viewport = ref<HTMLDivElement | null>(null);
const isRunning = ref(true);
const weather = ref<WeatherType>('light_cloud');
const timeOfDayRef = ref(12.0); // start at noon (12:00)
let derbyScene: DerbyScene | null = null;

const selectedHorse = ref<Horse | null>(null);
const selectedHorsePos = ref<{ x: number; y: number; isBehind: boolean } | null>(null);

// Live Race state
const joinCodeInput = ref('');
const joinedRace = ref<RaceView | null>(null);
const isPolling = ref(false);
const errorMessage = ref('');
const raceClient = new RaceClient();

function deselectHorse() {
  if (derbyScene) {
    derbyScene.selectedHorse = null;
  }
  selectedHorse.value = null;
  selectedHorsePos.value = null;
}

onMounted(() => {
  if (!viewport.value) return;

  derbyScene = new DerbyScene(viewport.value);
  
  // Set up the time of day callback from the 3D scene engine
  derbyScene.onTimeUpdate = (time: number) => {
    timeOfDayRef.value = time;
  };

  derbyScene.onHorseSelected = (horse) => {
    selectedHorse.value = horse;
  };

  derbyScene.onHorsePositionUpdate = (pos) => {
    selectedHorsePos.value = pos;
  };

  // Wire API update listeners
  raceClient.onRaceUpdate = (race) => {
    joinedRace.value = race;
    derbyScene?.updateLiveRace(race);
    isPolling.value = false;
  };

  raceClient.onRaceError = (err) => {
    errorMessage.value = 'Connection error: ' + err.message;
    isPolling.value = false;
  };

  derbyScene.start();
});

onBeforeUnmount(() => {
  raceClient.stopPolling();
  derbyScene?.dispose();
  derbyScene = null;
});

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
    if (initialRace) {
      joinedRace.value = initialRace;
      derbyScene?.updateLiveRace(initialRace);
      raceClient.startPolling(2000);
    } else {
      errorMessage.value = 'Race not found.';
      isPolling.value = false;
    }
  } catch (err: any) {
    errorMessage.value = err.message || 'Error connecting to race server.';
    isPolling.value = false;
  }
}

function leaveRace() {
  raceClient.stopPolling();
  joinedRace.value = null;
  isPolling.value = false;
  errorMessage.value = '';
  derbyScene?.clearLiveRace();
}

function toggleRace() {
  isRunning.value = !isRunning.value;
  derbyScene?.setRunning(isRunning.value);
}

function resetRace() {
  isRunning.value = true;
  derbyScene?.reset();
}

function updateWeather(event: Event) {
  const nextWeather = (event.target as HTMLSelectElement).value as WeatherType;
  weather.value = nextWeather;
  derbyScene?.setWeather(nextWeather);
}

function onTimeSliderInput(event: Event) {
  const nextTime = parseFloat((event.target as HTMLInputElement).value);
  timeOfDayRef.value = nextTime;
  derbyScene?.setTimeOfDay(nextTime);
}

const formattedTime = computed(() => {
  const hours = Math.floor(timeOfDayRef.value);
  const minutes = Math.floor((timeOfDayRef.value % 1) * 60);
  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  return `${hh}:${mm}`;
});

const sortedLiveHorses = computed(() => {
  if (!joinedRace.value) return [];
  return [...joinedRace.value.horses].sort((a, b) => a.rank - b.rank);
});

function formatTimeLeft(seconds: number) {
  if (seconds <= 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
</script>

<template>
  <main class="app-shell">
    <section class="race-stage" aria-label="Token Derby 3D race renderer">
      <div ref="viewport" class="race-viewport"></div>

      <!-- Floating Horse Info Tag -->
      <div 
        v-if="selectedHorse && selectedHorsePos && !selectedHorsePos.isBehind"
        class="horse-info-tag"
        :style="{ left: selectedHorsePos.x + '%', top: selectedHorsePos.y + '%' }"
      >
        <div class="tag-header" :style="{ borderLeftColor: selectedHorse.getSaddleColorHex() }">
          <div class="header-main">
            <span class="horse-name">{{ selectedHorse.name }}</span>
            <span class="lane-badge">Lane {{ selectedHorse.index + 1 }}</span>
          </div>
          <button type="button" class="close-tag-btn" @click="deselectHorse" aria-label="Deselect horse">×</button>
        </div>
        <div class="tag-body">
          <div class="stat-row">
            <span class="stat-label">Progress</span>
            <span class="stat-val font-mono">{{ Math.round(selectedHorse.progress * 100) }}%</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Speed</span>
            <span class="stat-val font-mono">{{ Math.round(selectedHorse.speed * 2000) }} mph</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Jersey</span>
            <span class="stat-val">
              <span class="color-dot" :style="{ backgroundColor: selectedHorse.getSaddleColorHex() }"></span>
            </span>
          </div>
        </div>
      </div>

      <!-- Live Race Panel (Glassmorphism overlay) -->
      <div v-if="joinedRace" class="live-race-panel">
        <div class="panel-header">
          <div class="live-indicator-wrapper">
            <span :class="['status-dot', joinedRace.status]"></span>
            <span class="status-text">{{ joinedRace.status.toUpperCase() }}</span>
          </div>
          <h2>{{ joinedRace.name }}</h2>
          <p class="join-code-badge font-mono">CODE: {{ joinedRace.join_code }}</p>
        </div>
        
        <div class="panel-body">
          <div class="time-left-display">
            <span class="time-label">Time Remaining:</span>
            <span class="time-val font-mono">{{ formatTimeLeft(joinedRace.time_left_seconds) }}</span>
          </div>

          <div class="leaderboard-container">
            <h3>Leaderboard</h3>
            <div v-if="joinedRace.horses.length === 0" class="no-racers">
              Waiting for horses to join...
            </div>
            <table v-else class="leaderboard-table">
              <thead>
                <tr>
                  <th class="col-rank">Pos</th>
                  <th class="col-name">Horse / Jockey</th>
                  <th class="col-tokens">Tokens</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="horse in sortedLiveHorses" 
                  :key="horse.horse_id"
                  :class="{ 'is-leader': horse.rank === 1 }"
                >
                  <td class="col-rank font-mono">{{ horse.rank }}</td>
                  <td class="col-name">
                    <span class="color-dot" :style="{ backgroundColor: horse.colors.saddle }"></span>
                    <span class="horse-display-name">{{ horse.name }}</span>
                    <span class="user-display-name">by {{ horse.user_name }}</span>
                  </td>
                  <td class="col-tokens font-mono">{{ horse.current_tokens.toLocaleString() }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <button type="button" class="leave-btn" @click="leaveRace">Leave Live Race</button>
      </div>

      <div class="race-hud">
        <div>
          <p class="eyebrow">Token Derby Render</p>
          <h1>Race Visual Engine</h1>
        </div>

        <div class="hud-controls">
          <!-- Join Live Race Form -->
          <div v-if="!joinedRace" class="join-race-form">
            <input 
              v-model="joinCodeInput"
              type="text" 
              placeholder="Join Code" 
              aria-label="Race Join Code"
              @keydown.enter="joinRace"
            />
            <button type="button" class="join-btn" :disabled="isPolling" @click="joinRace">
              {{ isPolling ? 'Watching...' : 'Watch' }}
            </button>
          </div>
          <div v-if="errorMessage" class="hud-error-message font-mono">
            {{ errorMessage }}
          </div>

          <div class="time-control" v-if="!joinedRace">
            <span class="clock-display" aria-live="polite">{{ formattedTime }}</span>
            <input 
              type="range" 
              min="0" 
              max="23.99" 
              step="0.05" 
              :value="timeOfDayRef" 
              aria-label="Time of Day Slider"
              @input="onTimeSliderInput" 
            />
          </div>

          <div class="race-actions" v-if="!joinedRace">
            <select :value="weather" aria-label="Weather" @change="updateWeather">
              <option value="light_cloud">Light Cloud</option>
              <option value="very_cloudy">Very Cloudy</option>
              <option value="rainy">Rain</option>
              <option value="storm">Storm</option>
            </select>
            <button type="button" @click="toggleRace">
              {{ isRunning ? 'Pause' : 'Run' }}
            </button>
            <button type="button" @click="resetRace">Reset</button>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>
