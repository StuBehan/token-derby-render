<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed, type ComponentPublicInstance } from 'vue';
import * as THREE from 'three';
import { DerbyScene } from './engine/DerbyScene';
import { Horse } from './engine/Horse';
import type { WeatherType } from './engine/Weather';
import { RaceClient, type RaceView, type HorseColors } from './engine/RaceClient';

const viewport = ref<HTMLDivElement | null>(null);
const isRunning = ref(true);
const weather = ref<WeatherType>('light_cloud');
const timeOfDayRef = ref(12.0); // start at noon (12:00)
let derbyScene: DerbyScene | null = null;

const selectedHorse = ref<Horse | null>(null);
const selectedHorsePos = ref<{ x: number; y: number; isBehind: boolean } | null>(null);
const currentCamMode = ref<'free' | 'follow' | 'jockey'>('free');
const isCameraLocked = ref(false);

// Live Race state
const joinCodeInput = ref('');
const joinedRace = ref<RaceView | null>(null);

function isHorseInactive(horse: any): boolean {
  if (!joinedRace.value || joinedRace.value.status === 'finished') return false;
  const lastHeartbeatMs = Date.parse(horse.last_heartbeat);
  const serverTimeMs = Date.parse(joinedRace.value.server_time);
  return (serverTimeMs - lastHeartbeatMs) > 75000;
}

const isPolling = ref(false);
const errorMessage = ref('');

const sceneCamMode = ref('start_hold');

function onSceneCamModeChange(event: Event) {
  const nextMode = (event.target as HTMLSelectElement).value;
  sceneCamMode.value = nextMode;
  derbyScene?.setCameraMode(nextMode as any);
}
const raceClient = new RaceClient();
const timeLeftSeconds = ref(0);
let countdownInterval: number | null = null;

// Achievement toast structures
interface ActiveToast {
  id: string;
  horseName: string;
  colorHex: string;
  achievementName: string;
  description: string;
  xp: number;
}

const activeToasts = ref<ActiveToast[]>([]);
const lastSeenEventTimes = new Map<string, number>();

const ACHIEVEMENT_DESCRIPTIONS: Record<string, string> = {
  'Racer!': 'Raced continuously for an hour',
  'Overtake!': 'Overtook another horse',
  'Pacesetter!': 'Led the race for an hour straight',
  'Stampede!': 'Gained 7,000+ tokens in a single minute',
  'Took the lead!': 'Charged into first place',
  'Comeback!': 'Climbed from last place to the top half',
  'Pulled Away!': 'Grew the lead by 5,000+ tokens in a minute',
};

function getAchievementDescription(name: string, xp: number): string {
  if (name === 'Overtake!') {
    const climbed = Math.floor(xp / 3);
    if (climbed <= 1) return 'Overtook another horse';
    return `Overtook ${climbed} horses`;
  }
  return ACHIEVEMENT_DESCRIPTIONS[name] || 'Gained an achievement';
}

let toastIdCounter = 0;
function addToast(horseName: string, colorHex: string, achievementName: string, xp: number) {
  const id = `toast-${toastIdCounter++}`;
  const description = getAchievementDescription(achievementName, xp);
  const toast: ActiveToast = {
    id,
    horseName,
    colorHex,
    achievementName,
    description,
    xp
  };
  activeToasts.value.push(toast);
  
  setTimeout(() => {
    activeToasts.value = activeToasts.value.filter(t => t.id !== id);
  }, 6000);
}

function processAchievements(race: RaceView) {
  for (const horse of race.horses) {
    if (!horse.recent_events) continue;
    
    const watermark = lastSeenEventTimes.get(horse.horse_id) ?? 0;
    const freshEvents = horse.recent_events.filter(e => e.at > watermark);
    
    if (freshEvents.length > 0) {
      const maxAt = Math.max(...freshEvents.map(e => e.at));
      lastSeenEventTimes.set(horse.horse_id, maxAt);
      
      for (const ev of freshEvents) {
        // Trigger 3D floating text effect
        derbyScene?.spawnAchievementEffect(horse.name, horse.colors.saddle, ev.name, ev.xp);
        
        // Trigger HTML UI toast
        addToast(horse.name, horse.colors.saddle, ev.name, ev.xp);
      }
    }
  }
}

