import * as THREE from 'three';
import { IndoreSkyline } from './IndoreSkyline';
import { IndoreHaveli } from './IndoreHaveli';
import { createTexturedMaterial } from '../../Textures';
import type { Location } from '../Location';

const plasterMaterials = [0x7fa8c9, 0xd9a441, 0xc16b4a, 0xe8dfc8, 0x7a9b6e].map(
  (color) => createTexturedMaterial('concrete', color, 4, 5, { roughness: 0.88 }),
);

export const indoreLocation: Location = {
  id: 'indore',
  label: 'Indore',
  weather: {
    latitude: 22.7196,
    longitude: 75.8577,
    timezone: 'Asia/Kolkata',
  },
  terrain: {
    grassColor: 0xa89660, // Sun-baked tan-khaki grass, dry semi-arid Madhya Pradesh climate
    infieldColor: 0x8a9c52, // Maintained track infield reads slightly greener than the surrounding dry grass
    hillColor: 0xa08b5c,
    farHillColor: 0xc4b48c, // Dusty, hazy far hills
    canopyColors: [0x707a3a, 0x8a9450, 0xb0692e], // Dusty green foliage plus a flame-tree (gulmohar) orange-red accent
    treeStyle: 'indian',
  },
  createLandmarks: () => new IndoreSkyline(),
  buildHorizonBuilding: (position: THREE.Vector3, index: number, rotationY: number) =>
    new IndoreHaveli(position, { index, plasterMaterials, rotationY }).group,
};
