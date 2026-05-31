import * as THREE from 'three';

export interface SkyDome {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
}

export function createSkyDome(): SkyDome {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x94aebf) },
      horizonColor: { value: new THREE.Color(0xd4d8d0) },
      nightFactor: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform float nightFactor;
      varying vec3 vWorldPosition;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.1, 0.1));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float heightMix = smoothstep(-24.0, 155.0, vWorldPosition.y);
        vec3 skyColor = mix(horizonColor, topColor, heightMix);

        if (dir.y > 0.0 && nightFactor > 0.01) {
          float starValue = hash(floor(dir * 360.0));
          if (starValue > 0.9985) {
            float intensity = fract(starValue * 123.4) * nightFactor;
            skyColor += vec3(intensity);
          }
        }

        gl_FragColor = vec4(skyColor, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(360, 48, 24),
    material,
  );
  mesh.renderOrder = -10;

  return { mesh, material };
}
