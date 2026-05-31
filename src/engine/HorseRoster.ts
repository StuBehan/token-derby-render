import * as THREE from 'three';
import { Horse } from './Horse';
import { getLaneCenterOffset, getDynamicLaneOffset } from './TrackLayout';

const DEMO_HORSE_COLORS = [0x3b2217, 0x5b3522, 0xc08a52, 0x191615, 0x7b5739, 0xefe2c8];

export class HorseRoster {
  public readonly horses: Horse[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  addDemoHorses() {
    DEMO_HORSE_COLORS.forEach((color, index) => {
      const horse = new Horse({
        color,
        index,
        initialProgress: 0.02 - index * 0.004,
        speed: randomDemoSpeed(),
        laneOffset: getDynamicLaneOffset(index, DEMO_HORSE_COLORS.length),
      });
      this.horses.push(horse);
      this.scene.add(horse.group);
    });
  }

  resetDemoHorses() {
    this.horses.forEach((horse) => {
      horse.reset();
      horse.speed = randomDemoSpeed();
    });
  }

  clear() {
    this.horses.forEach((horse) => {
      this.scene.remove(horse.group);
    });
    this.horses.length = 0;
  }
}

function randomDemoSpeed() {
  return 0.018 + Math.random() * 0.006;
}