// Leveling calculations
const MAX_LEVEL = 30;

function xpForLevel(n: number): number {
  return 1.8 * n ** 3 + 18 * n ** 2 + 50 * n - 19.8;
}

function thresholdForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(xpForLevel(level - 1));
}

function levelFromXp(xp: number): number {
  const v = Math.max(0, Math.floor(xp));
  let level = 1;
  while (level < MAX_LEVEL && v >= thresholdForLevel(level + 1)) {
    level++;
  }
  return level;
}

interface LevelInfo {
  level: number;
  xp: number;
  level_start_xp: number;
  next_level_xp: number | null;
  xp_into_level: number;
  xp_for_level: number | null;
  progress: number;
}

function levelInfo(xp: number): LevelInfo {
  const v = Math.max(0, Math.floor(xp));
  const level = levelFromXp(v);
  const level_start_xp = thresholdForLevel(level);
  const isMax = level >= MAX_LEVEL;
  const next_level_xp = isMax ? null : thresholdForLevel(level + 1);
  const xp_into_level = v - level_start_xp;
  const xp_for_level = isMax ? null : (next_level_xp! - level_start_xp);
  const progress = isMax ? 1 : Math.min(1, xp_into_level / Math.max(1, xp_for_level!));
  return { level, xp: v, level_start_xp, next_level_xp, xp_into_level, xp_for_level, progress };
}

const XP_AWARDS = {
  compete: 25,
  podium: 25,
  runner_up: 15,
  winner: 30,
  token_bonus_max: 15,
};

function xpForRaceResult(rank: number): number {
  let xp = XP_AWARDS.compete;
  if (rank <= 3) xp += XP_AWARDS.podium;
  if (rank === 2) xp += XP_AWARDS.runner_up;
  if (rank === 1) xp += XP_AWARDS.winner;
  return xp;
}

function xpForTokenBonus(rank: number, tokens: number, winner_tokens: number): number {
  if (rank === 1) return XP_AWARDS.token_bonus_max;
  if (winner_tokens <= 0) return 0;
  const ratio = Math.max(0, tokens) / winner_tokens;
  return Math.round(Math.min(1, ratio) * XP_AWARDS.token_bonus_max);
}

function xpForRaceFinish(rank: number, tokens: number, winner_tokens: number, live_xp: number = 0): number {
  return xpForRaceResult(rank) + xpForTokenBonus(rank, tokens, winner_tokens) + live_xp;
}

// Confetti simulation
interface ConfettiParticle {
  x: number;
  y: number;
  r: number;
  d: number;
  color: string;
  tilt: number;
  tiltAngleIncremental: number;
  tiltAngle: number;
}

function startConfettiAnimation(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);
  
  const resizeHandler = () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', resizeHandler);
  
  const colors = ['#ffd166', '#7bed9f', '#a68bd8', '#ff6b6b', '#4db8ff', '#ffffff'];
  const particles: ConfettiParticle[] = [];
  const maxParticles = 120;
  
  for (let i = 0; i < maxParticles; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height - height,
      r: Math.random() * 6 + 4,
      d: Math.random() * 2 + 1,
      color: colors[i % colors.length],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.07 + 0.02,
      tiltAngle: Math.random() * Math.PI
    });
  }
  
  let animationId = 0;
  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    
    for (let i = 0; i < maxParticles; i++) {
      const p = particles[i];
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
      p.x += Math.sin(p.tiltAngle) * 0.5;
      p.tilt = Math.sin(p.tiltAngle - i / 3) * 15;
      
      ctx.beginPath();
      ctx.lineWidth = p.r / 2;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      ctx.stroke();
      
      // Recycle particle if it falls off screen
      if (p.y > height) {
        particles[i] = {
          x: Math.random() * width,
          y: -20,
          r: p.r,
          d: p.d,
          color: p.color,
          tilt: Math.random() * 10 - 5,
          tiltAngleIncremental: p.tiltAngleIncremental,
          tiltAngle: p.tiltAngle
        };
      }
    }
    
    animationId = requestAnimationFrame(draw);
  };
  
  draw();
  
  return () => {
    cancelAnimationFrame(animationId);
    window.removeEventListener('resize', resizeHandler);
  };
}

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

