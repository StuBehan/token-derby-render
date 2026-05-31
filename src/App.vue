<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed, type ComponentPublicInstance } from 'vue';
import { DerbyScene } from './engine/DerbyScene';
import { Horse } from './engine/Horse';
import type { WeatherType } from './engine/Weather';
import { type RaceView, type HorseColors } from './engine/RaceClient';
import { type RequestedCameraMode, type HorseCameraMode, type SceneCameraMode } from './engine/CameraController';
import { startConfettiAnimation } from './ui/confetti';
import { useAchievementToasts } from './ui/achievementToasts';
import { PodiumPreviewRenderer } from './ui/PodiumPreviewRenderer';
import { useLiveRace } from './ui/useLiveRace';
import { buildPodiumHorses, buildVisualPodium, getPillarNumber } from './ui/podium';
import { formatClockTime, formatTimeLeft } from './ui/timeFormat';

const viewport = ref<HTMLDivElement | null>(null);
const isRunning = ref(true);
const weather = ref<WeatherType>('light_cloud');
const timeOfDayRef = ref(12.0); // start at noon (12:00)
let derbyScene: DerbyScene | null = null;

const selectedHorse = ref<Horse | null>(null);
const selectedHorsePos = ref<{ x: number; y: number; isBehind: boolean } | null>(null);
const currentCamMode = ref<'free' | 'follow' | 'jockey'>('free');
const isCameraLocked = ref(false);

const sceneCamMode = ref<RequestedCameraMode>('start_hold');

function isSelectableCameraMode(mode: SceneCameraMode): mode is RequestedCameraMode {
  return mode !== 'transitioning';
}

function onSceneCamModeChange(event: Event) {
  const nextMode = (event.target as HTMLSelectElement).value as RequestedCameraMode;
  sceneCamMode.value = nextMode;
  derbyScene?.setCameraMode(nextMode);
}
const achievementToasts = useAchievementToasts();
const activeToasts = achievementToasts.activeToasts;

function processAchievements(race: RaceView) {
  achievementToasts.processRace(race, (horseName, colorHex, achievementName, xp) => {
    derbyScene?.spawnAchievementEffect(horseName, colorHex, achievementName, xp);
  });
}

const liveRace = useLiveRace({
  onRaceUpdate: (race) => {
    derbyScene?.updateLiveRace(race);
    processAchievements(race);
  },
  onInitialRace: (race) => {
    achievementToasts.seedFromRace(race);
  },
  onRaceFinished: () => {
    triggerFinishedConfetti();
  },
  onLondonConditions: (londonWeather, daylight) => {
    weather.value = londonWeather;
    derbyScene?.setWeather(londonWeather);

    timeOfDayRef.value = daylight.currentHour;
    derbyScene?.setTimeOfDay(daylight.currentHour);
    derbyScene?.setSunriseSunset(daylight.sunriseHour, daylight.sunsetHour);
  },
  onLeave: () => {
    achievementToasts.clear();
    showFinishedOverlay.value = false;
    stopFinishedConfetti();
    derbyScene?.clearLiveRace();
  },
});

const {
  joinCodeInput,
  joinedRace,
  isPolling,
  errorMessage,
  timeLeftSeconds,
  sortedLiveHorses,
  joinRace,
  leaveRace,
  isHorseInactive,
} = liveRace;

// Podium & Confetti Overlay State
const showFinishedOverlay = ref(false);
const confettiCanvas = ref<HTMLCanvasElement | null>(null);
let cleanConfetti: (() => void) | null = null;

function triggerFinishedConfetti() {
  showFinishedOverlay.value = true;
  setTimeout(() => {
    if (confettiCanvas.value) {
      if (cleanConfetti) cleanConfetti();
      cleanConfetti = startConfettiAnimation(confettiCanvas.value);
    }
  }, 100);
}

function stopFinishedConfetti() {
  if (cleanConfetti) {
    cleanConfetti();
    cleanConfetti = null;
  }
}

const podiumPreviewRenderer = new PodiumPreviewRenderer();

function setPodiumCanvasRef(el: Element | ComponentPublicInstance | null, position: string, colors: HorseColors) {
  if (!el) {
    podiumPreviewRenderer.cleanup(position);
    return;
  }
  if (!(el instanceof HTMLCanvasElement)) {
    return;
  }
  setTimeout(() => {
    if (el) {
      podiumPreviewRenderer.init(el, position, colors);
    }
  }, 50);
}

