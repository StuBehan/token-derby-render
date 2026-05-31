<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed } from 'vue';
import { DerbyScene } from './engine/DerbyScene';
import type { Horse } from './engine/Horse';
import type { WeatherType } from './engine/Weather';

const viewport = ref<HTMLDivElement | null>(null);
const isRunning = ref(true);
const weather = ref<WeatherType>('light_cloud');
const timeOfDayRef = ref(12.0); // start at noon (12:00)
let derbyScene: DerbyScene | null = null;

const selectedHorse = ref<Horse | null>(null);
const selectedHorsePos = ref<{ x: number; y: number; isBehind: boolean } | null>(null);

const horseNames = ["Glinting Gold", "Blue Bullet", "Crimson Comet", "Green Gale", "Purple Pegasus", "Orange Outlaw"];
const horseAccentColors = ['#d84d38', '#2d7dd2', '#e7c948', '#54a66d', '#8b5bd6', '#f47a30'];

function getHorseName(index: number) {
  return horseNames[index % horseNames.length];
}

function getHorseAccentColor(index: number) {
  return horseAccentColors[index % horseAccentColors.length];
}

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

  derbyScene.start();
});

onBeforeUnmount(() => {
  derbyScene?.dispose();
  derbyScene = null;
});

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
        <div class="tag-header" :style="{ borderLeftColor: getHorseAccentColor(selectedHorse.index) }">
          <div class="header-main">
            <span class="horse-name">{{ getHorseName(selectedHorse.index) }}</span>
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
            <span class="stat-label">Jockey Jersey</span>
            <span class="stat-val">
              <span class="color-dot" :style="{ backgroundColor: getHorseAccentColor(selectedHorse.index) }"></span>
            </span>
          </div>
        </div>
      </div>

      <div class="race-hud">
        <div>
          <p class="eyebrow">Token Derby Render</p>
          <h1>Race Visual Engine</h1>
        </div>

        <div class="hud-controls">
          <div class="time-control">
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

          <div class="race-actions">
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
