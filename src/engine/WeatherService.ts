import type { WeatherType } from './Weather';
import type { LocationWeatherConfig } from './locations/Location';

export interface DaylightTimes {
  currentHour: number;
  sunriseHour: number;
  sunsetHour: number;
}

export async function fetchWeather(location: LocationWeatherConfig): Promise<WeatherType> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=weather_code`
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

export async function fetchDaylight(location: LocationWeatherConfig): Promise<DaylightTimes> {
  const now = new Date();
  // Get decimal local hour as fallback
  const fallbackHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const fallback = { currentHour: fallbackHour, sunriseHour: 6.0, sunsetHour: 18.0 };
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&daily=sunrise,sunset&timezone=${encodeURIComponent(location.timezone)}&forecast_days=1`
    );
    if (!res.ok) throw new Error('Failed to fetch daylight coordinates');
    const data = await res.json();

    const sunriseStr = data?.daily?.sunrise?.[0];
    const sunsetStr = data?.daily?.sunset?.[0];
    if (!sunriseStr || !sunsetStr) return fallback;

    const sunrise = new Date(sunriseStr);
    const sunset = new Date(sunsetStr);

    const getDecimalHours = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;

    // Use current decimal hours based on the location's local time
    const locationTimeStr = now.toLocaleString('en-US', { timeZone: location.timezone });
    const locationDate = new Date(locationTimeStr);

    return {
      currentHour: getDecimalHours(locationDate),
      sunriseHour: getDecimalHours(sunrise),
      sunsetHour: getDecimalHours(sunset),
    };
  } catch (error) {
    console.error('Daylight service error, using default solar hours:', error);
    return fallback;
  }
}