function deselectHorse() {
  if (derbyScene) {
    derbyScene.selectedHorse = null;
    derbyScene.setHorseCameraMode('free');
  }
  selectedHorse.value = null;
  selectedHorsePos.value = null;
  currentCamMode.value = 'free';
}

function setHorseCamMode(mode: HorseCameraMode) {
  if (derbyScene) {
    derbyScene.setHorseCameraMode(mode);
    currentCamMode.value = mode;
  }
}

onMounted(() => {
  if (!viewport.value) return;

  derbyScene = new DerbyScene(viewport.value);
  
  // Set up the time of day callback from the 3D scene engine
  derbyScene.onTimeUpdate = (time: number) => {
    timeOfDayRef.value = time;
  };

  // Set up the camera lock update callback
  derbyScene.onCameraLockUpdate = (locked: boolean) => {
    isCameraLocked.value = locked;
  };
  isCameraLocked.value = derbyScene.isCameraLocked;

  // Set up the camera mode update callback
  derbyScene.onCameraModeUpdate = (mode: SceneCameraMode) => {
    if (isSelectableCameraMode(mode)) {
      sceneCamMode.value = mode;
    }
  };

  derbyScene.onHorseSelected = (horse) => {
    selectedHorse.value = horse;
    if (horse && derbyScene) {
      currentCamMode.value = derbyScene.selectedHorseCameraMode;
    } else {
      currentCamMode.value = 'free';
    }
  };

  derbyScene.onHorsePositionUpdate = (pos) => {
    selectedHorsePos.value = pos;
    if (derbyScene) {
      currentCamMode.value = derbyScene.selectedHorseCameraMode;
    }
  };

  derbyScene.start();
  liveRace.startCountdown();
});

