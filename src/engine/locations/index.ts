import { londonLocation } from './london';
import type { Location } from './Location';

export type { Location, LandmarkSet, LocationWeatherConfig } from './Location';

export const locations: Location[] = [londonLocation];

export const defaultLocation: Location = londonLocation;

export function getLocationById(id: string): Location {
  return locations.find((location) => location.id === id) ?? defaultLocation;
}
