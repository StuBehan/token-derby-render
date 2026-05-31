import * as THREE from 'three';
import { Horse } from './Horse';
import { RaceView } from './RaceClient';
import { TRACK_LANE_COUNT, getLaneCenterOffset, getDynamicLaneOffset } from './TrackLayout';

const HORSE_LOOK_AHEAD_PROGRESS = 0.035;
const HORSE_SIDE_BY_SIDE_PROGRESS = 0.015;
const HORSE_SIDE_BY_SIDE_MIN_LANE_DIFF = 1.33;
const HORSE_OVERTAKE_LANE_STEP = 2.0;

export function updateHorseLaneTargets(
  horses: Horse[],
  liveRace: RaceView | null,
  totalLaps: number,
) {
  const railLaneOffset = getLaneCenterOffset(0);
  const outsideLaneOffset = getLaneCenterOffset(TRACK_LANE_COUNT - 1);

  horses.forEach((horseA) => {
    let targetOffset = railLaneOffset;
    const shouldBeInStartingLane = liveRace
      ? (liveRace.status === 'pending' || horseA.cumulativeProgress >= totalLaps - 0.15 || liveRace.status === 'finished')
      : false;

    if (shouldBeInStartingLane) {
      targetOffset = getDynamicLaneOffset(horseA.index, horses.length);
    } else {
      horses.forEach((horseB) => {
        if (horseA === horseB) return;

        let diff = horseB.progress - horseA.progress;
        diff -= Math.round(diff);

        const isAhead = diff > 0 && diff <= HORSE_LOOK_AHEAD_PROGRESS;
        const isSideBySideInside =
          diff >= -HORSE_SIDE_BY_SIDE_PROGRESS &&
          diff <= 0 &&
          horseB.laneOffset > horseA.laneOffset + HORSE_SIDE_BY_SIDE_MIN_LANE_DIFF;

        if (!isAhead && !isSideBySideInside) return;

        if (isAhead) {
          if (horseA.speed <= horseB.speed) return;

          const isBInsideOrSameLane = horseB.laneOffset > horseA.laneOffset - 1.33;
          if (!isBInsideOrSameLane) return;
        }

        targetOffset = Math.min(targetOffset, horseB.laneOffset - HORSE_OVERTAKE_LANE_STEP);
      });
    }

    horseA.targetLaneOffset = THREE.MathUtils.clamp(targetOffset, outsideLaneOffset, railLaneOffset);
  });
}