onBeforeUnmount(() => {
  liveRace.dispose();
  stopFinishedConfetti();
  podiumPreviewRenderer.cleanupAll();
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

const formattedTime = computed(() => formatClockTime(timeOfDayRef.value));

const podiumHorses = computed(() => buildPodiumHorses(joinedRace.value));

const visualPodium = computed(() => buildVisualPodium(podiumHorses.value));
</script>

<template>
  <main class="app-shell">
    <section class="race-stage" aria-label="Token Derby 3D race renderer">
      <div ref="viewport" class="race-viewport"></div>

      <!-- Camera Locked Banner -->
      <transition name="fade">
        <div v-if="isCameraLocked" class="camera-locked-banner">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lock-icon">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span>CAMERA LOCKED</span>
        </div>
      </transition>

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
            <span v-if="selectedHorse.isEatingGrass" class="inactive-badge" title="Inactive - Eating Grass">🌾 Inactive</span>
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
          <div class="stat-row camera-row">
            <span class="stat-label">View</span>
            <span class="stat-val view-btns">
              <button 
                type="button" 
                :class="['cam-btn', { active: currentCamMode === 'free' }]" 
                @click="setHorseCamMode('free')"
              >Orbit</button>
              <button 
                type="button" 
                :class="['cam-btn', { active: currentCamMode === 'follow' }]" 
                @click="setHorseCamMode('follow')"
              >Track</button>
              <button 
                type="button" 
                :class="['cam-btn', { active: currentCamMode === 'jockey' }]" 
                @click="setHorseCamMode('jockey')"
              >Jockey</button>
            </span>
          </div>
        </div>
      </div>

      <!-- Live Race Panel (Glassmorphism overlay) -->
      <div v-if="joinedRace" class="live-race-panel">
        <div class="panel-header">
          <div class="live-indicator-wrapper">
            <span :class="['status-dot', joinedRace.status]"></span>
            <span class="status-text">{{ joinedRace.status === 'pending' ? 'AWAITING START' : joinedRace.status.toUpperCase() }}</span>
          </div>
          <h2>{{ joinedRace.name }}</h2>
          <p class="join-code-badge font-mono">CODE: {{ joinedRace.join_code }}</p>
        </div>
        
        <div class="panel-body">
          <div class="time-left-display">
            <span class="time-label">{{ joinedRace.status === 'pending' ? 'Time Until Start:' : 'Time Remaining:' }}</span>
            <span class="time-val font-mono">{{ formatTimeLeft(timeLeftSeconds) }}</span>
          </div>

          <button 
            v-if="joinedRace.status === 'finished'" 
            type="button" 
            class="show-standings-btn" 
            @click="triggerFinishedConfetti"
          >
            🏆 View Standings
          </button>

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
                  <th class="col-xp">XP</th>
                  <th class="col-xp-gain">Gain</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="horse in sortedLiveHorses" 
                  :key="horse.horse_id"
                  :class="{ 'is-leader': horse.rank === 1, 'is-inactive-row': isHorseInactive(horse) }"
                >
                  <td class="col-rank font-mono">{{ horse.rank }}</td>
                  <td class="col-name">
                    <span class="color-dot" :style="{ backgroundColor: horse.colors.saddle }"></span>
                    <div class="horse-names-wrapper">
                      <span class="horse-display-name">{{ horse.name }}</span>
                      <span class="user-display-name">
                        by {{ horse.user_name }}
                        <span v-if="isHorseInactive(horse)" class="inactive-badge" title="Inactive - Eating Grass">🌾 Inactive</span>
                      </span>
                    </div>
                  </td>
                  <td class="col-tokens font-mono">{{ horse.current_tokens.toLocaleString() }}</td>
                  <td class="col-xp font-mono">{{ (horse.xp + (horse.live_xp || 0)).toLocaleString() }}</td>
                  <td class="col-xp-gain font-mono">
                    <span v-if="horse.live_xp" class="live-xp-badge">+{{ horse.live_xp }}</span>
                    <span v-else class="zero-xp-gain">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Achievement Toasts Container -->
      <div class="achievement-toasts-container" aria-live="polite">
        <transition-group name="toast-fade">
          <div 
            v-for="toast in activeToasts" 
            :key="toast.id" 
            class="achievement-toast-card"
            :style="{ borderLeftColor: toast.colorHex }"
          >
            <div class="toast-xp-badge" :style="{ backgroundColor: toast.colorHex }">
              +{{ toast.xp }} XP
            </div>
            <div class="toast-content">
              <h4 class="toast-title">{{ toast.horseName }}</h4>
              <p class="toast-desc">Gained: <b>{{ toast.achievementName }}</b> - {{ toast.description }}</p>
            </div>
          </div>
        </transition-group>
      </div>

      <div class="race-hud">
        <div>
          <p class="eyebrow">Token Derby Render</p>
          <h1>Race Visual Engine</h1>
        </div>

        <div class="controls-pane">
          <!-- 1. Join/Leave Live Race Form (Race Code) -->
          <div class="control-row join-row">
            <span class="control-label">Race Code:</span>
            <div v-if="!joinedRace" class="join-input-group">
              <input 
                v-model="joinCodeInput"
                type="text" 
                placeholder="JOIN CODE" 
                aria-label="Race Join Code"
                @keydown.enter="joinRace"
              />
              <button type="button" class="join-btn" :disabled="isPolling" @click="joinRace">
                {{ isPolling ? 'Watching...' : 'Watch' }}
              </button>
            </div>
            <div v-else class="join-input-group joined-group">
              <span class="active-code font-mono">{{ joinedRace.join_code }}</span>
              <button type="button" class="join-btn leave-btn-mini" @click="leaveRace">
                Leave
              </button>
            </div>
          </div>
          <div v-if="errorMessage" class="hud-error-message font-mono">
            {{ errorMessage }}
          </div>

          <!-- 2. Camera views dropdown (Camera) -->
          <div class="control-row camera-row">
            <span class="control-label">Camera:</span>
            <select :value="sceneCamMode" aria-label="Camera View" @change="onSceneCamModeChange">
              <option value="free">Orbit (Free)</option>
              <option value="start_hold">Overlook Start</option>
              <option value="start_follow">Start Follow</option>
              <option value="start_pan">Panoramic Pan</option>
              <option value="finish_view">Finish Line</option>
              <option value="grandstand_top">Grandstand Summit</option>
              <option value="curve_iso">Curve Isometric</option>
              <option value="rail_cam">Rail Cam</option>
            </select>
          </div>

          <!-- 3. Weather Selector (Weather) -->
          <div class="control-row weather-row" v-if="!joinedRace">
            <span class="control-label">Weather:</span>
            <select :value="weather" aria-label="Weather" @change="updateWeather">
              <option value="light_cloud">Light Cloud</option>
              <option value="very_cloudy">Very Cloudy</option>
              <option value="rainy">Rain</option>
              <option value="storm">Storm</option>
            </select>
          </div>

          <!-- 4. Time of Day Control (Time) -->
          <div class="control-row time-row" v-if="!joinedRace">
            <span class="control-label">Time:</span>
            <div class="time-inputs">
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
          </div>

          <!-- 5. Simulation Actions (Sim) -->
          <div class="control-row sim-row" v-if="!joinedRace">
            <span class="control-label">Sim:</span>
            <div class="pill-buttons">
              <button type="button" class="action-btn" @click="toggleRace">
                {{ isRunning ? 'Pause' : 'Run' }}
              </button>
              <button type="button" class="action-btn" @click="resetRace">Reset</button>
            </div>
          </div>
        </div>
      </div>
      <!-- Confetti Canvas for Celebrations -->
      <canvas v-if="showFinishedOverlay" ref="confettiCanvas" class="confetti-canvas"></canvas>

      <!-- Finished Podium Modal Overlay -->
      <div v-if="joinedRace && joinedRace.status === 'finished' && showFinishedOverlay" class="podium-overlay">
        <div class="podium-modal">
          <h2>🏆 Final Standings 🏆</h2>
          
          <div class="podium-pedestals">
            <div 
              v-for="p in visualPodium" 
              :key="p.data.horse_id" 
              :class="['podium-column', p.position]"
            >
              <!-- Horse Card Details -->
              <div class="podium-card" :style="{ borderTopColor: p.data.colors.saddle }">
                <!-- 3D Horse model rendered in canvas (protrudes out of the top of the card) -->
                <canvas :ref="el => setPodiumCanvasRef(el, p.position, p.data.colors)" class="podium-horse-canvas"></canvas>

                <!-- Medal & Position Label (now lower than the picture) -->
                <div class="podium-badge-wrapper">
                  <div class="podium-badge">{{ p.badge }}</div>
                  <span class="podium-place-label">{{ p.label }}</span>
                </div>

                <h3 class="podium-horse-name">{{ p.data.name }}</h3>
                <p class="podium-jockey-name">by {{ p.data.user_name }}</p>
                
                <div class="podium-tokens-count font-mono">
                  {{ p.data.current_tokens.toLocaleString() }} tokens
                </div>
                
                <div class="podium-xp-awards">
                  <span class="podium-level-chip">Lvl. {{ p.data.afterInfo.level }}</span>
                  <span class="podium-xp-gained">+{{ p.data.xpAwarded }} XP</span>
                </div>
                
                <!-- Animated XP bar -->
                <div class="podium-xp-bar">
                  <div 
                    class="podium-xp-bar-fill animate-fill" 
                    :style="{ '--target-width': (p.data.afterInfo.progress * 100) + '%' }"
                  ></div>
                </div>
                
                <div class="podium-xp-text font-mono">
                  {{ p.data.afterInfo.xp_into_level }} / {{ p.data.afterInfo.xp_for_level }} XP
                </div>
                
                <div v-if="p.data.levelledUp" class="podium-level-up">
                  LEVEL UP!
                </div>
              </div>
              
              <!-- Pedestal Pillar base -->
              <div class="podium-pillar">
                <span class="pillar-number">{{ getPillarNumber(p.position) }}</span>
              </div>
            </div>
          </div>

          <!-- Standings table for remaining positions -->
          <div v-if="podiumHorses.length > 3" class="podium-rest-container">
            <table class="podium-rest-table">
              <thead>
                <tr>
                  <th class="text-left">Pos</th>
                  <th class="text-left">Horse</th>
                  <th class="text-right">Tokens</th>
                  <th class="text-right">XP Earned</th>
                  <th class="text-right">Level</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="horse in podiumHorses.slice(3)" 
                  :key="horse.horse_id"
                >
                  <td class="font-mono text-left">{{ horse.rank }}</td>
                  <td class="text-left">
                    <span class="color-dot" :style="{ backgroundColor: horse.colors.saddle }"></span>
                    <b>{{ horse.name }}</b>
                    <span class="jockey-sub text-muted"> (by {{ horse.user_name }})</span>
                  </td>
                  <td class="font-mono text-right">{{ horse.current_tokens.toLocaleString() }}</td>
                  <td class="font-mono text-right text-green">+{{ horse.xpAwarded }} XP</td>
                  <td class="font-mono text-right">
                    <span v-if="horse.levelledUp" class="text-green">
                      Lvl. {{ horse.beforeInfo.level }} → {{ horse.afterInfo.level }}
                    </span>
                    <span v-else>
                      Lvl. {{ horse.afterInfo.level }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <button type="button" class="podium-close-btn" @click="showFinishedOverlay = false">
            Dismiss Standings
          </button>
        </div>
      </div>
    </section>
  </main>
</template>
