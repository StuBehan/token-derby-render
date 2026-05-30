<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed } from 'vue';
import { DerbyScene } from './engine/DerbyScene';
import type { WeatherType } from './engine/Weather';

const viewport = ref<HTMLDivElement | null>(null);
const isRunning = ref(true);
const weather = ref<WeatherType>('light_cloud');
const timeOfDayRef = ref(12.0); // start at noon (12:00)
let derbyScene: DerbyScene | null = null;

onMounted(() => {
  if (!viewport.value) return;

  derbyScene = new DerbyScene(viewport.value);
  
  // Set up the time of day callback from the 3D scene engine
  derbyScene.onTimeUpdate = (time: number) => {
    timeOfDayRef.value = time;
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

      <div class="race-hud">
        <div>
          <p class="eyebrow">Token Derby</p>
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
