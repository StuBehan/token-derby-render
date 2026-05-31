import * as THREE from 'three';
import type { Horse } from './Horse';
import type { Grandstand } from './Grandstand';
import type { StreetLight } from './StreetLight';
import type { LondonSkyline } from './LondonSkyline';
import type { Floodlights } from './Floodlights';
import type { WeatherType } from './Weather';
import type { RaceView, HorseView } from './RaceClient';
import { disposeSceneResources } from './SceneDisposer';
import { PerfOverlay } from './PerfOverlay';
import { applyRendererPerformanceSettings } from './RendererPerformance';
import { AchievementEffects } from './AchievementEffects';
import { GrandstandScoreboardText } from './GrandstandScoreboardText';
import { CameraController, type RequestedCameraMode, type HorseCameraMode } from './CameraController';
import { RaceSyncController } from './RaceSyncController';
import { DustParticleSystem } from './DustParticleSystem';
import { HorsePicker } from './HorsePicker';
import { CloudSystem } from './CloudSystem';
import { setScenePracticalLightsEnabled } from './SceneLighting';
import { getSelectedHorseScreenPosition } from './SelectedHorseScreenPosition';
import { DerbyInputBindings } from './DerbyInputBindings';
import { HorseRoster } from './HorseRoster';
import { buildDerbyWorld } from './DerbyWorldBuilder';
import { DerbyWeatherSystem } from './DerbyWeatherSystem';
import { RaceStatusCameraDirector } from './RaceStatusCameraDirector';
import { updateRaceHorses } from './HorseRaceAnimator';
import { createTrackCurve } from './TrackLayout';

export class DerbyScene {
  private readonly host: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly clock = new THREE.Clock();
  private readonly trackCurve: THREE.CatmullRomCurve3;
  private readonly horseRoster = new HorseRoster(this.scene);
  private readonly horses = this.horseRoster.horses;
  private readonly achievementEffects = new AchievementEffects();
  
  // Skyline and weather components
  private skyline!: LondonSkyline;
  private floodlights!: Floodlights;
  private grandstand!: Grandstand;
  private readonly weather = new DerbyWeatherSystem();
  public selectedHorse: Horse | null = null;
  public onTimeUpdate?: (time: number) => void;
  public onHorseSelected?: (horse: Horse | null) => void;
  public onHorsePositionUpdate?: (pos: { x: number; y: number; isBehind: boolean } | null) => void;
  public onCameraLockUpdate?: (locked: boolean) => void;
  private lastSentCameraLock = false;
  private readonly horsePicker: HorsePicker;
  
  private sunLight?: THREE.DirectionalLight;

  private readonly cloudSystem: CloudSystem;
  private readonly dustParticles = new DustParticleSystem();
  private readonly streetLights: StreetLight[] = [];
  private readonly cameraController: CameraController;
  private readonly inputBindings: DerbyInputBindings;
  private readonly perfOverlay: PerfOverlay;
  private animationFrame = 0;
  private running = true;
  private readonly raceSync = new RaceSyncController();
  private readonly raceCameraDirector = new RaceStatusCameraDirector();
  private readonly scoreboardText = new GrandstandScoreboardText();
  private readonly scratchVec1 = new THREE.Vector3();
  private readonly resizeObserver: ResizeObserver;

  constructor(host: HTMLElement) {
    this.host = host;
    this.trackCurve = createTrackCurve();
    this.cameraController = new CameraController(this.camera, this.trackCurve);
    this.cloudSystem = new CloudSystem(this.scene);

    applyRendererPerformanceSettings(this.renderer, host.clientWidth, this.sunLight);
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';
    this.perfOverlay = new PerfOverlay(host, this.renderer, this.scene, this.camera);
    this.horsePicker = new HorsePicker(this.renderer.domElement, this.camera, this.horses);
    this.inputBindings = new DerbyInputBindings({
      domElement: this.renderer.domElement,
      cameraController: this.cameraController,
      horsePicker: this.horsePicker,
      perfOverlay: this.perfOverlay,
      getSelectedHorse: () => this.selectedHorse,
      selectHorse: (horse) => this.selectHorse(horse),
    });

    this.cameraController.update(0, { horses: this.horses, selectedHorse: this.selectedHorse, hasLiveRace: !!this.raceSync.liveRace });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);

