/**
 * cards.js — 3D 卡片模型、旋轉動畫、抓取與翻轉
 */

const CardManager = (() => {
  const CARD_WIDTH  = 1.6;
  const CARD_HEIGHT = 2.4;
  const CARD_COUNT  = 5;
  const ORBIT_RADIUS_NORMAL = 3.2;  // 普通模式軌道半徑
  const ORBIT_RADIUS_AR     = 1.0;  // AR 模式軌道半徑（緊縮，卡片近一點）
  const ORBIT_SPEED_NORMAL  = 0.3;
  const ORBIT_SPEED_AR      = 0.18; // AR 模式轉慢一點

  let ORBIT_RADIUS = ORBIT_RADIUS_NORMAL;
  let cards = [];
  let cardGroup = null;
  let selectedCard = null;
  let isAnimating = false;
  let orbitSpeed = ORBIT_SPEED_NORMAL;
  let isARMode = false;
  let arCamera = null; // AR 模式下引用攝影機做動態朝向

  /**
   * 用 Canvas 2D 繪製卡片背面紋路（加亮版）
   */
  function createBackTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');

    // ── 背景漸層（更亮的深紫） ──
    const grad = ctx.createLinearGradient(0, 0, 512, 768);
    grad.addColorStop(0, '#1e0845');
    grad.addColorStop(0.3, '#3a1a8a');
    grad.addColorStop(0.5, '#2d1b69');
    grad.addColorStop(0.7, '#3a1a8a');
    grad.addColorStop(1, '#1e0845');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 768);

    // ── 底層星點裝飾 ──
    for (let i = 0; i < 80; i++) {
      const sx = Math.random() * 512;
      const sy = Math.random() * 768;
      const sr = Math.random() * 1.5 + 0.5;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(201, 168, 76, ${Math.random() * 0.4 + 0.1})`;
      ctx.fill();
    }

    // ── 金色外邊框 ──
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, 488, 744);

    // ── 金色內邊框 ──
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 3;
    ctx.strokeRect(28, 28, 456, 712);

    // ── 四角裝飾花紋 ──
    const corners = [
      [48, 48], [464, 48], [48, 720], [464, 720]
    ];
    corners.forEach(([cx, cy]) => {
      ctx.save();
      ctx.translate(cx, cy);
      // 外圓
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(201, 168, 76, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 2;
      ctx.stroke();
      // 內圓
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#d4af37';
      ctx.fill();
      // 十字
      ctx.strokeStyle = 'rgba(201, 168, 76, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-18, 0); ctx.lineTo(18, 0);
      ctx.moveTo(0, -18); ctx.lineTo(0, 18);
      ctx.stroke();
      ctx.restore();
    });

    // ── 中央大符文圓圈 ──
    ctx.save();
    ctx.translate(256, 384);

    // 最外圈 — 符文裝飾環
    ctx.beginPath();
    ctx.arc(0, 0, 150, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(201, 168, 76, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 外圈
    ctx.beginPath();
    ctx.arc(0, 0, 130, 0, Math.PI * 2);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 中圈
    ctx.beginPath();
    ctx.arc(0, 0, 100, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 內圈
    ctx.beginPath();
    ctx.arc(0, 0, 65, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── 12 星形射線 ──
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      ctx.save();
      ctx.rotate(angle);
      // 長射線
      ctx.beginPath();
      ctx.moveTo(0, -65);
      ctx.lineTo(0, -130);
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 末端小圓
      ctx.beginPath();
      ctx.arc(0, -140, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(212, 175, 55, 0.5)';
      ctx.fill();
      ctx.restore();
    }

    // ── 8 個三角形符文 ──
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, -115);
      ctx.lineTo(8, -80);
      ctx.lineTo(-8, -80);
      ctx.closePath();
      ctx.fillStyle = 'rgba(212, 175, 55, 0.6)';
      ctx.fill();
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // ── 中央問號 ──
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 80px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(212, 175, 55, 0.8)';
    ctx.shadowBlur = 20;
    ctx.fillText('？', 0, 0);
    ctx.shadowBlur = 0;

    ctx.restore();

    // ── 上下裝飾帶  ──
    [120, 648].forEach(bandY => {
      ctx.fillStyle = 'rgba(201, 168, 76, 0.08)';
      ctx.fillRect(45, bandY, 422, 2);
      ctx.fillStyle = 'rgba(201, 168, 76, 0.15)';
      ctx.fillRect(45, bandY - 15, 422, 1);
      ctx.fillRect(45, bandY + 15, 422, 1);
    });

    // ── 波紋裝飾線 ──
    ctx.strokeStyle = 'rgba(201, 168, 76, 0.2)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 8; i++) {
      const y = 170 + i * 65;
      if (y > 280 && y < 490) continue; // 跳過中央符文區
      ctx.beginPath();
      ctx.moveTo(50, y);
      for (let x = 50; x < 462; x += 2) {
        ctx.lineTo(x, y + Math.sin(x * 0.04 + i * 0.8) * 6);
      }
      ctx.stroke();
    }

    // ── 上方標題文字 ──
    ctx.fillStyle = 'rgba(212, 175, 55, 0.7)';
    ctx.font = '18px "Noto Serif TC", serif';
    ctx.textAlign = 'center';
    ctx.fillText('✦ 命 運 之 卡 ✦', 256, 80);

    // ── 下方標題文字 ──
    ctx.fillText('✦ FORTUNE  CARD ✦', 256, 710);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * 用 Canvas 2D 繪製卡片正面（運勢內容）
   */
  function createFrontTexture(fortuneData) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');

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

    // 運勢等級
    ctx.font = 'bold 64px "Noto Serif TC", serif';
    ctx.fillStyle = fortuneData.fortune.color;
    ctx.fillText(fortuneData.fortune.level, 256, 330);

    // 運勢描述（自動換行）
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

    // 顏色色塊
    ctx.fillStyle = fortuneData.luckyColor.hex;
    roundRect(ctx, 176, 580, 60, 30, 6);
    ctx.fill();
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 1;
    roundRect(ctx, 176, 580, 60, 30, 6);
    ctx.stroke();

    // 顏色名稱
    ctx.font = '20px "Noto Serif TC", serif';
    ctx.fillStyle = '#e8d5a3';
    ctx.fillText(fortuneData.luckyColor.name, 306, 602);

    // 天氣描述
    ctx.font = '16px "Noto Serif TC", serif';
    ctx.fillStyle = 'rgba(200, 184, 138, 0.6)';
    ctx.fillText(fortuneData.weather.desc, 256, 700);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

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

  /**
   * 建立所有卡片
   */
  function createCards(scene) {
    cardGroup = new THREE.Group();
    cards = [];

    const backTexture = createBackTexture();

    for (let i = 0; i < CARD_COUNT; i++) {
      const fortuneData = FortuneGenerator.generate();
      const frontTexture = createFrontTexture(fortuneData);

      // 正面材質 — emissiveMap 讓文字在暗場景也清晰
      const frontMaterial = new THREE.MeshStandardMaterial({
        map: frontTexture,
        emissiveMap: frontTexture,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.8,
        roughness: 0.3,
        metalness: 0.1,
        side: THREE.FrontSide,
      });

      // 背面材質 — 使用 emissiveMap 讓圖案自發光
      const backMaterial = new THREE.MeshStandardMaterial({
        map: backTexture,
        emissiveMap: backTexture,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.9,
        roughness: 0.3,
        metalness: 0.2,
        side: THREE.FrontSide,
      });

      // 雙面卡片用兩個平面
      const frontGeom = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT);
      const backGeom = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT);

      const frontMesh = new THREE.Mesh(frontGeom, frontMaterial);
      const backMesh = new THREE.Mesh(backGeom, backMaterial);
      // 背面 mesh 旋轉 180°，使它面朝攝影機（卡片背面朝外）
      backMesh.rotation.y = Math.PI;

      const cardObj = new THREE.Group();
      cardObj.add(frontMesh);
      cardObj.add(backMesh);

      // 發光光暈
      const glowGeom = new THREE.PlaneGeometry(CARD_WIDTH * 1.2, CARD_HEIGHT * 1.2);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xc9a84c,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glowMesh = new THREE.Mesh(glowGeom, glowMat);
      glowMesh.position.z = -0.01;
      cardObj.add(glowMesh);

      // 初始：顯示背面（旋轉 PI 讓背面朝向攝影機）
      cardObj.rotation.y = Math.PI;

      const angle = (i / CARD_COUNT) * Math.PI * 2;
      cardObj._orbitAngle = angle;
      cardObj._fortuneData = fortuneData;
      cardObj._glowMesh = glowMesh;
      cardObj._isRevealed = false;
      cardObj._hoverIntensity = 0;

      cardGroup.add(cardObj);
      cards.push(cardObj);
    }

    scene.add(cardGroup);
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
      card.position.z = Math.sin(angle) * ORBIT_RADIUS * 0.4;
      card.position.y = Math.sin(angle * 2 + i) * 0.15; // AR 模式下嶮擺減小

      // 始終讓背面朝向攝影機
      // AR 模式: 利用即時攝影機位置（XR 每垃更新）、普通模式: 國定 z=8
      let camX, camZ;
      if (isARMode && arCamera) {
        // 轉換為卡片局部座標（因為 cardGroup 已設位置）
        const worldCamPos = arCamera.position.clone();
        const localCamPos = cardGroup.worldToLocal(worldCamPos);
        camX = localCamPos.x;
        camZ = localCamPos.z;
      } else {
        camX = 0;
        camZ = 8; // 普通模式攝影機在 z=8
      }

      const dx = camX - card.position.x;
      const dz = camZ - card.position.z;
      const angleToCamera = Math.atan2(dx, dz);
      card.rotation.y = Math.PI + angleToCamera;

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
    card._glowMesh.material.opacity = intensity * 0.4;

    // 震動效果
    if (intensity > 0.5) {
      card.position.x += (Math.random() - 0.5) * 0.02 * intensity;
      card.position.y += (Math.random() - 0.5) * 0.02 * intensity;
    }
  }

  /**
   * 抓取卡片：飛向中央並翻轉
   * @param {number} cardIndex
   * @param {THREE.Scene} scene
   * @param {Function} onComplete
   * @param {THREE.Camera|null} arCamera - AR 模式下傳入攝影機，讓卡片飛到視野前方
   */
  function grabCard(cardIndex, scene, onComplete, arCamera) {
    if (isAnimating || cardIndex < 0 || cardIndex >= cards.length) return;
    const card = cards[cardIndex];
    if (card._isRevealed) return;

    isAnimating = true;
    selectedCard = card;
    card._isRevealed = true;

    // 爆發粒子
    const cardWorldPos = new THREE.Vector3();
    card.getWorldPosition(cardWorldPos);
    ParticleSystem.createBurst(scene, cardWorldPos, card._fortuneData.fortune.color);

    // 目標位置：AR 模式飛到攝影機前方 1.2m，普通模式飛到固定中央
    let targetX = 0, targetY = 0.2, targetZ = 3;
    if (arCamera && cardGroup) {
      const forward = new THREE.Vector3();
      arCamera.getWorldDirection(forward);
      // 世界座標：攝影機前方 1.2m
      const worldTarget = arCamera.position.clone().add(forward.multiplyScalar(1.2));
      // ⚠️ 必須轉換成 cardGroup 局部座標！
      // cardGroup 有 position(0,1.3,-2) 和 scale(1/3)，直接用世界座標會飛到看不到的地方
      const localTarget = cardGroup.worldToLocal(worldTarget);
      targetX = localTarget.x;
      targetY = localTarget.y;
      targetZ = localTarget.z;
    }

    // GSAP 動畫：飛到目標位置（局部座標）
    gsap.to(card.position, {
      x: targetX,
      y: targetY,
      z: targetZ,
      duration: 0.8,
      ease: 'power3.inOut',
    });

    gsap.to(card.rotation, {
      y: 0, // 翻到正面
      z: 0,
      duration: 1.0,
      ease: 'power3.inOut',
      delay: 0.3,
      onComplete: () => {
        isAnimating = false;
        if (onComplete) onComplete(card._fortuneData);
      },
    });

    // 放大卡片
    gsap.to(card.scale, {
      x: 1.3,
      y: 1.3,
      z: 1.3,
      duration: 0.8,
      ease: 'power2.out',
    });

    // 光暈效果
    gsap.to(card._glowMesh.material, {
      opacity: 0.6,
      duration: 0.5,
    });
    gsap.to(card._glowMesh.material, {
      opacity: 0,
      duration: 0.5,
      delay: 1.0,
    });
  }

  /**
   * AR 模式專用抓取：原地翻轉，不飛移位置（避免座標空間轉換複雜度）
   */
  function grabCardAR(cardIndex, scene, onComplete) {
    if (isAnimating || cardIndex < 0 || cardIndex >= cards.length) return;
    const card = cards[cardIndex];
    if (card._isRevealed) return;

    isAnimating = true;
    selectedCard = card;
    card._isRevealed = true;

    // 爆發粒子（世界座標）
    const cardWorldPos = new THREE.Vector3();
    card.getWorldPosition(cardWorldPos);
    ParticleSystem.createBurst(scene, cardWorldPos, card._fortuneData.fortune.color);

    // 原地翻轉（只改 rotation，不動 position）
    gsap.to(card.rotation, {
      y: 0,  // 正面朝向攝影機
      z: 0,
      duration: 1.0,
      ease: 'power3.inOut',
      onComplete: () => {
        isAnimating = false;
        if (onComplete) onComplete(card._fortuneData);
      },
    });

    // 略微放大（原地縮放 1.5x）
    gsap.to(card.scale, {
      x: 1.5, y: 1.5, z: 1.5,
      duration: 0.6,
      ease: 'back.out(1.5)',
    });

    // 強光暈（AR 場景中光暈更醒目）
    gsap.to(card._glowMesh.material, { opacity: 0.8, duration: 0.3 });
    gsap.to(card._glowMesh.material, { opacity: 0, duration: 0.8, delay: 1.2 });
  }

  /**
   * 重置所有卡片
   */
  function resetCards(scene) {
    if (cardGroup) {
      scene.remove(cardGroup);
      cardGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          if (child.material.emissiveMap && child.material.emissiveMap !== child.material.map) {
            child.material.emissiveMap.dispose();
          }
          child.material.dispose();
        }
      });
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
    const cardWorldPos = new THREE.Vector3();

    cards.forEach((card, idx) => {
      if (card._isRevealed) return;
      // 使用世界座標（考慮 cardGroup 的 position/scale/rotation）
      card.getWorldPosition(cardWorldPos);
      const dist = cardWorldPos.distanceTo(worldPos);
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

  /** 設定卡片組的世界座標中心（AR 模式下調整到用戶前方） */
  function setGroupPosition(x, y, z) {
    if (cardGroup) cardGroup.position.set(x, y, z);
  }

  /** 啟用/關閉 AR 模式（調整軌道半徑、速度、縮放和攝影機參照） */
  function setARMode(enabled, camera) {
    isARMode = enabled;
    arCamera = camera || null;
    ORBIT_RADIUS = enabled ? ORBIT_RADIUS_AR : ORBIT_RADIUS_NORMAL;
    orbitSpeed   = enabled ? ORBIT_SPEED_AR  : ORBIT_SPEED_NORMAL;
    // AR 模式下縮小到 1/3： WebXR 1單位=1公尺，原始 1.6m 丹大、縮至約 0.53m 才自然
    if (cardGroup) {
      const s = enabled ? 1 / 3 : 1;
      cardGroup.scale.set(s, s, s);
    }
  }

  return {
    createCards, updateOrbit, setHover, grabCard, grabCardAR,
    resetCards, findClosestCard, getIsAnimating, getCards,
    setGroupPosition, setARMode,
  };
})();
