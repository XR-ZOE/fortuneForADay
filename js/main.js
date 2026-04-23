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

      showHint('AR 抽卡 — 點擊螢幕 / 捏合手指 / 按 Trigger 皆可抓取');

      // session 結束時恢復普通模式
      session.addEventListener('end', () => {
        isARMode = false;
        arWasPinching = { left: false, right: false };
        CardManager.setARMode(false, null); // 恢復普通軌道
        CardManager.setGroupPosition(0, 0, 0);
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
    CardManager.createCards(scene);

    // AR 模式關鍵設定：
    // 1. 啟用 AR 軌道（小半徑 1m，動態朝向攝影機）
    // 2. 把卡片群組移到使用者「前方 2m、胸部高度 1.3m」
    CardManager.setARMode(true, camera);
    CardManager.setGroupPosition(0, 1.3, -2); // local-floor: Y=0 是地板，-Z 是前方

    HandTracker.onMove(() => {});
    HandTracker.onGrab((pos) => {
      if (CardManager.getIsAnimating()) return;
      // AR 卡片縮小 1/3，加大關益區（world space）至 2.0m
      const closest = CardManager.findClosestCard(pos, 2.0);
      if (closest) {
        CardManager.grabCard(closest.index, scene, (fortuneData) => {
          showResult(fortuneData);
          setState(STATE.RESULT);
        });
      }
    });

    // 螢幕點擊 / 觸碰 fallback（手機 AR 或 Emulator 滑鼠點擊）
    _setupARTouchAndController();
    setState(STATE.DRAWING);
  }

  /** 在 canvas 上註冊觸碰/點擊事件作為 AR 抓取 fallback */
  function _setupARTouchAndController() {
    const canvas = document.querySelector('#canvas-container canvas');
    if (!canvas) return;
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      _triggerARGrabNearest();
    }, { passive: false });
    canvas.addEventListener('click', () => {
      if (isARMode) _triggerARGrabNearest();
    });
  }

  /** 用攝影機前方 1m 作探針，抓取最近的卡片 */
  function _triggerARGrabNearest() {
    const grabCb = HandTracker._getGrabCallback ? HandTracker._getGrabCallback() : null;
    if (!grabCb || CardManager.getIsAnimating()) return;
    const cam = SceneManager.getCamera();
    if (!cam) return;
    const forward = new THREE.Vector3();
    cam.getWorldDirection(forward);
    // AR 卡片組在使用者前方 2m，探針打到那個距離
    const probePos = cam.position.clone().add(forward.multiplyScalar(2.0));
    grabCb(probePos);
  }

  /**
   * AR 模式輸入偵測 — 每幀呼叫，同時支援三種方式（互不干擾）：
   *  1. XRHand pinch — 拇指+食指捏合 (Quest 手部追蹤 / 部分 Android)
   *  2. XR controller trigger — 按下 trigger (Quest 控制器 / Emulator)
   *  3. 螢幕點擊/觸碰 — 在 beginDrawingAR 中已單獨註冊 canvas 事件
   */
  function detectARHandGesture(frame) {
    if (!frame) return;
    const session = frame.session;
    if (!session) return;

    for (const inputSource of session.inputSources) {
      const h = inputSource.handedness; // 'left' | 'right' | 'none'

      // ---- 方式 1: XRHand pinch 手勢 ----
      if (inputSource.hand) {
        const handData = SceneManager.getHandPinchPosition(frame, h);
        if (handData) {
          const isPinching = handData.isPinching;
          const wasP = arWasPinching[h] ?? false;
          if (!wasP && isPinching) {
            const grabCb = HandTracker._getGrabCallback?.();
            if (grabCb) grabCb(handData.position);
          }
          arWasPinching[h] = isPinching;
        } else {
          arWasPinching[h] = false;
        }
        continue; // 有手部追蹤就跳過 gamepad 檢查
      }

      // ---- 方式 2: XR controller trigger ----
      if (inputSource.gamepad) {
        const triggerPressed = inputSource.gamepad.buttons?.[0]?.pressed ?? false;
        const key = h + '_trigger';
        const wasT = arWasPinching[key] ?? false;
        if (!wasT && triggerPressed) {
          // 用 controller 射線方向延伸 1m 作為探針位置
          const ray = _getControllerRayPosition(frame, inputSource);
          const grabCb = HandTracker._getGrabCallback?.();
          if (grabCb && ray) grabCb(ray);
        }
        arWasPinching[key] = triggerPressed;
      }
    }
  }

  /** 取得 XR controller 射線在世界座標中延伸 1m 的位置 */
  function _getControllerRayPosition(frame, inputSource) {
    const xrRefSpace = SceneManager.getXRReferenceSpace();
    if (!xrRefSpace || !inputSource.targetRaySpace) return null;
    const pose = frame.getPose(inputSource.targetRaySpace, xrRefSpace);
    if (!pose) return null;
    const p = pose.transform.position;
    const o = pose.transform.orientation;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
      new THREE.Quaternion(o.x, o.y, o.z, o.w)
    );
    return new THREE.Vector3(p.x, p.y, p.z).add(dir);
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
