import * as THREE from 'three';
import { Horse } from './Horse';

interface ActiveAchievementEffect {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  texture: THREE.CanvasTexture;
  age: number;
  duration: number;
  horse: Horse;
}

export class AchievementEffects {
  private readonly activeEffects: ActiveAchievementEffect[] = [];

  spawn(horses: Horse[], horseName: string, colorHex: string, achievementName: string, xp: number = 3) {
    const horse = horses.find(h => h.name.toLowerCase() === horseName.toLowerCase());
    if (!horse) return;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'rgba(15, 15, 20, 0.85)';
    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 4;

    const x = 10;
    const y = 10;
    const w = canvas.width - 20;
    const h = canvas.height - 20;
    const r = 20;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = colorHex;
    ctx.beginPath();
    ctx.arc(60, canvas.height / 2, 35, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px "Outfit", "Inter", "Arial", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`+${xp}`, 60, canvas.height / 2);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px "Outfit", "Inter", "Arial", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(achievementName, 120, 48);

    ctx.fillStyle = '#a0a0b0';
    ctx.font = '20px "Outfit", "Inter", "Arial", sans-serif';
    ctx.fillText('Achievement gained!', 120, 88);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(5.0, 1.25, 1.0);
    sprite.position.set(0, 3.5, 0);

    horse.group.add(sprite);

    this.activeEffects.push({
      sprite,
      material,
      texture,
      age: 0,
      duration: 3.0,
      horse,
    });
  }

  update(delta: number) {
    for (let i = this.activeEffects.length - 1; i >= 0; i -= 1) {
      const effect = this.activeEffects[i];
      effect.age += delta;
      const progress = effect.age / effect.duration;

      if (progress >= 1.0) {
        this.disposeEffect(effect);
        this.activeEffects.splice(i, 1);
      } else {
        effect.sprite.position.y = 3.5 + progress * 2.5;
        effect.material.opacity = Math.max(0, 1.0 - progress);

        const scale = 5.0 * (1.0 + progress * 0.15);
        effect.sprite.scale.set(scale, scale * 0.25, 1.0);
      }
    }
  }

  clear() {
    this.activeEffects.forEach((effect) => this.disposeEffect(effect));
    this.activeEffects.length = 0;
  }

  private disposeEffect(effect: ActiveAchievementEffect) {
    effect.horse.group.remove(effect.sprite);
    effect.texture.dispose();
    effect.material.dispose();
  }
}
