import * as THREE from 'three';

interface DustParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  maxAge: number;
  scale: number;
}

const MAX_DUST_PARTICLES = 250;

export class DustParticleSystem {
  private readonly particles: DustParticle[] = [];
  private readonly activeIndices: number[] = [];
  private readonly activeSet = new Set<number>();
  private readonly dummy = new THREE.Object3D();
  private readonly sideDir = new THREE.Vector3();
  private readonly mesh: THREE.InstancedMesh;
  private particleIndex = 0;

  constructor() {
    const particleGeometry = new THREE.BoxGeometry(0.32, 0.32, 0.32);
    const particleMaterial = new THREE.MeshStandardMaterial({
      color: 0xbfab8f,
      roughness: 0.9,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });

    this.mesh = new THREE.InstancedMesh(particleGeometry, particleMaterial, MAX_DUST_PARTICLES);
    this.mesh.castShadow = false;

    this.dummy.position.set(0, -999, 0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();

    for (let i = 0; i < MAX_DUST_PARTICLES; i += 1) {
      this.particles.push({
        position: new THREE.Vector3(0, -999, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        age: 1.0,
        maxAge: 0.5,
        scale: 0,
      });
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }

  addToScene(scene: THREE.Scene) {
    scene.add(this.mesh);
  }

  spawn(position: THREE.Vector3, backwardDir: THREE.Vector3, count = 3) {
    for (let i = 0; i < count; i += 1) {
      const particle = this.particles[this.particleIndex];
      particle.position.set(
        position.x + (Math.random() - 0.5) * 0.15,
        position.y + Math.random() * 0.03,
        position.z + (Math.random() - 0.5) * 0.15,
      );

      const speed = 1.2 + Math.random() * 1.5;
      particle.velocity.copy(backwardDir).multiplyScalar(speed);
      particle.velocity.y = 0.8 + Math.random() * 1.2;

      this.sideDir.set(-backwardDir.z, 0, backwardDir.x);
      particle.velocity.addScaledVector(this.sideDir, (Math.random() - 0.5) * 0.8);

      particle.age = 0;
      particle.maxAge = 0.3 + Math.random() * 0.25;
      particle.scale = 0.5 + Math.random() * 0.5;

      if (!this.activeSet.has(this.particleIndex)) {
        this.activeSet.add(this.particleIndex);
        this.activeIndices.push(this.particleIndex);
      }

      this.particleIndex = (this.particleIndex + 1) % MAX_DUST_PARTICLES;
    }
  }

  update(delta: number) {
    if (this.activeIndices.length === 0) return;

    for (let index = this.activeIndices.length - 1; index >= 0; index -= 1) {
      const particleIndex = this.activeIndices[index];
      const particle = this.particles[particleIndex];

      particle.age += delta;

      if (particle.age >= particle.maxAge) {
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(particleIndex, this.dummy.matrix);
        this.activeIndices.splice(index, 1);
        this.activeSet.delete(particleIndex);
        continue;
      }

      particle.position.addScaledVector(particle.velocity, delta);
      particle.velocity.y -= delta * 0.8;
      particle.velocity.multiplyScalar(0.93);

      const progress = particle.age / particle.maxAge;
      const scale = particle.scale * (1.0 - progress) * (1.0 + progress * 0.5);

      this.dummy.position.copy(particle.position);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(particleIndex, this.dummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
