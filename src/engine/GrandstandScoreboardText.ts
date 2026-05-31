import { Horse } from './Horse';
import { RaceView } from './RaceClient';
import { WeatherType } from './Weather';



export class GrandstandScoreboardText {
  private readonly sortedHorses: Horse[] = [];
  private favoriteHorseId: string | null = null;
  private previousHorseIds: string[] = [];

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
    const leaderName = leader ? leader.name : 'NONE';
    const runnerUpName = runnerUp ? runnerUp.name : 'NONE';

    if (liveRace) {
      if (liveRace.status === 'pending') {
        const currentHorseIds = liveRace.horses.map(h => h.horse_id);
        const hasNewJoin = currentHorseIds.some(id => !this.previousHorseIds.includes(id));
        const isFavoriteValid = this.favoriteHorseId && currentHorseIds.includes(this.favoriteHorseId);

        if (liveRace.horses.length > 0 && (hasNewJoin || !isFavoriteValid)) {
          const randomIndex = Math.floor(Math.random() * liveRace.horses.length);
          this.favoriteHorseId = liveRace.horses[randomIndex].horse_id;
        }

        this.previousHorseIds = currentHorseIds;

        const favoriteHorse = liveRace.horses.find(h => h.horse_id === this.favoriteHorseId);
        const favStr = favoriteHorse ? favoriteHorse.name.toUpperCase() : 'NONE';

        return `  • RACE: ${liveRace.name.toUpperCase()}  • JOIN CODE: ${liveRace.join_code}  • STATUS: AWAITING START  • FAVOURITE: ${favStr}  `;
      } else {
        this.favoriteHorseId = null;
        this.previousHorseIds = [];

        const statusStr = liveRace.status.toUpperCase();
        return `  • RACE: ${liveRace.name.toUpperCase()}  • JOIN CODE: ${liveRace.join_code}  • STATUS: ${statusStr}  • LEADER: ${leaderName.toUpperCase()}  • 2ND: ${runnerUpName.toUpperCase()}  `;
      }
    }

    const hours = Math.floor(timeOfDay);
    const minutes = Math.floor((timeOfDay % 1) * 60);
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    const leaderLane = leader ? leader.index + 1 : '-';
    const runnerUpLane = runnerUp ? runnerUp.index + 1 : '-';

    return `  • LEADER: ${leaderName.toUpperCase()} (LANE ${leaderLane})  • 2ND: ${runnerUpName.toUpperCase()} (LANE ${runnerUpLane})  • TIME: ${timeStr}  • WEATHER: ${weather.replace('_', ' ').toUpperCase()}  `;
  }
}