// 3D Podium Previews
interface PodiumPreview {
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  horse: Horse;
  clock: THREE.Clock;
  animationFrameId: number;
}
const activePreviews: Record<string, PodiumPreview> = {};

function initPreview(canvas: HTMLCanvasElement, position: string, colors: HorseColors) {
  const scene = new THREE.Scene();
  
  // Set up camera
  const camera = new THREE.PerspectiveCamera(38, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.set(-0.2, 1.35, 4.6); // look slightly down from front-left iso, adjusted for 50% scale horse
  camera.lookAt(0.3, 1.1, 0);

  // Set up renderer
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true
  });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Add lights
  const ambient = new THREE.AmbientLight(0xffffff, 1.8);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0xffeedd, 1.2);
  fillLight.position.set(-5, 2, -2);
  scene.add(fillLight);

  // Instantiate 3D Horse
  const horse = new Horse({
    color: 0xffffff,
    index: position === 'first' ? 0 : position === 'second' ? 1 : 2,
    initialProgress: 0,
    speed: 0.02,
    laneOffset: 0,
    name: `podium-${position}`,
    colors: colors
  });
  horse.group.scale.multiplyScalar(0.5); // Reduce horse model scale by 50% but keep viewport same
  scene.add(horse.group);

  const clock = new THREE.Clock();
  let animationFrameId = 0;
  let previewRotation = -Math.PI / 2;

  const animate = () => {
    const delta = Math.min(clock.getDelta(), 0.033);
    
    // Animate the horse running/galloping in place
    horse.updatePreview(delta, 0.02);
    
    // Rotate horse slowly in place for 3D inspection (applied after updatePreview sets it)
    previewRotation += delta * 0.45;
    horse.group.rotation.y = previewRotation;
    
    renderer.render(scene, camera);
    animationFrameId = requestAnimationFrame(animate);
  };
  
  animate();

  activePreviews[position] = {
    canvas,
    scene,
    camera,
    renderer,
    horse,
    clock,
    animationFrameId
  };
}

function cleanupPreview(position: string) {
  const prev = activePreviews[position];
  if (!prev) return;

  cancelAnimationFrame(prev.animationFrameId);
  prev.renderer.dispose();
  
  // Dispose scene nodes
  prev.scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });

  delete activePreviews[position];
}

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function setPodiumCanvasRef(el: Element | ComponentPublicInstance | null, position: string, colors: HorseColors) {
  if (!el) {
    cleanupPreview(position);
    return;
  }
  if (!(el instanceof HTMLCanvasElement)) {
    return;
  }
  if (activePreviews[position]) {
    return; // Already initialized
  }
  setTimeout(() => {
    if (el) {
      initPreview(el, position, colors);
    }
  }, 50);
}

function getPodiumColor(position: string) {
  if (position === 'first') return '#e7d17c';
  if (position === 'second') return '#b0b5bc';
  return '#cd7f32';
}

