/**
 * main.js — 主控制器，協調所有模組（引擎無關）
 *
 * 根據使用者在 Welcome Screen 的選擇動態載入 Three.js 或 Babylon.js，
 * 然後透過相同的全域模組介面 (SceneManager / CardManager / ParticleSystem / HandTracker)
 * 執行抽卡流程。
 */

const App = (() => {
  // 狀態
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

  /**
   * 載入選定的 3D 引擎及其模組
   */
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

  /**
   * 頁面載入後，只顯示 Welcome Screen（不載入 3D 引擎）
   */
  function init() {
    setState(STATE.WELCOME);
    setupEvents();
  }

  /**
   * 初始化 3D 引擎（在使用者選擇後呼叫）
   */
  function initEngine() {
    startTime = performance.now();

    const sceneData = SceneManager.init(document.getElementById('canvas-container'));
    scene = sceneData.scene;
    camera = sceneData.camera;

    // 建立粒子星空
    ParticleSystem.createStarField(scene);

    // 建立手部游標
    HandTracker.createHandCursor(scene);

    // 開始渲染循環
    animate();
  }

  /**
   * 引擎無關的時間計算
   */
  function getElapsedTime() {
    return (performance.now() - startTime) / 1000;
  }

  // ========== UI 事件 ==========

  function setupEvents() {
    // 啟動按鈕 — 使用攝影機
    document.getElementById('btn-start-camera').addEventListener('click', async () => {
      const ok = await loadAndInitEngine();
      if (!ok) return;
      await startWithCamera();
    });

    // 啟動按鈕 — 使用滑鼠
    document.getElementById('btn-start-mouse').addEventListener('click', async () => {
      const ok = await loadAndInitEngine();
      if (!ok) return;
      startWithMouse();
    });

    // 再抽一次按鈕
    document.getElementById('btn-retry').addEventListener('click', () => {
      hideResult();
      CardManager.resetCards(scene);
      setState(STATE.DRAWING);
    });

    // 引擎切換 Toggle — UI 反饋
    const toggle = document.getElementById('engine-switch');
    const labels = document.querySelectorAll('.engine-label');

    toggle.addEventListener('change', () => {
      labels[0].classList.toggle('active', !toggle.checked);
      labels[1].classList.toggle('active', toggle.checked);
    });

    // 點擊 Label 也可切換
    labels.forEach((label, idx) => {
      label.addEventListener('click', () => {
        toggle.checked = idx === 1;
        toggle.dispatchEvent(new Event('change'));
      });
    });
  }

  /**
   * 載入並初始化引擎（共用流程）
   */
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

    // 顯示引擎 Badge
    const badge = document.getElementById('engine-badge');
    badge.textContent = engineLabel;
    badge.classList.add('visible');

    return true;
  }

  // ========== 模式啟動 ==========

  /**
   * 使用攝影機模式啟動
   */
  async function startWithCamera() {
    showLoadingOverlay('正在啟動攝影機與手部追蹤...');

    const handReady = await HandTracker.init();
    if (!handReady) {
      showLoadingOverlay('手部追蹤初始化失敗，將使用滑鼠模式');
      await delay(1500);
      startWithMouse();
      return;
    }

    const cameraReady = await HandTracker.startCamera();
    if (!cameraReady) {
      showLoadingOverlay('攝影機啟動失敗，將使用滑鼠模式');
      await delay(1500);
      startWithMouse();
      return;
    }

    useCamera = true;
    hideLoadingOverlay();
    beginDrawing();
  }

  /**
   * 使用滑鼠模式啟動
   */
  function startWithMouse() {
    useCamera = false;
    HandTracker.setupMouseFallback(camera);
    hideLoadingOverlay();
    beginDrawing();
  }

  /**
   * 開始抽卡
   */
  function beginDrawing() {
    hideWelcome();
    CardManager.createCards(scene);

    // 設定手部事件
    HandTracker.onMove((pos) => {
      const closest = CardManager.findClosestCard(pos, 2.0);
      // 重置所有卡片
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

    // 顯示操作提示
    showHint(useCamera ? '用手靠近卡片，捏合手指抓取' : '移動滑鼠靠近卡片，點擊抓取');
  }

  // ========== 渲染循環 ==========

  function animate() {
    animFrameId = requestAnimationFrame(animate);
    const elapsed = getElapsedTime();

    // 手部追蹤偵測
    if (useCamera) {
      HandTracker.detect();
    }

    // 卡片軌道旋轉
    CardManager.updateOrbit(elapsed);

    // 粒子更新
    ParticleSystem.updateStarField(elapsed);
    ParticleSystem.updateBurst();

    // 渲染
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

    requestAnimationFrame(() => {
      el.classList.add('visible');
    });
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
    setTimeout(() => { el.classList.remove('visible'); }, 5000);
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 頁面載入即初始化
  window.addEventListener('DOMContentLoaded', init);

  return { init };
})();
