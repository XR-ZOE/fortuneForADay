/**
 * scene.js — Babylon.js 場景、攝影機、燈光、渲染引擎 + WebXR AR
 */

const SceneManager = (() => {
  let engine, scene, camera;
  let isAR = false;
  let xrHelper = null;

  function init(container) {
    // 建立 Canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'renderCanvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.outline = 'none';
    container.appendChild(canvas);

    // 引擎
    engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      powerPreference: 'high-performance',
    });

    // 場景
    scene = new BABYLON.Scene(engine);
    scene.useRightHandedSystem = true; // 對齊 Three.js 座標系統
    scene.clearColor = new BABYLON.Color4(10 / 255, 10 / 255, 26 / 255, 1);

    // 霧效
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.035;
    scene.fogColor = new BABYLON.Color3(10 / 255, 10 / 255, 26 / 255);

    // 色調映射（ACES Filmic）
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType =
      BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.exposure = 1.2;

    // 攝影機 — 與 Three.js 版完全相同的位置
    camera = new BABYLON.FreeCamera('camera', new BABYLON.Vector3(0, 0, 8), scene);
    camera.setTarget(BABYLON.Vector3.Zero());
    camera.fov = 60 * (Math.PI / 180);
    camera.minZ = 0.1;
    camera.maxZ = 100;
    camera.inputs.clear(); // 禁用使用者控制攝影機

    // 燈光
    setupLights();

    // 視窗大小事件
    window.addEventListener('resize', onResize);

    return { scene, camera, renderer: engine };
  }

  function setupLights() {
    // 環境光 — 柔和的深紫色基調
    const ambient = new BABYLON.HemisphericLight('ambient', new BABYLON.Vector3(0, 1, 0), scene);
    ambient.diffuse = new BABYLON.Color3(26 / 255, 10 / 255, 46 / 255);
    ambient.groundColor = new BABYLON.Color3(26 / 255, 10 / 255, 46 / 255);
    ambient.intensity = 0.6;

    // 主燈 — 上方偏暖金光
    const mainLight = new BABYLON.PointLight('mainLight', new BABYLON.Vector3(0, 6, 5), scene);
    mainLight.diffuse = new BABYLON.Color3(1, 215 / 255, 0);
    mainLight.intensity = 1.5;
    mainLight.range = 30;

    // 補光 — 左側青色冷光
    const fillLight = new BABYLON.PointLight('fillLight', new BABYLON.Vector3(-5, 2, 3), scene);
    fillLight.diffuse = new BABYLON.Color3(0, 206 / 255, 209 / 255);
    fillLight.intensity = 0.8;
    fillLight.range = 25;

    // 補光 — 右側紫色
    const accentLight = new BABYLON.PointLight('accentLight', new BABYLON.Vector3(5, -2, 4), scene);
    accentLight.diffuse = new BABYLON.Color3(139 / 255, 92 / 255, 246 / 255);
    accentLight.intensity = 0.6;
    accentLight.range = 20;

    // 底部微弱反射光
    const bottomLight = new BABYLON.PointLight('bottomLight', new BABYLON.Vector3(0, -5, 2), scene);
    bottomLight.diffuse = new BABYLON.Color3(74 / 255, 26 / 255, 107 / 255);
    bottomLight.intensity = 0.3;
    bottomLight.range = 15;
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

    // AR 背景透明
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
    scene.fogMode = BABYLON.Scene.FOGMODE_NONE;

    try {
      xrHelper = await scene.createDefaultXRExperienceAsync({
        uiOptions: {
          sessionMode: 'immersive-ar',
          referenceSpaceType: 'local-floor',
        },
        optionalFeatures: true,
      });

      // 嘗試啟用手部追蹤
      try {
        const handTracking = xrHelper.baseExperience.featuresManager.enableFeature(
          BABYLON.WebXRFeatureName.HAND_TRACKING,
          'latest',
          {
            xrInput: xrHelper.input,
          }
        );
        console.log('✅ Babylon.js WebXR 手部追蹤已啟用');
      } catch (e) {
        console.warn('⚠️ 手部追蹤不可用:', e);
      }

      isAR = true;

      // 監聽 session 結束
      xrHelper.baseExperience.onStateChangedObservable.add((state) => {
        if (state === BABYLON.WebXRState.NOT_IN_XR) {
          isAR = false;
          scene.clearColor = new BABYLON.Color4(10 / 255, 10 / 255, 26 / 255, 1);
          scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
          scene.fogDensity = 0.035;
          camera.position.set(0, 0, 8);
          camera.setTarget(BABYLON.Vector3.Zero());
        }
      });

      return xrHelper;
    } catch (err) {
      scene.clearColor = new BABYLON.Color4(10 / 255, 10 / 255, 26 / 255, 1);
      scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
      throw err;
    }
  }

  /**
   * 設定 AR 模式的渲染循環（Babylon 使用 runRenderLoop）
   */
  function setARAnimationLoop(callback) {
    engine.stopRenderLoop();
    engine.runRenderLoop(callback);
  }

  /**
   * 停止 AR session
   */
  async function stopAR() {
    if (xrHelper && xrHelper.baseExperience) {
      await xrHelper.baseExperience.exitXRAsync();
    }
  }

  function onResize() {
    engine.resize();
  }

  function render() {
    scene.render();
  }

  function getScene() { return scene; }
  function getCamera() { return camera; }
  function getRenderer() { return engine; }
  function getIsAR() { return isAR; }

  return {
    init, render, getScene, getCamera, getRenderer,
    isARSupported, startAR, stopAR, setARAnimationLoop, getIsAR,
  };
})();
