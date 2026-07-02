import * as THREE from 'three';
import { LondonSkyline } from '../LondonSkyline';
import { TerraceHouse } from '../TerraceHouse';
import { getSurfaceTexture } from '../Textures';
import type { Location } from './Location';

const brickMaterials = [0x8d7462, 0x9a7d68, 0x74675d, 0x92705e].map(
  (color) => new THREE.MeshStandardMaterial({
    color,
    map: getSurfaceTexture('brick', 4, 5),
    roughness: 0.86,
  }),
);

export const londonLocation: Location = {
  id: 'london',
  label: 'London',
  weather: {
    latitude: 51.5074,
    longitude: -0.1278,
    timezone: 'Europe/London',
  },
  terrain: {
    grassColor: 0x4f7b3f,
    infieldColor: 0x6d934a,
    hillColor: 0x637854,
    farHillColor: 0x819071,
    canopyColors: [0x2f4a2e, 0x41643a, 0x5d7446],
    treeStyle: 'temperate',
  },
  createLandmarks: () => new LondonSkyline(),
  buildHorizonBuilding: (position, index, rotationY) =>
    new TerraceHouse(position, { index, brickMaterials, rotationY }).group,
};
