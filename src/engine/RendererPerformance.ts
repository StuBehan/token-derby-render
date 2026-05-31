import * as THREE from 'three';

const MAX_RENDER_PIXEL_RATIO = 1.25;
const ULTRAWIDE_RENDER_PIXEL_RATIO = 1.0;
const ULTRAWIDE_WIDTH_THRESHOLD = 2560;

export function applyRendererPerformanceSettings(
  renderer: THREE.WebGLRenderer,
  viewportWidth: number,
  sunLight?: THREE.DirectionalLight,
) {
  const usePerformanceMode = viewportWidth >= ULTRAWIDE_WIDTH_THRESHOLD;
  const maxPixelRatio = usePerformanceMode
    ? ULTRAWIDE_RENDER_PIXEL_RATIO
    : MAX_RENDER_PIXEL_RATIO;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  renderer.shadowMap.enabled = !usePerformanceMode;

  if (sunLight) {
    sunLight.castShadow = !usePerformanceMode;
  }
}
