/**
 * main.js — 主控制器，協調所有模組（引擎無關）
 *
 * 支援三種模式：
 *  1. 手部追蹤 (MediaPipe) — 使用網頁攝影機
 *  2. 滑鼠模式 — 點擊抓取
 *  3. WebXR AR 模式 — 真實世界背景 + XR 手部手勢抓取
 */

const App = (() => {
  const STATE = {
    LOADING: 'loading',
    WELCOME: 'welcome',
    DRAWING: 'drawing',
    RESULT: 'result',
  };

  let currentState = STATE.LOADING;
  let startTime = 0;
  let scene, camera;
  let useCamera = false;
  let animFrameId = null;
  let currentEngine = 'threejs';
  let isARMode = false;

  // AR 手勢狀態
  let arWasPinching = { left: false, right: false };

  // ========== 動態腳本載入 ==========

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('載入失敗: ' + src));
      document.head.appendChild(script);
    });
  }

  async function loadEngine(engineName) {
    if (engineName === 'threejs') {
      await loadScript('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js');
      await loadScript('js/threejs/scene.js');
      await loadScript('js/threejs/particles.js');
      await loadScript('js/threejs/cards.js');
      await loadScript('js/threejs/handTracker.js');
    } else {
      await loadScript('https://cdn.babylonjs.com/babylon.js');
      await loadScript('js/babylon/scene.js');
      await loadScript('js/babylon/particles.js');
      await loadScript('js/babylon/cards.js');
      await loadScript('js/babylon/handTracker.js');
    }
  }

  // ========== 初始化 ==========

  function init() {
    setState(STATE.WELCOME);
    setupEvents();
    setupARButton(); // AR 按鈕永遠顯示，點擊後才檢查支援
  }

  /**
   * AR 按鈕永遠顯示，但如果裝置不支援則點擊後顯示說明
   */
  async function setupARButton() {
    const arBtn = document.getElementById('btn-start-ar');
    arBtn.style.display = ''; // 永遠顯示

    // 檢查是否支援，用 badge 提示
    const supported = await checkARSupport();
    if (!supported) {
      // 不支援時加上不可用標記，but 仍然可以點擊（會顯示說明）
      arBtn.setAttribute('data-ar-unsupported', 'true');
      arBtn.title = '此裝置不支援 WebXR AR\n（需要 Meta Quest 或支援 ARCore 的 Android）';
    }
  }

  async function checkARSupport() {
    if (!navigator.xr) return false;
    try {
      return await navigator.xr.isSessionSupported('immersive-ar');
    } catch {
      return false;
    }
  }

  function initEngine() {
    startTime = performance.now();
    const sceneData = SceneManager.init(document.getElementById('canvas-container'));
    scene = sceneData.scene;
    camera = sceneData.camera;
    ParticleSystem.createStarField(scene);
    HandTracker.createHandCursor(scene);
    animate();
  }

  function getElapsedTime() {
    return (performance.now() - startTime) / 1000;
  }

  // ========== UI 事件 ==========

  function setupEvents() {
    document.getElementById('btn-start-camera').addEventListener('click', async () => {
      const ok = await loadAndInitEngine(); if (!ok) return;
      await startWithCamera();
    });

    document.getElementById('btn-start-mouse').addEventListener('click', async () => {
      const ok = await loadAndInitEngine(); if (!ok) return;
      startWithMouse();
    });

    document.getElementById('btn-start-ar').addEventListener('click', async () => {
      // 先檢查支援
      const supported = await checkARSupport();
      if (!supported) {
        showARUnsupportedModal();
        return;
      }
      // 強制使用 Three.js（AR 目前只實作 Three.js 版）
      const engineSwitch = document.getElementById('engine-switch');
      if (engineSwitch.checked) {
        engineSwitch.checked = false;
        engineSwitch.dispatchEvent(new Event('change'));
      }
      const ok = await loadAndInitEngine(); if (!ok) return;
      await startWithAR();
    });

    document.getElementById('btn-retry').addEventListener('click', () => {
      hideResult();
      CardManager.resetCards(scene);
      setState(STATE.DRAWING);
    });

    const toggle = document.getElementById('engine-switch');
    const labels = document.querySelectorAll('.engine-label');
    toggle.addEventListener('change', () => {
      labels[0].classList.toggle('active', !toggle.checked);
      labels[1].classList.toggle('active', toggle.checked);
    });
    labels.forEach((label, idx) => {
      label.addEventListener('click', () => {
        toggle.checked = idx === 1;
        toggle.dispatchEvent(new Event('change'));
      });
    });
  }

  async function loadAndInitEngine() {
    currentEngine = document.getElementById('engine-switch').checked ? 'babylon' : 'threejs';
    const engineLabel = currentEngine === 'threejs' ? 'Three.js' : 'Babylon.js';
    showLoadingOverlay('正在載入 ' + engineLabel + ' 引擎...');
    try {
      await loadEngine(currentEngine);
    } catch (err) {
      console.error('引擎載入失敗:', err);
      showLoadingOverlay('引擎載入失敗，請重新整理頁面');
      return false;
    }
    initEngine();
    const badge = document.getElementById('engine-badge');
    badge.textContent = engineLabel;
    badge.classList.add('visible');
    return true;
  }

  // ========== 不支援 AR 提示 ==========

  function showARUnsupportedModal() {
    // 建立一個簡單的提示 overlay
    let modal = document.getElementById('ar-unsupported-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ar-unsupported-modal';
      modal.innerHTML = `
        <div class="ar-modal-content">
          <div class="ar-modal-icon">📱</div>
          <h3>AR 模式需要相容裝置</h3>
          <div class="ar-modal-divider"></div>
          <p>WebXR AR + 手部追蹤目前支援：</p>
          <ul>
            <li>✅ <strong>Meta Quest 2 / 3 / Pro</strong>（手部追蹤最完整）</li>
            <li>✅ <strong>Android Chrome</strong>（需 ARCore + WebXR flags）</li>
            <li>❌ iPhone / Safari（尚不支援）</li>
            <li>❌ 桌機瀏覽器</li>
          </ul>
          <p class="ar-modal-hint">請在支援的裝置上開啟此頁面，AR 按鈕將自動啟用。</p>
          <button id="ar-modal-close">我知道了</button>
        </div>
      `;
      document.body.appendChild(modal);
      document.getElementById('ar-modal-close').addEventListener('click', () => {
        modal.classList.remove('visible');
      });
    }
    modal.classList.add('visible');
  }

  // ========== 模式啟動 ==========

  async function startWithCamera() {
    showLoadingOverlay('正在啟動攝影機與手部追蹤...');
    const handReady = await HandTracker.init();
    if (!handReady) {
      showLoadingOverlay('手部追蹤初始化失敗，將使用滑鼠模式');
      await delay(1500); startWithMouse(); return;
    }
    const cameraReady = await HandTracker.startCamera();
    if (!cameraReady) {
      showLoadingOverlay('攝影機啟動失敗，將使用滑鼠模式');
      await delay(1500); startWithMouse(); return;
    }
    useCamera = true;
    hideLoadingOverlay();
    beginDrawing();
  }

  function startWithMouse() {
    useCamera = false;
    HandTracker.setupMouseFallback(camera);
    hideLoadingOverlay();
    beginDrawing();
  }

  /**
   * AR 模式啟動
   * - 進入 WebXR immersive-ar session
   * - 卡片放置在使用者前方
   * - 使用 XRFrame hand pose 偵測 pinch 手勢
   */
  async function startWithAR() {
    showLoadingOverlay('正在進入 AR 模式...');
    isARMode = true;

    try {
      const session = await SceneManager.startAR();

      // 停止普通 rAF
      if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }

      hideLoadingOverlay();
      beginDrawingAR();

      // AR 渲染循環 — 用 setAnimationLoop 而非 rAF
      SceneManager.setARAnimationLoop((timestamp, frame) => {
        const elapsed = getElapsedTime();

        // XR 手部手勢偵測
        if (frame) detectARHandGesture(frame);

        CardManager.updateOrbit(elapsed);
        ParticleSystem.updateStarField(elapsed);
        ParticleSystem.updateBurst();
        SceneManager.render();
      });

      // 更新 badge
      const badge = document.getElementById('engine-badge');
      badge.textContent = 'Three.js · AR';

      showHint('在你面前找到懸浮的命運之卡 — 用拇指和食指捏合抓取');

      // session 結束時恢復普通模式
      session.addEventListener('end', () => {
        isARMode = false;
        arWasPinching = { left: false, right: false };
        // 恢復普通 rAF
        animate();
        showHint('已退出 AR 模式');
      });

    } catch (err) {
      console.error('AR 啟動失敗:', err);
      isARMode = false;
      showLoadingOverlay('AR 啟動失敗：' + err.message);
      await delay(2500);
      startWithMouse();
    }
  }

  /**
   * AR 模式下的開始抽卡（不使用 MediaPipe HandTracker）
   */
  function beginDrawingAR() {
    hideWelcome();

    // AR 模式下卡片放在使用者前方 1.5m，稍微偏下（腰部高度）
    CardManager.createCards(scene);

    // AR 模式下不用 HandTracker 的 onMove/onGrab（改用 XRFrame 手部追蹤）
    // 但仍然需要設定 callback 供 detectARHandGesture 呼叫
    HandTracker.onMove(() => {}); // AR 模式暫時不做 hover
    HandTracker.onGrab((pos) => {
      if (CardManager.getIsAnimating()) return;
      const closest = CardManager.findClosestCard(pos, 1.2);
      if (closest) {
        CardManager.grabCard(closest.index, scene, (fortuneData) => {
          showResult(fortuneData);
          setState(STATE.RESULT);
        });
      }
    });

    setState(STATE.DRAWING);
  }

  /**
   * 偵測 AR 模式下的 XR 手部 pinch 手勢
   * 呼叫 HandTracker.onGrab 的 callback
   */
  function detectARHandGesture(frame) {
    // 檢查兩隻手
    for (const handedness of ['right', 'left']) {
      const handData = SceneManager.getHandPinchPosition(frame, handedness);
      if (!handData) {
        arWasPinching[handedness] = false;
        continue;
      }

      const { position, isPinching } = handData;
      const wasP = arWasPinching[handedness];

      // 僅在捏合「開始」那一刻觸發（上一幀沒在捏，這幀捏了）
      if (!wasP && isPinching) {
        // 呼叫 grab callback
        const grabCb = HandTracker._getGrabCallback ? HandTracker._getGrabCallback() : null;
        if (grabCb) grabCb(position);
      }

      arWasPinching[handedness] = isPinching;
    }
  }

  // ========== 普通渲染循環 ==========

  function beginDrawing() {
    hideWelcome();
    CardManager.createCards(scene);

    HandTracker.onMove((pos) => {
      const closest = CardManager.findClosestCard(pos, 2.0);
      CardManager.getCards().forEach((_, i) => CardManager.setHover(i, 0));
      if (closest) {
        const intensity = 1 - (closest.distance / 2.0);
        CardManager.setHover(closest.index, Math.max(0, intensity));
      }
    });

    HandTracker.onGrab((pos) => {
      if (CardManager.getIsAnimating()) return;
      const closest = CardManager.findClosestCard(pos, 2.0);
      if (closest) {
        CardManager.grabCard(closest.index, scene, (fortuneData) => {
          showResult(fortuneData);
          setState(STATE.RESULT);
        });
      }
    });

    setState(STATE.DRAWING);
    showHint(useCamera ? '用手靠近卡片，捏合手指抓取' : '移動滑鼠靠近卡片，點擊抓取');
  }

  function animate() {
    animFrameId = requestAnimationFrame(animate);
    const elapsed = getElapsedTime();
    if (useCamera) HandTracker.detect();
    CardManager.updateOrbit(elapsed);
    ParticleSystem.updateStarField(elapsed);
    ParticleSystem.updateBurst();
    SceneManager.render();
  }

  // ========== UI 控制 ==========

  function setState(state) {
    currentState = state;
    document.body.setAttribute('data-state', state);
  }

  function hideWelcome() {
    const el = document.getElementById('welcome-screen');
    el.classList.add('fade-out');
    setTimeout(() => { el.style.display = 'none'; }, 600);
  }

  function showResult(fortuneData) {
    const el = document.getElementById('result-overlay');
    el.style.display = 'flex';
    document.getElementById('result-weather-icon').textContent = fortuneData.weather.icon;
    document.getElementById('result-weather-name').textContent = fortuneData.weather.name;
    document.getElementById('result-weather-desc').textContent = fortuneData.weather.desc;
    document.getElementById('result-fortune-level').textContent = fortuneData.fortune.level;
    document.getElementById('result-fortune-level').style.color = fortuneData.fortune.color;
    document.getElementById('result-fortune-message').textContent = fortuneData.fortune.message;
    document.getElementById('result-color-swatch').style.backgroundColor = fortuneData.luckyColor.hex;
    document.getElementById('result-color-name').textContent = fortuneData.luckyColor.name;
    requestAnimationFrame(() => { el.classList.add('visible'); });
  }

  function hideResult() {
    const el = document.getElementById('result-overlay');
    el.classList.remove('visible');
    setTimeout(() => { el.style.display = 'none'; }, 500);
  }

  function showLoadingOverlay(text) {
    const el = document.getElementById('loading-overlay');
    el.querySelector('.loading-text').textContent = text;
    el.style.display = 'flex';
    el.classList.add('visible');
  }

  function hideLoadingOverlay() {
    const el = document.getElementById('loading-overlay');
    el.classList.remove('visible');
    setTimeout(() => { el.style.display = 'none'; }, 400);
  }

  function showHint(text) {
    const el = document.getElementById('hint-bar');
    el.textContent = text;
    el.classList.add('visible');
    setTimeout(() => { el.classList.remove('visible'); }, 6000);
  }

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  window.addEventListener('DOMContentLoaded', init);
  return { init };
})();
