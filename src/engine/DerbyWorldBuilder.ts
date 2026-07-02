import * as THREE from 'three';
import { CloudSystem } from './CloudSystem';
import { Floodlights } from './Floodlights';
import { Grandstand } from './Grandstand';
import { StreetLight } from './StreetLight';
import { addGroundSurfaces } from './GroundBuilder';
import { addParkDetails } from './ParkDetailsBuilder';
import { addParkTerrain } from './ParkTerrainBuilder';
import { createFinishLine } from './FinishLineBuilder';
import { createSceneLights } from './SceneLighting';
import { createSkyDome } from './SkyDome';
import { addTrackRails, addTrackSurface } from './TrackBuilder';
import { TRACK_OUTER_RADIUS, TRACK_STRAIGHT_HALF_LENGTH } from './TrackLayout';
import { defaultLocation, type Location, type LandmarkSet } from './locations';

export interface DerbyWorld {
  skyline: LandmarkSet;
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
  location: Location = defaultLocation,
): DerbyWorld {
  scene.background = new THREE.Color(0xb8c4c8);
  scene.fog = new THREE.Fog(0xb8c4c8, 105, 245);

  const lights = createSceneLights(scene);
  const skyDome = createSkyDome();
  scene.add(skyDome.mesh);
  addParkTerrain(scene);

  const skyline = location.createLandmarks();
  skyline.name = 'skyline';
  scene.add(skyline);

  cloudSystem.addClouds();
  addGroundSurfaces(scene);
  addParkDetails(scene, streetLights, location);
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
