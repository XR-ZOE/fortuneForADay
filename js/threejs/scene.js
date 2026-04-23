/**
 * scene.js — Three.js 場景、攝影機、燈光、渲染器 + WebXR AR
 */

const SceneManager = (() => {
  let scene, camera, renderer;
  let width, height;
  let isAR = false;
  let xrSession = null;

  function init(container) {
    width = window.innerWidth;
    height = window.innerHeight;

    // 場景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.035);

    // 攝影機
    camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.set(0, 0, 8);
    camera.lookAt(0, 0, 0);

    // 渲染器
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,  // AR 需要透明背景
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // 燈光
    setupLights();

    // 視窗大小事件
    window.addEventListener('resize', onResize);

    return { scene, camera, renderer };
  }

  function setupLights() {
    // 環境光 — 柔和的深紫色基調
    const ambient = new THREE.AmbientLight(0x1a0a2e, 0.6);
    scene.add(ambient);

    // 主燈 — 上方偏暖金光
    const mainLight = new THREE.PointLight(0xffd700, 1.5, 30);
    mainLight.position.set(0, 6, 5);
    scene.add(mainLight);

    // 補光 — 左側青色冷光
    const fillLight = new THREE.PointLight(0x00ced1, 0.8, 25);
    fillLight.position.set(-5, 2, 3);
    scene.add(fillLight);

    // 補光 — 右側紫色
    const accentLight = new THREE.PointLight(0x8b5cf6, 0.6, 20);
    accentLight.position.set(5, -2, 4);
    scene.add(accentLight);

    // 底部微弱反射光
    const bottomLight = new THREE.PointLight(0x4a1a6b, 0.3, 15);
    bottomLight.position.set(0, -5, 2);
    scene.add(bottomLight);
  }

  // ========== WebXR AR ==========

  /**
   * 檢查是否支援 WebXR AR
   */
  async function isARSupported() {
    if (!navigator.xr) return false;
    try {
      return await navigator.xr.isSessionSupported('immersive-ar');
    } catch {
      return false;
    }
  }

  /**
   * 啟動 AR session
   */
  async function startAR() {
    if (!navigator.xr) throw new Error('WebXR 不支援');

    // 開啟 XR
    renderer.xr.enabled = true;

    // AR 下背景透明（看到攝影機畫面）
    scene.background = null;
    scene.fog = null;

    // 請求 session — 嘗試使用 hand-tracking，不可用則 fallback
    const sessionInit = {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking'],
    };

    try {
      xrSession = await navigator.xr.requestSession('immersive-ar', sessionInit);
      renderer.xr.setReferenceSpaceType('local-floor');
      await renderer.xr.setSession(xrSession);

      isAR = true;

      // 攝影機位置在 AR 由 XR 系統控制
      camera.position.set(0, 0, 0);

      // 監聽 session 結束
      xrSession.addEventListener('end', () => {
        isAR = false;
        xrSession = null;
        renderer.xr.enabled = false;
        // 恢復場景背景
        scene.background = new THREE.Color(0x0a0a1a);
        scene.fog = new THREE.FogExp2(0x0a0a1a, 0.035);
        camera.position.set(0, 0, 8);
        camera.lookAt(0, 0, 0);
      });

      return xrSession;
    } catch (err) {
      renderer.xr.enabled = false;
      scene.background = new THREE.Color(0x0a0a1a);
      scene.fog = new THREE.FogExp2(0x0a0a1a, 0.035);
      throw err;
    }
  }

  /**
   * 設定 AR 模式的渲染循環（使用 setAnimationLoop 取代 rAF）
   */
  function setARAnimationLoop(callback) {
    renderer.setAnimationLoop(callback);
  }

  /**
   * 停止 AR session
   */
  async function stopAR() {
    if (xrSession) {
      await xrSession.end();
    }
  }

  function onResize() {
    width = window.innerWidth;
    height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function render() {
    renderer.render(scene, camera);
  }

  function getScene() { return scene; }
  function getCamera() { return camera; }
  function getRenderer() { return renderer; }
  function getIsAR() { return isAR; }

  return {
    init, render, getScene, getCamera, getRenderer,
    isARSupported, startAR, stopAR, setARAnimationLoop, getIsAR,
  };
})();
