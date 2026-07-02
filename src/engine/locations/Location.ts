import * as THREE from 'three';

export interface LocationWeatherConfig {
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface LandmarkSet extends THREE.Object3D {
  update(delta: number, running: boolean): void;
}

export interface Location {
  id: string;
  label: string;
  weather: LocationWeatherConfig;
  createLandmarks(): LandmarkSet;
  buildHorizonBuilding(position: THREE.Vector3, index: number, rotationY: number): THREE.Object3D;
}
