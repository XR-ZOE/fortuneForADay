/**
 * main.js — 主控制器，協調所有模組
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
  let clock = null;
  let scene, camera;
  let useCamera = false;
  let animFrameId = null;

  /**
   * 初始化 App
   */
  async function init() {
    clock = new THREE.Clock();

    // 1. 初始化 Three.js 場景
    const sceneData = SceneManager.init(document.getElementById('canvas-container'));
    scene = sceneData.scene;
    camera = sceneData.camera;

    // 2. 建立粒子星空
    ParticleSystem.createStarField(scene);

    // 3. 建立手部游標
    HandTracker.createHandCursor(scene);

    // 4. 設定狀態
    setState(STATE.WELCOME);

    // 5. 開始渲染循環
    animate();

    // 6. 綁定事件
    setupEvents();
  }

  /**
   * 設定 UI 事件
   */
  function setupEvents() {
    // 啟動按鈕 — 使用攝影機
    document.getElementById('btn-start-camera').addEventListener('click', async () => {
      await startWithCamera();
    });

    // 啟動按鈕 — 使用滑鼠
    document.getElementById('btn-start-mouse').addEventListener('click', () => {
      startWithMouse();
    });

    // 再抽一次按鈕
    document.getElementById('btn-retry').addEventListener('click', () => {
      hideResult();
      CardManager.resetCards(scene);
      setState(STATE.DRAWING);
    });
  }

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

  /**
   * 渲染循環
   */
  function animate() {
    animFrameId = requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();

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
