import { ref } from 'vue';
import type { RaceView } from '../engine/RaceClient';

export interface ActiveToast {
  id: string;
  horseName: string;
  colorHex: string;
  achievementName: string;
  description: string;
  xp: number;
}

const ACHIEVEMENT_DESCRIPTIONS: Record<string, string> = {
  'Racer!': 'Raced continuously for an hour',
  'Overtake!': 'Overtook another horse',
  'Pacesetter!': 'Led the race for an hour straight',
  'Stampede!': 'Gained 7,000+ tokens in a single minute',
  'Took the lead!': 'Charged into first place',
  'Comeback!': 'Climbed from last place to the top half',
  'Pulled Away!': 'Grew the lead by 5,000+ tokens in a minute',
};

export function getAchievementDescription(name: string, xp: number): string {
  if (name === 'Overtake!') {
    const climbed = Math.floor(xp / 3);
    if (climbed <= 1) return 'Overtook another horse';
    return `Overtook ${climbed} horses`;
  }
  return ACHIEVEMENT_DESCRIPTIONS[name] || 'Gained an achievement';
}

export function useAchievementToasts() {
  const activeToasts = ref<ActiveToast[]>([]);
  const lastSeenEventTimes = new Map<string, number>();
  let toastIdCounter = 0;

  function addToast(horseName: string, colorHex: string, achievementName: string, xp: number) {
    const id = `toast-${toastIdCounter++}`;
    activeToasts.value.push({
      id,
      horseName,
      colorHex,
      achievementName,
      description: getAchievementDescription(achievementName, xp),
      xp,
    });

    window.setTimeout(() => {
      activeToasts.value = activeToasts.value.filter((toast) => toast.id !== id);
    }, 6000);
  }

  function seedFromRace(race: RaceView) {
    race.horses.forEach((horse) => {
      if (!horse.recent_events || horse.recent_events.length === 0) return;

      const maxAt = Math.max(...horse.recent_events.map((event) => event.at));
      lastSeenEventTimes.set(horse.horse_id, maxAt);
    });
  }

  function processRace(race: RaceView, onAchievement: (horseName: string, colorHex: string, name: string, xp: number) => void) {
    race.horses.forEach((horse) => {
      if (!horse.recent_events) return;

      const watermark = lastSeenEventTimes.get(horse.horse_id) ?? 0;
      const freshEvents = horse.recent_events.filter((event) => event.at > watermark);
      if (freshEvents.length === 0) return;

      const maxAt = Math.max(...freshEvents.map((event) => event.at));
      lastSeenEventTimes.set(horse.horse_id, maxAt);

      freshEvents.forEach((event) => {
        onAchievement(horse.name, horse.colors.saddle, event.name, event.xp);
        addToast(horse.name, horse.colors.saddle, event.name, event.xp);
      });
    });
  }

  function clear() {
    lastSeenEventTimes.clear();
    activeToasts.value = [];
  }

  return {
    activeToasts,
    seedFromRace,
    processRace,
    clear,
  };
}
