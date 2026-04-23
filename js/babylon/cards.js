/**
 * cards.js — Babylon.js 3D 卡片模型、旋轉動畫、抓取與翻轉
 */

const CardManager = (() => {
  const CARD_WIDTH = 1.6;
  const CARD_HEIGHT = 2.4;
  const CARD_COUNT = 5;
  const ORBIT_RADIUS = 3.2;

  let cards = [];
  let cardGroup = null;
  let selectedCard = null;
  let isAnimating = false;
  let orbitSpeed = 0.3;
  let _scene = null;
  let _texId = 0;

  // ========== Canvas 繪圖工具 ==========

  function roundRect(ctx, x, y, w, h, r) {
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
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const chars = text.split('');
    let line = '';
    let lineY = y;
    for (let i = 0; i < chars.length; i++) {
      const testLine = line + chars[i];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line.length > 0) {
        ctx.fillText(line, x, lineY);
        line = chars[i];
        lineY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, lineY);
  }

  // ========== 紋理建立（使用 DynamicTexture）==========

  /**
   * 用 Canvas 2D 繪製卡片背面紋路
   */
  function createBackTexture() {
    const dt = new BABYLON.DynamicTexture('backTex_' + _texId++, { width: 512, height: 768 }, _scene, true);
    const ctx = dt.getContext();

    // 深紫背景漸層
    const grad = ctx.createLinearGradient(0, 0, 512, 768);
    grad.addColorStop(0, '#1a0533');
    grad.addColorStop(0.5, '#2d1b69');
    grad.addColorStop(1, '#0f0a2e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 768);

    // 金色邊框
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 8;
    ctx.strokeRect(16, 16, 480, 736);

    // 內框
    ctx.strokeStyle = 'rgba(201, 168, 76, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(32, 32, 448, 704);

    // 中央符文圓圈
    ctx.save();
    ctx.translate(256, 384);

    ctx.beginPath();
    ctx.arc(0, 0, 120, 0, Math.PI * 2);
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 90, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(201, 168, 76, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 星形符文
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, -100);
      ctx.lineTo(5, -60);
      ctx.lineTo(-5, -60);
      ctx.closePath();
      ctx.fillStyle = 'rgba(201, 168, 76, 0.5)';
      ctx.fill();
      ctx.restore();
    }

    // 中央問號
    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 72px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('？', 0, 0);

    ctx.restore();

    // 四角裝飾
    const corners = [[48, 48], [464, 48], [48, 720], [464, 720]];
    corners.forEach(([cx, cy]) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(201, 168, 76, 0.3)';
      ctx.fill();
      ctx.strokeStyle = '#c9a84c';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    });

    // 神秘紋路線條
    ctx.strokeStyle = 'rgba(201, 168, 76, 0.15)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 12; i++) {
      const y = 80 + i * 55;
      ctx.beginPath();
      ctx.moveTo(60, y);
      for (let x = 60; x < 452; x += 2) {
        ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 8);
      }
      ctx.stroke();
    }

    dt.update();
    return dt;
  }

  /**
   * 用 Canvas 2D 繪製卡片正面（運勢內容）
   */
  function createFrontTexture(fortuneData) {
    const dt = new BABYLON.DynamicTexture('frontTex_' + _texId++, { width: 512, height: 768 }, _scene, true);
    const ctx = dt.getContext();

    // 正面背景
    const grad = ctx.createLinearGradient(0, 0, 512, 768);
    grad.addColorStop(0, '#0d0b1a');
    grad.addColorStop(0.4, '#1a1040');
    grad.addColorStop(1, '#0d0b1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 768);

    // 金色邊框
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, 484, 740);
    ctx.strokeStyle = 'rgba(201, 168, 76, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(28, 28, 456, 712);

    // ---- 天氣區域 ----
    ctx.fillStyle = 'rgba(201, 168, 76, 0.1)';
    roundRect(ctx, 40, 50, 432, 140, 10);
    ctx.fill();

    ctx.font = '24px "Noto Serif TC", serif';
    ctx.fillStyle = 'rgba(201, 168, 76, 0.7)';
    ctx.textAlign = 'center';
    ctx.fillText('☁ 明日天氣 ☁', 256, 85);

    ctx.font = '48px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fortuneData.weather.icon, 256, 135);

    ctx.font = '22px "Noto Serif TC", serif';
    ctx.fillStyle = '#e8d5a3';
    ctx.fillText(fortuneData.weather.name, 256, 175);

    // ---- 運勢區域 ----
    ctx.fillStyle = 'rgba(201, 168, 76, 0.1)';
    roundRect(ctx, 40, 210, 432, 300, 10);
    ctx.fill();

    ctx.font = '22px "Noto Serif TC", serif';
    ctx.fillStyle = 'rgba(201, 168, 76, 0.7)';
    ctx.textAlign = 'center';
    ctx.fillText('✦ 今日運勢 ✦', 256, 248);

    ctx.font = 'bold 64px "Noto Serif TC", serif';
    ctx.fillStyle = fortuneData.fortune.color;
    ctx.fillText(fortuneData.fortune.level, 256, 330);

    ctx.font = '18px "Noto Serif TC", serif';
    ctx.fillStyle = '#c8b88a';
    wrapText(ctx, fortuneData.fortune.message, 256, 390, 380, 28);

    // ---- 幸運顏色 ----
    ctx.fillStyle = 'rgba(201, 168, 76, 0.1)';
    roundRect(ctx, 40, 530, 432, 120, 10);
    ctx.fill();

    ctx.font = '22px "Noto Serif TC", serif';
    ctx.fillStyle = 'rgba(201, 168, 76, 0.7)';
    ctx.fillText('◆ 幸運顏色 ◆', 256, 565);

    ctx.fillStyle = fortuneData.luckyColor.hex;
    roundRect(ctx, 176, 580, 60, 30, 6);
    ctx.fill();
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 1;
    roundRect(ctx, 176, 580, 60, 30, 6);
    ctx.stroke();

    ctx.font = '20px "Noto Serif TC", serif';
    ctx.fillStyle = '#e8d5a3';
    ctx.fillText(fortuneData.luckyColor.name, 306, 602);

    ctx.font = '16px "Noto Serif TC", serif';
    ctx.fillStyle = 'rgba(200, 184, 138, 0.6)';
    ctx.fillText(fortuneData.weather.desc, 256, 700);

    dt.update();
    return dt;
  }

  // ========== 卡片管理 ==========

  /**
   * 建立所有卡片
   */
  function createCards(scene) {
    _scene = scene;
    cardGroup = new BABYLON.TransformNode('cardGroup', scene);
    cards = [];

    const backTexture = createBackTexture();

    for (let i = 0; i < CARD_COUNT; i++) {
      const fortuneData = FortuneGenerator.generate();
      const frontTexture = createFrontTexture(fortuneData);

      // 正面材質（PBR — 對應 Three.js MeshStandardMaterial）
      const frontMaterial = new BABYLON.PBRMaterial('frontMat_' + i, scene);
      frontMaterial.albedoTexture = frontTexture;
      frontMaterial.roughness = 0.3;
      frontMaterial.metallic = 0.1;
      frontMaterial.backFaceCulling = true;

      // 背面材質
      const backMaterial = new BABYLON.PBRMaterial('backMat_' + i, scene);
      backMaterial.albedoTexture = backTexture;
      backMaterial.roughness = 0.3;
      backMaterial.metallic = 0.2;
      backMaterial.backFaceCulling = true;

      // 雙面卡片用兩個平面
      const frontMesh = BABYLON.MeshBuilder.CreatePlane('front_' + i, {
        width: CARD_WIDTH, height: CARD_HEIGHT,
      }, scene);
      frontMesh.material = frontMaterial;

      const backMesh = BABYLON.MeshBuilder.CreatePlane('back_' + i, {
        width: CARD_WIDTH, height: CARD_HEIGHT,
      }, scene);
      backMesh.material = backMaterial;
      backMesh.rotation.y = Math.PI; // 背面旋轉 180°

      // 發光光暈
      const glowMesh = BABYLON.MeshBuilder.CreatePlane('glow_' + i, {
        width: CARD_WIDTH * 1.2, height: CARD_HEIGHT * 1.2,
      }, scene);
      const glowMat = new BABYLON.StandardMaterial('glowMat_' + i, scene);
      glowMat.emissiveColor = new BABYLON.Color3(201 / 255, 168 / 255, 76 / 255);
      glowMat.disableLighting = true;
      glowMat.alpha = 0;
      glowMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
      glowMat.backFaceCulling = false;
      glowMat.disableDepthWrite = true;
      glowMesh.material = glowMat;
      glowMesh.position.z = -0.01;

      // 用 TransformNode 當容器（類似 THREE.Group）
      const cardObj = new BABYLON.TransformNode('card_' + i, scene);
      frontMesh.parent = cardObj;
      backMesh.parent = cardObj;
      glowMesh.parent = cardObj;

      // 初始旋轉：顯示背面
      cardObj.rotation.y = Math.PI;

      const angle = (i / CARD_COUNT) * Math.PI * 2;
      cardObj._orbitAngle = angle;
      cardObj._fortuneData = fortuneData;
      cardObj._glowMat = glowMat;
      cardObj._isRevealed = false;
      cardObj._hoverIntensity = 0;

      cardObj.parent = cardGroup;
      cards.push(cardObj);
    }

    return cards;
  }

  /**
   * 更新卡片軌道旋轉
   */
  function updateOrbit(time) {
    if (!cardGroup || isAnimating) return;

    cards.forEach((card, i) => {
      if (card._isRevealed) return;
      const angle = card._orbitAngle + time * orbitSpeed;
      card.position.x = Math.cos(angle) * ORBIT_RADIUS;
      card.position.z = Math.sin(angle) * ORBIT_RADIUS * 0.4 + 1.5;
      card.position.y = Math.sin(angle * 2 + i) * 0.4;

      // 卡片始終面向攝影機方向（但顯示背面）
      card.rotation.y = Math.PI - angle;

      // 自轉微擺
      card.rotation.z = Math.sin(time * 0.5 + i * 1.2) * 0.05;
    });
  }

  /**
   * 設定卡片懸停效果
   */
  function setHover(cardIndex, intensity) {
    if (cardIndex < 0 || cardIndex >= cards.length) return;
    const card = cards[cardIndex];
    if (card._isRevealed) return;

    card._hoverIntensity = intensity;
    card._glowMat.alpha = intensity * 0.4;

    // 震動效果
    if (intensity > 0.5) {
      card.position.x += (Math.random() - 0.5) * 0.02 * intensity;
      card.position.y += (Math.random() - 0.5) * 0.02 * intensity;
    }
  }

  /**
   * 抓取卡片：飛向中央並翻轉
   */
  function grabCard(cardIndex, scene, onComplete) {
    if (isAnimating || cardIndex < 0 || cardIndex >= cards.length) return;
    const card = cards[cardIndex];
    if (card._isRevealed) return;

    isAnimating = true;
    selectedCard = card;
    card._isRevealed = true;

    // 爆發粒子
    ParticleSystem.createBurst(scene, card.position.clone(), card._fortuneData.fortune.color);

    // GSAP 動畫：飛到中央
    gsap.to(card.position, {
      x: 0,
      y: 0.2,
      z: 3,
      duration: 0.8,
      ease: 'power3.inOut',
    });

    gsap.to(card.rotation, {
      y: 0,
      z: 0,
      duration: 1.0,
      ease: 'power3.inOut',
      delay: 0.3,
      onComplete: () => {
        isAnimating = false;
        if (onComplete) onComplete(card._fortuneData);
      },
    });

    // 放大卡片（Babylon 使用 scaling 而非 scale）
    gsap.to(card.scaling, {
      x: 1.3,
      y: 1.3,
      z: 1.3,
      duration: 0.8,
      ease: 'power2.out',
    });

    // 光暈效果
    gsap.to(card._glowMat, {
      alpha: 0.6,
      duration: 0.5,
    });
    gsap.to(card._glowMat, {
      alpha: 0,
      duration: 0.5,
      delay: 1.0,
    });
  }

  /**
   * 重置所有卡片
   */
  function resetCards(scene) {
    if (cardGroup) {
      // 清除所有子 Mesh 及材質
      cardGroup.getChildMeshes(false).forEach(mesh => {
        if (mesh.material) {
          ['albedoTexture', 'diffuseTexture', 'emissiveTexture'].forEach(prop => {
            if (mesh.material[prop]) mesh.material[prop].dispose();
          });
          mesh.material.dispose();
        }
        mesh.dispose();
      });
      // 清除 TransformNodes
      cardGroup.getChildTransformNodes(false).forEach(node => node.dispose());
      cardGroup.dispose();
    }
    cards = [];
    selectedCard = null;
    isAnimating = false;
    FortuneGenerator.reset();
    createCards(scene);
  }

  /**
   * 找到最接近指定位置的卡片
   */
  function findClosestCard(worldPos, threshold) {
    let closestIdx = -1;
    let closestDist = Infinity;

    cards.forEach((card, idx) => {
      if (card._isRevealed) return;
      const dist = BABYLON.Vector3.Distance(card.position, worldPos);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = idx;
      }
    });

    if (closestDist < (threshold || 1.5)) {
      return { index: closestIdx, distance: closestDist };
    }
    return null;
  }

  function getIsAnimating() { return isAnimating; }
  function getCards() { return cards; }

  return {
    createCards, updateOrbit, setHover, grabCard,
    resetCards, findClosestCard, getIsAnimating, getCards,
  };
})();
