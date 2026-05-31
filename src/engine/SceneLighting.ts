import * as THREE from 'three';
import { Floodlights } from './Floodlights';
import { StreetLight } from './StreetLight';
import { WeatherType } from './Weather';

export interface SceneLights {
  ambientLight: THREE.HemisphereLight;
  sunLight: THREE.DirectionalLight;
}

export function createSceneLights(scene: THREE.Scene): SceneLights {
  const sunLight = new THREE.DirectionalLight(0xfff6dc, 2.6);
  sunLight.position.set(-35, 62, 34);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 140;
  sunLight.shadow.camera.left = -80;
  sunLight.shadow.camera.right = 80;
  sunLight.shadow.camera.top = 80;
  sunLight.shadow.camera.bottom = -80;
  scene.add(sunLight);

  const ambientLight = new THREE.HemisphereLight(0xddefff, 0x485238, 1.8);
  scene.add(ambientLight);

  return { ambientLight, sunLight };
}

export function setScenePracticalLightsEnabled(
  timeOfDay: number,
  weatherType: WeatherType,
  floodlights: Floodlights | undefined,
  streetLights: StreetLight[],
) {
  const isNightOrSunset = timeOfDay >= 17.0 || timeOfDay < 7.5;
  const lightsOn = weatherType === 'rainy' || weatherType === 'storm' || isNightOrSunset;

  floodlights?.setLightsEnabled(lightsOn);
  streetLights.forEach((light) => light.setLightEnabled(lightsOn));
}
