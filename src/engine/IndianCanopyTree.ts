import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * A broad, flattened layered canopy evoking gulmohar/neem/banyan silhouettes
 * common in central India — wide and low, unlike the tall conical pines or
 * rounded dodecahedron clusters used for temperate locations. Baked once as
 * a unit-radius merged geometry so it can be drawn efficiently via InstancedMesh.
 */
export function createIndianCanopyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const bake = (geom: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const g = geom.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion(),
      new THREE.Vector3(sx, sy, sz),
    ));
    parts.push(g);
  };

  // Main spreading crown: a squashed dome, wide and flat-topped
  const domeGeom = new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6);
  bake(domeGeom, 0, 0.08, 0, 1.35, 0.5, 1.35);
  domeGeom.dispose();

  // Lower skirt layer, wider and flatter still, giving the characteristic
  // tiered "umbrella" spread rather than a single round mass
  const skirtGeom = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.45);
  bake(skirtGeom, 0.12, -0.28, -0.08, 1.7, 0.28, 1.7);
  skirtGeom.dispose();

  // A couple of asymmetric lobes so instances don't look perfectly radial
  // (SphereGeometry, not Dodecahedron, so it stays indexed like the parts above and merges cleanly)
  const lobeGeom = new THREE.SphereGeometry(1, 7, 5);
  bake(lobeGeom, 0.9, -0.05, 0.5, 0.62, 0.4, 0.62);
  bake(lobeGeom, -0.85, 0.05, -0.4, 0.58, 0.42, 0.58);
  lobeGeom.dispose();

  return mergeGeometries(parts);
}
