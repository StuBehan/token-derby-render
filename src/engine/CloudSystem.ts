import * as THREE from 'three';

interface CloudPuff {
  mesh: THREE.Mesh;
  baseScale: THREE.Vector3;
  phase: number;
  speed: number;
  amp: number;
}

interface CloudEntry {
  group: THREE.Group;
  speed: number;
  minX: number;
  maxX: number;
  baseY: number;
  baseScale: number;
  puffs: CloudPuff[];
  materials: THREE.Material[];
}

const UNIT_CLOUD_PUFF_GEOM = new THREE.DodecahedronGeometry(1.0, 0);

export class CloudSystem {
  private readonly clouds: CloudEntry[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  addClouds(count = 8, color = new THREE.Color(0xffffff), minSpeed = 3.5, maxSpeed = 8.0) {
    const minX = -195;
    const maxX = 195;

    for (let i = 0; i < count; i += 1) {
      const cloudGroup = new THREE.Group();
      const cloudMaterial = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.95,
        metalness: 0.05,
        transparent: true,
        opacity: 0.85,
        flatShading: true,
      });

      const initialX = minX + (i / count) * (maxX - minX) + (Math.random() - 0.5) * 15;
      const initialZ = -150 + Math.random() * 190;
      const initialY = 38 + Math.random() * 20;

      cloudGroup.position.set(initialX, initialY, initialZ);

      const baseScale = 0.8 + Math.random() * 0.7;
      cloudGroup.scale.setScalar(baseScale);

      const puffCount = 5 + Math.floor(Math.random() * 3);
      const puffsList: CloudPuff[] = [];

      for (let p = 0; p < puffCount; p += 1) {
        let size = 1.0;
        let ox = 0;
        let oy = 0;
        let oz = 0;

        if (p === 0) {
          size = 3.6;
        } else if (p === 1) {
          size = 2.6;
          ox = -2.8;
          oy = -0.4;
        } else if (p === 2) {
          size = 2.8;
          ox = 2.8;
          oy = -0.3;
        } else if (p === 3) {
          size = 2.3;
          oy = 1.3;
        } else if (p === 4) {
          size = 2.1;
          ox = 0.4;
          oy = -0.2;
          oz = -1.8;
        } else if (p === 5) {
          size = 2.0;
          ox = -0.3;
          oy = -0.4;
          oz = 1.8;
        } else {
          size = 1.5 + Math.random() * 1.2;
          ox = (Math.random() - 0.5) * 4;
          oy = (Math.random() - 0.5) * 2;
          oz = (Math.random() - 0.5) * 3;
        }

        const radius = size * (0.85 + Math.random() * 0.3);
        const posX = ox + (Math.random() - 0.5) * 0.5;
        const posY = oy + (Math.random() - 0.5) * 0.3;
        const posZ = oz + (Math.random() - 0.5) * 0.5;

        const puffMesh = new THREE.Mesh(UNIT_CLOUD_PUFF_GEOM, cloudMaterial);
        puffMesh.position.set(posX, posY, posZ);
        puffMesh.scale.setScalar(radius);
        puffMesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        puffMesh.castShadow = false;
        puffMesh.receiveShadow = false;

        cloudGroup.add(puffMesh);

        puffsList.push({
          mesh: puffMesh,
          baseScale: new THREE.Vector3(radius, radius, radius),
          phase: Math.random() * Math.PI * 2,
          speed: 0.5 + Math.random() * 0.8,
          amp: 0.05 + Math.random() * 0.08,
        });
      }

      this.scene.add(cloudGroup);

      this.clouds.push({
        group: cloudGroup,
        speed: minSpeed + Math.random() * (maxSpeed - minSpeed),
        minX,
        maxX,
        baseY: initialY,
        baseScale,
        puffs: puffsList,
        materials: [cloudMaterial],
      });
    }
  }

  configure = (count: number, color: THREE.Color, minSpeed: number, maxSpeed: number) => {
    if (this.clouds.length < count) {
      this.addClouds(count - this.clouds.length, color, minSpeed, maxSpeed);
    }

    this.clouds.forEach((cloud, index) => {
      const visible = index < count;
      cloud.group.visible = visible;
      cloud.speed = minSpeed + Math.random() * (maxSpeed - minSpeed);

      cloud.materials.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.color.copy(color);
          material.opacity = visible ? 0.85 : 0;
        }
      });
    });
  };

  update(delta: number, time: number) {
    this.clouds.forEach((cloud) => {
      if (!cloud.group.visible) return;

      cloud.group.position.x += cloud.speed * delta;
      cloud.group.position.y = cloud.baseY + Math.sin(time * 0.2 + cloud.puffs[0].phase) * 1.2;

      const fadeWidth = 45.0;
      let fadeFactor = 1.0;

      if (cloud.group.position.x < cloud.minX + fadeWidth) {
        fadeFactor = (cloud.group.position.x - cloud.minX) / fadeWidth;
      } else if (cloud.group.position.x > cloud.maxX - fadeWidth) {
        fadeFactor = (cloud.maxX - cloud.group.position.x) / fadeWidth;
      }

      fadeFactor = Math.max(0.0, Math.min(1.0, fadeFactor));

      cloud.materials.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.opacity = 0.85 * fadeFactor;
        }
      });

      const scaleFactor = 0.2 + 0.8 * fadeFactor;
      const pulse = 1.0 + Math.sin(time * 0.35 + cloud.baseY) * 0.05;
      cloud.group.scale.setScalar(cloud.baseScale * scaleFactor * pulse);

      if (cloud.group.position.x > cloud.maxX) {
        cloud.group.position.x = cloud.minX;
        cloud.group.position.z = -150 + Math.random() * 190;
        cloud.baseY = 38 + Math.random() * 20;
        cloud.group.position.y = cloud.baseY;
        cloud.speed = 3.5 + Math.random() * 4.5;
        cloud.baseScale = 0.8 + Math.random() * 0.7;
        cloud.puffs.forEach((puff) => {
          puff.phase = Math.random() * Math.PI * 2;
        });
      }
    });
  }
}
