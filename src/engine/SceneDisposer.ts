import * as THREE from 'three';

type DisposableMaterial = THREE.Material & Record<string, unknown>;

function disposeMaterial(material: THREE.Material) {
  const inspectableMaterial = material as DisposableMaterial;

  for (const value of Object.values(inspectableMaterial)) {
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }

  material.dispose();
}

export function disposeSceneResources(scene: THREE.Scene) {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      object.geometry.dispose();

      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        disposeMaterial(material);
      }
    }
  });
}

