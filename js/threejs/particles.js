/**
 * particles.js — 背景星空粒子 & 爆發效果
 */

const ParticleSystem = (() => {
  let starField = null;
  let burstParticles = null;
  let burstLife = 0;

  /**
   * 建立星空背景粒子
   */
  function createStarField(scene) {
    const count = 1500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const speeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 60;
      positions[i3 + 1] = (Math.random() - 0.5) * 40;
      positions[i3 + 2] = (Math.random() - 0.5) * 30 - 5;

      // 微妙的顏色變化：金色 / 青色 / 白色
      const colorChoice = Math.random();
      if (colorChoice < 0.3) {
        colors[i3] = 1.0; colors[i3 + 1] = 0.85; colors[i3 + 2] = 0.4; // 金
      } else if (colorChoice < 0.5) {
        colors[i3] = 0.4; colors[i3 + 1] = 0.9; colors[i3 + 2] = 1.0; // 青
      } else {
        colors[i3] = 0.8; colors[i3 + 1] = 0.8; colors[i3 + 2] = 0.9; // 白
      }

      sizes[i] = Math.random() * 2.5 + 0.5;
      speeds[i] = Math.random() * 0.3 + 0.1;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    starField = new THREE.Points(geometry, material);
    starField._speeds = speeds;
    scene.add(starField);

    return starField;
  }

  /**
   * 更新星空漂浮
   */
  function updateStarField(time) {
    if (!starField) return;
    const positions = starField.geometry.attributes.position.array;
    const speeds = starField._speeds;
    const count = speeds.length;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3 + 1] += Math.sin(time * speeds[i] + i) * 0.002;
      positions[i3] += Math.cos(time * speeds[i] * 0.7 + i * 0.5) * 0.001;
    }
    starField.geometry.attributes.position.needsUpdate = true;
    starField.rotation.y = time * 0.01;
  }

  /**
   * 建立卡片翻轉時的爆發粒子
   */
  function createBurst(scene, position, color) {
    if (burstParticles) {
      scene.remove(burstParticles);
      burstParticles.geometry.dispose();
      burstParticles.material.dispose();
    }

    const count = 200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const col = new THREE.Color(color);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = position.x;
      positions[i3 + 1] = position.y;
      positions[i3 + 2] = position.z;

      // 球形擴散
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = Math.random() * 0.08 + 0.02;
      velocities[i3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      velocities[i3 + 2] = Math.cos(phi) * speed;

      // 從中心色到金色漸變
      const mix = Math.random();
      colors[i3] = col.r * (1 - mix) + 1.0 * mix;
      colors[i3 + 1] = col.g * (1 - mix) + 0.85 * mix;
      colors[i3 + 2] = col.b * (1 - mix) + 0.3 * mix;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    burstParticles = new THREE.Points(geometry, material);
    burstParticles._velocities = velocities;
    burstLife = 1.0;
    scene.add(burstParticles);
  }

  /**
   * 更新爆發粒子
   */
  function updateBurst() {
    if (!burstParticles || burstLife <= 0) return;

    burstLife -= 0.015;
    const positions = burstParticles.geometry.attributes.position.array;
    const velocities = burstParticles._velocities;
    const count = positions.length / 3;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] += velocities[i3];
      positions[i3 + 1] += velocities[i3 + 1];
      positions[i3 + 2] += velocities[i3 + 2];
      // 減速
      velocities[i3] *= 0.97;
      velocities[i3 + 1] *= 0.97;
      velocities[i3 + 2] *= 0.97;
    }

    burstParticles.geometry.attributes.position.needsUpdate = true;
    burstParticles.material.opacity = burstLife;

    if (burstLife <= 0 && burstParticles.parent) {
      burstParticles.parent.remove(burstParticles);
      burstParticles.geometry.dispose();
      burstParticles.material.dispose();
      burstParticles = null;
    }
  }

  return { createStarField, updateStarField, createBurst, updateBurst };
})();
