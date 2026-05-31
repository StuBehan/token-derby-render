# Future Features Roadmap - Token Derby Render

This document outlines the implementation plan and design blueprints for upcoming features to link the 3D visual engine with real-world atmospheric conditions in London.

---

## 1. Real-Time London Weather via Open-Meteo API

Currently, the weather system allows manual selection of presets (`light_cloud`, `very_cloudy`, `rainy`, `storm`). The goal is to dynamically fetch real-time weather observations for London and apply the matching visual state.

### Technical Blueprint
* **API Endpoint**: Open-Meteo Current Weather API (Free, no key required).
  * **URL**: `https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current=weather_code`
* **WMO Weather Code Mapping**:
  The API returns a `weather_code` (WMO Code). We will map these integers to our custom `WeatherType` keys:

| WMO Weather Code | Description | Visual Weather Preset (`WeatherType`) |
| :--- | :--- | :--- |
| `0`, `1` | Clear sky, Mainly clear | `light_cloud` (Day/Sunny lighting) |
| `2`, `3` | Partly cloudy, Overcast | `very_cloudy` (Diffused sky fog) |
| `45`, `48` | Fog, Depositing rime fog | `very_cloudy` (High fog density) |
| `51`, `53`, `55`, `61`, `63` | Drizzle, Light/Moderate rain | `rainy` (Gentle rain GPU particles) |
| `65`, `80`, `81`, `82` | Heavy rain, Rain showers | `rainy` (Heavy rain density) |
| `71`, `73`, `75`, `77`, `85`, `86` | Snowfall, Snow showers | `rainy` / `very_cloudy` (Cold fog) |
| `95`, `96`, `99` | Thunderstorm, Hail | `storm` (Lightning & heavy rain) |

### Implementation Snippet
Create a utility service `src/engine/WeatherService.ts`:
```typescript
import type { WeatherType } from './Weather';

export async function fetchLondonWeather(): Promise<WeatherType> {
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current=weather_code'
    );
    if (!res.ok) throw new Error('Failed to fetch weather data');
    const data = await res.json();
    const code = data?.current?.weather_code;
    
    if (typeof code !== 'number') return 'light_cloud';
    
    // Map WMO codes
    if (code === 0 || code === 1) return 'light_cloud';
    if (code === 2 || code === 3 || code === 45 || code === 48) return 'very_cloudy';
    if (code >= 51 && code <= 86) return 'rainy';
    if (code >= 95 && code <= 99) return 'storm';
    
    return 'light_cloud';
  } catch (error) {
    console.error('Weather service error, falling back to light_cloud:', error);
    return 'light_cloud';
  }
}
```

---

## 2. Dynamic Time of Day from London Sunrise & Sunset

Currently, the day-night cycle starts at noon (`12.0`) and advances 1 full cycle every 120 seconds. We want to align the starting time of day to match London's actual sunrise, sunset, and current local time.

### Technical Blueprint
* **API Endpoint**: Open-Meteo Daily Astronomy API.
  * **URL**: `https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&daily=sunrise,sunset&timezone=Europe%2FLondon&forecast_days=1`
* **Response Details**: Returns exact ISO timestamps for today's sunrise and sunset (e.g., `2026-05-31T04:51` and `2026-05-31T21:08`).
* **Daylight Mapping Math**:
  1. Parse current London time, sunrise time, and sunset time to determine hours of the day (0.0 to 24.0 decimal format).
  2. Set `timeOfDay` to London's current local hour.
  3. Customize weather preset interpolation bounds:
     * Dawn transition starts 30 minutes before sunrise.
     * Sunset transition starts 30 minutes before sunset.

### Implementation Snippet
Add sunrise/sunset calculation to `src/engine/WeatherService.ts`:
```typescript
export interface DaylightTimes {
  currentHour: number;
  sunriseHour: number;
  sunsetHour: number;
}

export async function fetchLondonDaylight(): Promise<DaylightTimes> {
  const fallback = { currentHour: 12.0, sunriseHour: 6.0, sunsetHour: 18.0 };
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&daily=sunrise,sunset&timezone=Europe%2FLondon&forecast_days=1'
    );
    if (!res.ok) throw new Error('Failed to fetch daylight coordinates');
    const data = await res.json();
    
    const sunriseStr = data?.daily?.sunrise?.[0];
    const sunsetStr = data?.daily?.sunset?.[0];
    if (!sunriseStr || !sunsetStr) return fallback;

    const now = new Date();
    const sunrise = new Date(sunriseStr);
    const sunset = new Date(sunsetStr);

    const getDecimalHours = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;

    return {
      currentHour: getDecimalHours(now),
      sunriseHour: getDecimalHours(sunrise),
      sunsetHour: getDecimalHours(sunset),
    };
  } catch (error) {
    console.error('Daylight service error, using default solar hours:', error);
    return fallback;
  }
}
```

---

## 3. Integration Plan in App.vue

Upon launching or joining a watch race:
1. Call `fetchLondonWeather()` and update the scene using `derbyScene.setWeather(fetchedWeather)`.
2. Call `fetchLondonDaylight()` and set:
   * `timeOfDayRef.value = currentHour`
   * `derbyScene.setTimeOfDay(currentHour)`
3. Pass `sunriseHour` and `sunsetHour` parameters to the `WeatherManager` to calibrate dynamic light-cone activations and sky shader color ramp keyframes.
