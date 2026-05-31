import { Horse } from './Horse';
import { RaceView } from './RaceClient';
import { WeatherType } from './Weather';

const DEFAULT_HORSE_NAMES = [
  'Glinting Gold',
  'Blue Bullet',
  'Crimson Comet',
  'Green Gale',
  'Purple Pegasus',
  'Orange Outlaw',
];

export class GrandstandScoreboardText {
  private readonly sortedHorses: Horse[] = [];

  build(
    horses: Horse[],
    timeOfDay: number,
    weather: WeatherType,
    liveRace: RaceView | null,
  ) {
    this.sortedHorses.length = 0;
    for (let i = 0; i < horses.length; i += 1) {
      this.sortedHorses.push(horses[i]);
    }
    this.sortedHorses.sort((a, b) => b.cumulativeProgress - a.cumulativeProgress);

    const leader = this.sortedHorses[0];
    const runnerUp = this.sortedHorses[1];
    const leaderName = leader ? this.getHorseName(leader.index) : 'NONE';
    const runnerUpName = runnerUp ? this.getHorseName(runnerUp.index) : 'NONE';

    if (liveRace) {
      const statusStr = liveRace.status.toUpperCase();
      return `  • RACE: ${liveRace.name.toUpperCase()}  • JOIN CODE: ${liveRace.join_code}  • STATUS: ${statusStr}  • LEADER: ${leaderName.toUpperCase()}  • 2ND: ${runnerUpName.toUpperCase()}  `;
    }

    const hours = Math.floor(timeOfDay);
    const minutes = Math.floor((timeOfDay % 1) * 60);
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    const leaderLane = leader ? leader.index + 1 : '-';
    const runnerUpLane = runnerUp ? runnerUp.index + 1 : '-';

    return `  • LEADER: ${leaderName.toUpperCase()} (LANE ${leaderLane})  • 2ND: ${runnerUpName.toUpperCase()} (LANE ${runnerUpLane})  • TIME: ${timeStr}  • WEATHER: ${weather.replace('_', ' ').toUpperCase()}  `;
  }

  private getHorseName(index: number) {
    return DEFAULT_HORSE_NAMES[index % DEFAULT_HORSE_NAMES.length];
  }
}
