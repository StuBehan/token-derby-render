import { LightningEffect, RainEffect, WeatherContext, WeatherManager, WeatherType } from './Weather';

type WeatherInitContext = Omit<WeatherContext, 'rainEffect' | 'lightningEffect'>;

export class DerbyWeatherSystem {
  private activeType: WeatherType = 'light_cloud';
  private currentTimeOfDay = 12.0;
  private manager?: WeatherManager;

  get type() {
    return this.activeType;
  }

  get timeOfDay() {
    return this.currentTimeOfDay;
  }

  init(context: WeatherInitContext) {
    const rainEffect = new RainEffect(context.scene, 5000);
    const lightningEffect = new LightningEffect(context.scene);

    this.manager = new WeatherManager(
      {
        ...context,
        rainEffect,
        lightningEffect,
      },
      this.activeType,
    );
    this.setWeather(this.activeType);
  }

  setWeather(type: WeatherType) {
    this.activeType = type;
    this.manager?.setWeather(type);
  }

  setTimeOfDay(time: number) {
    this.currentTimeOfDay = time % 24.0;
    this.manager?.update(0, this.currentTimeOfDay);
  }

  update(delta: number, advanceTime: boolean, onTimeUpdate?: (time: number) => void) {
    if (advanceTime) {
      this.currentTimeOfDay = (this.currentTimeOfDay + (delta / 120.0) * 24.0) % 24.0;
      onTimeUpdate?.(this.currentTimeOfDay);
    }

    this.manager?.update(delta, this.currentTimeOfDay);
  }

  dispose() {
    this.manager?.dispose();
  }
}
