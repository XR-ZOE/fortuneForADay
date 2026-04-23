/**
 * scene.js — Babylon.js 場景、攝影機、燈光、渲染引擎 + WebXR AR
 */

const SceneManager = (() => {
  let engine, scene, camera;
  let isAR = false;
  let xrHelper = null;

  function init(container) {
    const canvas = document.createElement('canvas');
    canvas.id = 'renderCanvas';
    canvas.style.cssText = 'width:100%;height:100%;display:block;outline:none;';
    container.appendChild(canvas);

    engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      powerPreference: 'high-performance',
    });

    scene = new BABYLON.Scene(engine);
    scene.useRightHandedSystem = true;
    scene.clearColor = new BABYLON.Color4(10 / 255, 10 / 255, 26 / 255, 1);
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.035;
    scene.fogColor = new BABYLON.Color3(10 / 255, 10 / 255, 26 / 255);

    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType =
      BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.exposure = 1.2;

    camera = new BABYLON.FreeCamera('camera', new BABYLON.Vector3(0, 0, 8), scene);
    camera.setTarget(BABYLON.Vector3.Zero());
    camera.fov = 60 * (Math.PI / 180);
    camera.minZ = 0.1;
    camera.maxZ = 100;
    camera.inputs.clear();

    setupLights();
    window.addEventListener('resize', onResize);

    return { scene, camera, renderer: engine };
  }

  function setupLights() {
    const ambient = new BABYLON.HemisphericLight('ambient', new BABYLON.Vector3(0, 1, 0), scene);
    ambient.diffuse = new BABYLON.Color3(26 / 255, 10 / 255, 46 / 255);
    ambient.groundColor = new BABYLON.Color3(26 / 255, 10 / 255, 46 / 255);
    ambient.intensity = 0.6;

    const mainLight = new BABYLON.PointLight('mainLight', new BABYLON.Vector3(0, 6, 5), scene);
    mainLight.diffuse = new BABYLON.Color3(1, 215 / 255, 0);
    mainLight.intensity = 1.5; mainLight.range = 30;

    const fillLight = new BABYLON.PointLight('fillLight', new BABYLON.Vector3(-5, 2, 3), scene);
    fillLight.diffuse = new BABYLON.Color3(0, 206 / 255, 209 / 255);
    fillLight.intensity = 0.8; fillLight.range = 25;

    const accentLight = new BABYLON.PointLight('accentLight', new BABYLON.Vector3(5, -2, 4), scene);
    accentLight.diffuse = new BABYLON.Color3(139 / 255, 92 / 255, 246 / 255);
    accentLight.intensity = 0.6; accentLight.range = 20;

    const bottomLight = new BABYLON.PointLight('bottomLight', new BABYLON.Vector3(0, -5, 2), scene);
    bottomLight.diffuse = new BABYLON.Color3(74 / 255, 26 / 255, 107 / 255);
    bottomLight.intensity = 0.3; bottomLight.range = 15;
  }

  // ========== WebXR AR ==========

  async function isARSupported() {
    if (!navigator.xr) return false;
    try { return await navigator.xr.isSessionSupported('immersive-ar'); }
    catch { return false; }
  }

  /**
   * 啟動 AR session
   * 回傳與 Three.js 版相容的 session-like 物件（支援 addEventListener('end', cb)）
   */
  async function startAR() {
    if (!navigator.xr) throw new Error('WebXR 不支援');

    scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
    scene.fogMode = BABYLON.Scene.FOGMODE_NONE;

    const arOverlayEl = document.getElementById('ar-overlay');

    try {
      xrHelper = await scene.createDefaultXRExperienceAsync({
        uiOptions: {
          sessionMode: 'immersive-ar',
          referenceSpaceType: 'local-floor',
          optionalFeatures: [
            'local-floor',
            'hand-tracking',
            ...(arOverlayEl ? ['dom-overlay'] : []),
          ],
          ...(arOverlayEl ? { domOverlay: { root: arOverlayEl } } : {}),
        },
        optionalFeatures: true,
      });

      // 嘗試手部追蹤
      try {
        xrHelper.baseExperience.featuresManager.enableFeature(
          BABYLON.WebXRFeatureName.HAND_TRACKING, 'latest',
          { xrInput: xrHelper.input }
        );
        console.log('✅ Babylon WebXR 手部追蹤已啟用');
      } catch (e) {
        console.warn('⚠️ 手部追蹤不可用:', e);
      }

      isAR = true;

      // 包裝成 session-like 物件，供 main.js 的 session.addEventListener('end', ...) 使用
      const endListeners = [];
      xrHelper.baseExperience.onStateChangedObservable.add((state) => {
        if (state === BABYLON.WebXRState.NOT_IN_XR) {
          isAR = false;
          scene.clearColor = new BABYLON.Color4(10 / 255, 10 / 255, 26 / 255, 1);
          scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
          scene.fogDensity = 0.035;
          camera.position.set(0, 0, 8);
          camera.setTarget(BABYLON.Vector3.Zero());
          endListeners.forEach(cb => cb());
        }
      });

      return {
        addEventListener(event, cb) {
          if (event === 'end') endListeners.push(cb);
        },
      };
    } catch (err) {
      scene.clearColor = new BABYLON.Color4(10 / 255, 10 / 255, 26 / 255, 1);
      scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
      throw err;
    }
  }

  /**
   * 設定 AR 渲染循環（callback(timestamp, null) 與 Three.js 介面同）
   */
  function setARAnimationLoop(callback) {
    engine.stopRenderLoop();
    engine.runRenderLoop(() => callback(performance.now(), null));
  }

  async function stopAR() {
    if (xrHelper && xrHelper.baseExperience) {
      await xrHelper.baseExperience.exitXRAsync();
    }
  }

  /**
   * 取得 XR 攝影機（追蹤頭部/手機姿態）
   * Babylon XR Helper 在進入 XR 後會更新 baseExperience.camera
   */
  function getXRCamera() {
    if (xrHelper && xrHelper.baseExperience && xrHelper.baseExperience.camera) {
      return xrHelper.baseExperience.camera;
    }
    return camera;
  }

  function onResize() { engine.resize(); }
  function render() { scene.render(); }
  function getScene() { return scene; }
  function getCamera() { return camera; }
  function getRenderer() { return engine; }
  function getIsAR() { return isAR; }

  return {
    init, render, getScene, getCamera, getRenderer, getXRCamera,
    isARSupported, startAR, stopAR, setARAnimationLoop, getIsAR,
  };
})();