    this.buildScene();
    this.resize();
  }

  start() {
    this.clock.start();
    this.tick();
  }

  setRunning(running: boolean) {
    this.running = running;
  }

  setWeather(type: WeatherType) {
    this.weather.setWeather(type);
  }

  setTimeOfDay(time: number) {
    this.weather.setTimeOfDay(time);
  }

  public setCameraMode(mode: RequestedCameraMode) {
    this.cameraController.setMode(mode, this.selectedHorse);
  }

  public setHorseCameraMode(mode: HorseCameraMode) {
    this.cameraController.setHorseMode(mode, this.selectedHorse);
  }

  public triggerTransitionToFree() {
    this.cameraController.setMode('free', this.selectedHorse);
  }

  reset() {
    this.running = true;
    this.setCameraMode('start_hold');
    this.cameraController.setSelectedHorseMode('free');
    if (this.selectedHorse) {
      this.selectedHorse = null;
      this.onHorseSelected?.(null);
    }
    if (this.raceSync.liveRace) {
      // In live race, reset doesn't make sense to randomize simulated speeds,
      // but we can re-sync.
      this.syncHorses(this.raceSync.liveRace.horses);
    } else {
      this.horseRoster.resetDemoHorses();
    }
  }

  updateLiveRace(race: RaceView) {
    this.raceSync.setRace(race);
    this.syncHorses(race.horses);

    const requestedMode = this.raceCameraDirector.getModeForRaceUpdate(race, this.cameraController.currentMode);
    if (requestedMode) {
      this.setCameraMode(requestedMode);
    }
  }

  clearLiveRace() {
    this.raceSync.clearRace();
    this.raceCameraDirector.reset();
    this.setCameraMode('start_hold');
    this.cameraController.setSelectedHorseMode('free');
    this.clearHorses();
    this.horseRoster.addDemoHorses();
  }

  public spawnAchievementEffect(horseName: string, colorHex: string, achievementName: string, xp: number = 3) {
    this.achievementEffects.spawn(this.horses, horseName, colorHex, achievementName, xp);
  }

  private clearHorses() {
    this.achievementEffects.clear();
    this.horseRoster.clear();

    // Reset selected horse to prevent tracking/UI errors on deleted horses
    if (this.selectedHorse) {
      this.selectedHorse = null;
      this.onHorseSelected?.(null);
    }
  }

  private syncHorses(apiHorses: HorseView[]) {
    this.raceSync.syncHorses(this.horses, this.scene, apiHorses, () => this.clearHorses());
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.inputBindings.dispose();
    
    this.weather.dispose();

    this.achievementEffects.clear();

    disposeSceneResources(this.scene);

    this.renderer.dispose();
    this.perfOverlay.dispose();
    this.renderer.domElement.remove();
  }

  private buildScene() {
    const world = buildDerbyWorld(this.scene, this.cloudSystem, this.streetLights);
    this.skyline = world.skyline;
    this.floodlights = world.floodlights;
    this.grandstand = world.grandstand;
    this.sunLight = world.sunLight;

    this.dustParticles.addToScene(this.scene);
    this.horseRoster.addDemoHorses();
    this.weather.init({
      scene: this.scene,
      skyMaterial: world.skyMaterial,
      ambientLight: world.ambientLight,
      sunLight: world.sunLight,
      fog: world.fog,
      configureClouds: this.cloudSystem.configure,
      skyMesh: world.skyMesh,
    });
  }

  private tick = () => {
    const delta = Math.min(this.clock.getDelta(), 0.033);

    const currentLock = this.isCameraLocked;
    if (currentLock !== this.lastSentCameraLock) {
      this.lastSentCameraLock = currentLock;
      this.onCameraLockUpdate?.(currentLock);
    }

    if (this.running) {
      updateRaceHorses({
        delta,
        horses: this.horses,
        trackCurve: this.trackCurve,
        raceSync: this.raceSync,
        currentCameraMode: this.cameraController.currentMode,
        running: this.running,
        dustParticles: this.dustParticles,
        setCameraMode: (mode) => this.setCameraMode(mode),
      });
      this.dustParticles.update(delta);
    }

    this.cameraController.update(delta, {
      horses: this.horses,
      selectedHorse: this.selectedHorse,
      hasLiveRace: !!this.raceSync.liveRace,
    });
    this.cloudSystem.update(delta, this.clock.getElapsedTime());
    this.weather.update(delta, this.running, this.onTimeUpdate);
    this.skyline.update(delta, this.running);

    setScenePracticalLightsEnabled(this.weather.timeOfDay, this.weather.type, this.floodlights, this.streetLights);

    this.achievementEffects.update(delta);

    if (this.grandstand) {
      const leaderText = this.scoreboardText.build(
        this.horses,
        this.weather.timeOfDay,
        this.weather.type,
        this.raceSync.liveRace,
      );
      this.grandstand.updateScoreboard(delta, leaderText);
    }

    this.renderer.render(this.scene, this.camera);
    this.perfOverlay.update(delta);

    this.onHorsePositionUpdate?.(getSelectedHorseScreenPosition(this.selectedHorse, this.camera, this.scratchVec1));

    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private selectHorse(horse: Horse | null) {
    this.selectedHorse = horse;
    this.onHorseSelected?.(horse);
  }

  private resize() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;

    if (width === 0 || height === 0) return;

    applyRendererPerformanceSettings(this.renderer, width, this.sunLight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  public get isCameraLocked(): boolean {
    return this.cameraController.isLocked;
  }

  public get selectedHorseCameraMode(): HorseCameraMode {
    return this.cameraController.selectedHorseMode;
  }
}