function getPillarNumber(position: string) {
  if (position === 'first') return '1';
  if (position === 'second') return '2';
  return '3';
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

function setHorseCamMode(mode: 'free' | 'follow' | 'jockey') {
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
  derbyScene.onCameraModeUpdate = (mode: string) => {
    sceneCamMode.value = mode;
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

  // Wire API update listeners
  let prevStatus = '';
  raceClient.onRaceUpdate = (race) => {
    const isNewFinish = race.status === 'finished' && prevStatus !== 'finished';
    prevStatus = race.status;

    joinedRace.value = race;
    timeLeftSeconds.value = race.time_left_seconds;
    derbyScene?.updateLiveRace(race);
    isPolling.value = false;
    processAchievements(race);

    if (isNewFinish) {
      triggerFinishedConfetti();
    }
  };

  raceClient.onRaceError = (err) => {
    errorMessage.value = 'Connection error: ' + err.message;
    isPolling.value = false;
  };

  derbyScene.start();

  countdownInterval = window.setInterval(() => {
    if (joinedRace.value && joinedRace.value.status === 'live') {
      if (timeLeftSeconds.value > 0) {
        timeLeftSeconds.value--;
      }
    }
  }, 1000);
});

onBeforeUnmount(() => {
  raceClient.stopPolling();
  if (countdownInterval !== null) {
    window.clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (cleanConfetti) {
    cleanConfetti();
    cleanConfetti = null;
  }
  cleanupPreview('first');
  cleanupPreview('second');
  cleanupPreview('third');
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
      timeLeftSeconds.value = initialRace.time_left_seconds;
      derbyScene?.updateLiveRace(initialRace);
      
      // Seed watermark with existing events when joining so we don't spam historical alerts
      for (const horse of initialRace.horses) {
        if (horse.recent_events && horse.recent_events.length > 0) {
          const maxAt = Math.max(...horse.recent_events.map(e => e.at));
          lastSeenEventTimes.set(horse.horse_id, maxAt);
        }
      }
      
      raceClient.startPolling(2000);

      if (initialRace.status === 'finished') {
        triggerFinishedConfetti();
      }
    } else {
      errorMessage.value = 'Race not found.';
      isPolling.value = false;
    }
  } catch (err: unknown) {
    errorMessage.value = getErrorMessage(err, 'Error connecting to race server.');
    isPolling.value = false;
  }
}

function leaveRace() {
  raceClient.stopPolling();
  joinedRace.value = null;
  timeLeftSeconds.value = 0;
  isPolling.value = false;
  errorMessage.value = '';
  lastSeenEventTimes.clear();
  activeToasts.value = [];
  showFinishedOverlay.value = false;
  if (cleanConfetti) {
    cleanConfetti();
    cleanConfetti = null;
  }
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

const podiumHorses = computed(() => {
  if (!joinedRace.value) return [];
  const sorted = [...joinedRace.value.horses].sort((a, b) => a.rank - b.rank);
  const winnerTokens = sorted[0]?.current_tokens ?? 0;
  
  return sorted.map(h => {
    const liveXp = h.live_xp || 0;
    const xpBefore = h.xp;
    const xpAwarded = xpForRaceFinish(h.rank, h.current_tokens, winnerTokens, liveXp);
    const xpAfter = xpBefore + xpAwarded;
    const beforeInfo = levelInfo(xpBefore);
    const afterInfo = levelInfo(xpAfter);
    const levelledUp = afterInfo.level > beforeInfo.level;
    
    return {
      ...h,
      xpAwarded,
      xpBefore,
      xpAfter,
      beforeInfo,
      afterInfo,
      levelledUp
    };
  });
});

const visualPodium = computed(() => {
  const horses = podiumHorses.value;
  if (horses.length === 0) return [];
  const first = horses[0];
  const second = horses[1] || null;
  const third = horses[2] || null;
  
  const result = [];
  if (second) result.push({ position: 'second', data: second, badge: '🥈', label: '2nd' });
  if (first) result.push({ position: 'first', data: first, badge: '🥇', label: '1st' });
  if (third) result.push({ position: 'third', data: third, badge: '🥉', label: '3rd' });
  return result;
});

function formatTimeLeft(seconds: number) {
  if (seconds <= 0) return '00:00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
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
