/**
 * particles.js — Babylon.js 背景星空粒子 & 爆發效果
 */

const ParticleSystem = (() => {
  let starMesh = null;
  let starSpeeds = null;
  let burstMesh = null;
  let burstVelocities = null;
  let burstLife = 0;

  /**
   * 建立星空背景粒子（使用 pointsCloud 渲染）
   */
  function createStarField(scene) {
    const count = 1500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 4); // RGBA for Babylon
    const speeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const i4 = i * 4;
      positions[i3] = (Math.random() - 0.5) * 60;
      positions[i3 + 1] = (Math.random() - 0.5) * 40;
      positions[i3 + 2] = (Math.random() - 0.5) * 30 - 5;

      // 微妙的顏色變化：金色 / 青色 / 白色
      const colorChoice = Math.random();
      if (colorChoice < 0.3) {
        colors[i4] = 1.0; colors[i4 + 1] = 0.85; colors[i4 + 2] = 0.4; colors[i4 + 3] = 0.7;
      } else if (colorChoice < 0.5) {
        colors[i4] = 0.4; colors[i4 + 1] = 0.9; colors[i4 + 2] = 1.0; colors[i4 + 3] = 0.7;
      } else {
        colors[i4] = 0.8; colors[i4 + 1] = 0.8; colors[i4 + 2] = 0.9; colors[i4 + 3] = 0.7;
      }

      speeds[i] = Math.random() * 0.3 + 0.1;
    }

    // 每個頂點一個 index（點雲渲染）
    const indices = new Uint32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;

    // 建立 Mesh
    starMesh = new BABYLON.Mesh('starField', scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.colors = colors;
    vertexData.indices = indices;
    vertexData.applyToMesh(starMesh, true); // true = updatable

    // 點雲材質
    const mat = new BABYLON.StandardMaterial('starMat', scene);
    mat.emissiveColor = BABYLON.Color3.White();
    mat.disableLighting = true;
    mat.pointsCloud = true;
    mat.pointSize = 2;
    mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
    mat.disableDepthWrite = true;

    starMesh.material = mat;
    starMesh.hasVertexAlpha = true;
    starSpeeds = speeds;

    return starMesh;
  }

  /**
   * 更新星空漂浮
   */
  function updateStarField(time) {
    if (!starMesh) return;
    const positions = starMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    if (!positions) return;
    const count = starSpeeds.length;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3 + 1] += Math.sin(time * starSpeeds[i] + i) * 0.002;
      positions[i3] += Math.cos(time * starSpeeds[i] * 0.7 + i * 0.5) * 0.001;
    }
    starMesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
    starMesh.rotation.y = time * 0.01;
  }

  /**
   * 建立卡片翻轉時的爆發粒子
   */
  function createBurst(scene, position, color) {
    if (burstMesh) {
      burstMesh.dispose();
      burstMesh = null;
    }

    const count = 200;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 4);

    // 解析顏色（從 hex 字串如 '#FFD700'）
    const col = BABYLON.Color3.FromHexString(color);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const i4 = i * 4;
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
      colors[i4] = col.r * (1 - mix) + 1.0 * mix;
      colors[i4 + 1] = col.g * (1 - mix) + 0.85 * mix;
      colors[i4 + 2] = col.b * (1 - mix) + 0.3 * mix;
      colors[i4 + 3] = 1.0;
    }

    const indices = new Uint32Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;

    burstMesh = new BABYLON.Mesh('burst', scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.colors = colors;
    vertexData.indices = indices;
    vertexData.applyToMesh(burstMesh, true);

    const mat = new BABYLON.StandardMaterial('burstMat', scene);
    mat.emissiveColor = BABYLON.Color3.White();
    mat.disableLighting = true;
    mat.pointsCloud = true;
    mat.pointSize = 2;
    mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
    mat.disableDepthWrite = true;

    burstMesh.material = mat;
    burstMesh.hasVertexAlpha = true;
    burstVelocities = velocities;
    burstLife = 1.0;
  }

  /**
   * 更新爆發粒子
   */
  function updateBurst() {
    if (!burstMesh || burstLife <= 0) return;

    burstLife -= 0.015;
    const positions = burstMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const colors = burstMesh.getVerticesData(BABYLON.VertexBuffer.ColorKind);
    if (!positions || !colors) return;
    const count = positions.length / 3;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const i4 = i * 4;
      positions[i3] += burstVelocities[i3];
      positions[i3 + 1] += burstVelocities[i3 + 1];
      positions[i3 + 2] += burstVelocities[i3 + 2];
      // 減速
      burstVelocities[i3] *= 0.97;
      burstVelocities[i3 + 1] *= 0.97;
      burstVelocities[i3 + 2] *= 0.97;
      // 淡出
      colors[i4 + 3] = burstLife;
    }

    burstMesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
    burstMesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, colors);

    if (burstLife <= 0) {
      burstMesh.dispose();
      burstMesh = null;
    }
  }

  return { createStarField, updateStarField, createBurst, updateBurst };
})();
