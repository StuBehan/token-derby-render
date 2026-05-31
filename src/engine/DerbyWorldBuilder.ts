import * as THREE from 'three';
import { CloudSystem } from './CloudSystem';
import { Floodlights } from './Floodlights';
import { Grandstand } from './Grandstand';
import { LondonSkyline } from './LondonSkyline';
import { StreetLight } from './StreetLight';
import { addGroundSurfaces } from './GroundBuilder';
import { addLondonParkDetails } from './ParkDetailsBuilder';
import { addParkTerrain } from './ParkTerrainBuilder';
import { createFinishLine } from './FinishLineBuilder';
import { createSceneLights } from './SceneLighting';
import { createSkyDome } from './SkyDome';
import { addTrackRails, addTrackSurface } from './TrackBuilder';
import { TRACK_OUTER_RADIUS, TRACK_STRAIGHT_HALF_LENGTH } from './TrackLayout';

export interface DerbyWorld {
  skyline: LondonSkyline;
  floodlights: Floodlights;
  grandstand: Grandstand;
  skyMaterial: THREE.ShaderMaterial;
  skyMesh: THREE.Mesh;
  ambientLight: THREE.HemisphereLight;
  sunLight: THREE.DirectionalLight;
  fog: THREE.Fog;
}

export function buildDerbyWorld(
  scene: THREE.Scene,
  cloudSystem: CloudSystem,
  streetLights: StreetLight[],
): DerbyWorld {
  scene.background = new THREE.Color(0xb8c4c8);
  scene.fog = new THREE.Fog(0xb8c4c8, 105, 245);

  const lights = createSceneLights(scene);
  const skyDome = createSkyDome();
  scene.add(skyDome.mesh);
  addParkTerrain(scene);

  const skyline = new LondonSkyline();
  skyline.name = 'skyline';
  scene.add(skyline);

  cloudSystem.addClouds();
  addGroundSurfaces(scene);
  addLondonParkDetails(scene, streetLights);
  addTrackSurface(scene);
  addTrackRails(scene);

  const floodlights = new Floodlights({
    trackStraightHalfLength: TRACK_STRAIGHT_HALF_LENGTH,
    trackOuterRadius: TRACK_OUTER_RADIUS,
  });
  floodlights.name = 'floodlights';
  scene.add(floodlights);

  const grandstand = new Grandstand();
  grandstand.name = 'grandstand';
  scene.add(grandstand);

  scene.add(createFinishLine());

  return {
    skyline,
    floodlights,
    grandstand,
    skyMaterial: skyDome.material,
    skyMesh: skyDome.mesh,
    ambientLight: lights.ambientLight,
    sunLight: lights.sunLight,
    fog: scene.fog as THREE.Fog,
  };
}
