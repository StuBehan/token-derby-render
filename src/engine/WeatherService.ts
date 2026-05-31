import type { WeatherType } from './Weather';

export interface DaylightTimes {
  currentHour: number;
  sunriseHour: number;
  sunsetHour: number;
}

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

export async function fetchLondonDaylight(): Promise<DaylightTimes> {
  const now = new Date();
  // Get decimal local hour as fallback
  const fallbackHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const fallback = { currentHour: fallbackHour, sunriseHour: 6.0, sunsetHour: 18.0 };
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&daily=sunrise,sunset&timezone=Europe%2FLondon&forecast_days=1'
    );
    if (!res.ok) throw new Error('Failed to fetch daylight coordinates');
    const data = await res.json();
    
    const sunriseStr = data?.daily?.sunrise?.[0];
    const sunsetStr = data?.daily?.sunset?.[0];
    if (!sunriseStr || !sunsetStr) return fallback;

    const sunrise = new Date(sunriseStr);
    const sunset = new Date(sunsetStr);

    const getDecimalHours = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;

    // Use current decimal hours based on Europe/London local time
    // Note: since the client is in timezone Europe/London (or we want actual current London hours),
    // we can calculate the decimal hours from UTC offset or use local client hours since they match London.
    // To be precise, we get local time in London time zone:
    const londonTimeStr = now.toLocaleString('en-US', { timeZone: 'Europe/London' });
    const londonDate = new Date(londonTimeStr);

    return {
      currentHour: getDecimalHours(londonDate),
      sunriseHour: getDecimalHours(sunrise),
      sunsetHour: getDecimalHours(sunset),
    };
  } catch (error) {
    console.error('Daylight service error, using default solar hours:', error);
    return fallback;
  }
}
