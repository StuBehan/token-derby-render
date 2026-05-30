<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { DerbyScene } from './engine/DerbyScene';
import type { WeatherType } from './engine/Weather';

const viewport = ref<HTMLDivElement | null>(null);
const isRunning = ref(true);
const weather = ref<WeatherType>('light_cloud');
let derbyScene: DerbyScene | null = null;

onMounted(() => {
  if (!viewport.value) return;

  derbyScene = new DerbyScene(viewport.value);
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
    </section>
  </main>
</template>
