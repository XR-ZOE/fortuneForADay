/**
 * scene.js — Three.js 場景、攝影機、燈光、渲染器 + WebXR AR
 *
 * AR 模式流程：
 *  1. renderer.xr.enabled = true
 *  2. 背景設 null（透明 → 看到手機/眼鏡攝影機畫面）
 *  3. 進入 immersive-ar session，optionally 請求 hand-tracking
 *  4. renderer.setAnimationLoop 替代 rAF，frame 包含 XR 資訊
 *  5. 卡片被放置在使用者前方 1.5m 的世界座標
 */

const SceneManager = (() => {
  let scene, camera, renderer;
  let width, height;
  let isAR = false;
  let xrSession = null;
  let xrReferenceSpace = null;
  // AR 模式下暫存卡片的世界位置偏移（相對於使用者起始點）
  let arCardOffset = new THREE.Vector3(0, 0, -1.5);

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

    // 渲染器 — 帶 alpha 以支援 AR 透明背景
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    // AR 需要 outputColorSpace
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // 燈光
    setupLights();

    // 視窗大小事件
    window.addEventListener('resize', onResize);

    return { scene, camera, renderer };
  }

  function setupLights() {
    // 環境光（AR 模式下會搭配現實光源，這裡設亮一點）
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
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
   * @returns {XRSession}
   */
  async function startAR() {
    if (!navigator.xr) throw new Error('此瀏覽器不支援 WebXR');

    // 啟用 XR 渲染
    renderer.xr.enabled = true;

    // AR 模式下背景透明 → 看到攝影機畫面（現實世界）
    scene.background = null;
    scene.fog = null;

    // 請求 AR session
    // - local: 基礎參考空間（emulator 和大多裝置都支援）
    // - local-floor / hand-tracking / dom-overlay: 可選，不支援也能啟動
    const arOverlayEl = document.getElementById('ar-overlay');
    const sessionInit = {
      requiredFeatures: ['local'],
      optionalFeatures: [
        'local-floor',
        'hand-tracking',
        ...(arOverlayEl ? ['dom-overlay'] : []),
      ],
      ...(arOverlayEl ? { domOverlay: { root: arOverlayEl } } : {}),
    };

    try {
      xrSession = await navigator.xr.requestSession('immersive-ar', sessionInit);

      // 優先用 local-floor，否則回退到 local
      const refSpaceType = xrSession.enabledFeatures?.includes('local-floor')
        ? 'local-floor' : 'local';
      renderer.xr.setReferenceSpaceType(refSpaceType);
      await renderer.xr.setSession(xrSession);

      // 取得 referenceSpace（手部追蹤座標轉換用）
      try {
        xrReferenceSpace = await xrSession.requestReferenceSpace(refSpaceType);
      } catch {
        xrReferenceSpace = await xrSession.requestReferenceSpace('local');
      }

      isAR = true;

      // AR 攝影機位置完全由 XR 系統控制（頭戴或手機 pose）
      camera.position.set(0, 1.6, 0); // 初始眼睛高度約 1.6m

      // 監聽 session 結束（使用者按返回鍵 / 脫下設備）
      xrSession.addEventListener('end', _onARSessionEnd);

      console.log('✅ WebXR AR session 已啟動');
      return xrSession;
    } catch (err) {
      renderer.xr.enabled = false;
      _restoreNormalScene();
      throw err;
    }
  }

  /**
   * AR session 結束後恢復普通場景
   */
  function _onARSessionEnd() {
    console.log('ℹ️ AR session 結束');
    isAR = false;
    xrSession = null;
    xrReferenceSpace = null;
    renderer.xr.enabled = false;
    _restoreNormalScene();
    // 停止 XR 渲染循環，讓 main.js 重新啟動普通 rAF
    renderer.setAnimationLoop(null);
  }

  function _restoreNormalScene() {
    scene.background = new THREE.Color(0x0a0a1a);
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.035);
    camera.position.set(0, 0, 8);
    camera.lookAt(0, 0, 0);
  }

  /**
   * 設定 AR 渲染循環
   * callback(timestamp, frame) — frame 是 XRFrame，包含手部 pose 資訊
   */
  function setARAnimationLoop(callback) {
    renderer.setAnimationLoop(callback);
  }

  /**
   * 取得 XRFrame 中手部關節的世界座標（用於抓取偵測）
   * @param {XRFrame} frame
   * @param {string} handedness - 'left' or 'right'
   * @returns {THREE.Vector3|null}
   */
  function getHandPinchPosition(frame, handedness) {
    if (!frame || !xrReferenceSpace) return null;

    const session = renderer.xr.getSession();
    if (!session) return null;

    for (const inputSource of session.inputSources) {
      if (inputSource.handedness !== handedness) continue;
      if (!inputSource.hand) continue;

      // 取得拇指尖 (thumb-tip) 和食指尖 (index-finger-tip) 的位置
      const thumbTip = inputSource.hand.get('thumb-tip');
      const indexTip = inputSource.hand.get('index-finger-tip');
      if (!thumbTip || !indexTip) continue;

      const thumbPose = frame.getJointPose(thumbTip, xrReferenceSpace);
      const indexPose = frame.getJointPose(indexTip, xrReferenceSpace);
      if (!thumbPose || !indexPose) continue;

      const tx = thumbPose.transform.position;
      const ix = indexPose.transform.position;

      // 計算捏合距離
      const pinchDist = Math.sqrt(
        (tx.x - ix.x) ** 2 + (tx.y - ix.y) ** 2 + (tx.z - ix.z) ** 2
      );

      // 手掌中心位置（拇指和食指中點）
      const centerPos = new THREE.Vector3(
        (tx.x + ix.x) / 2,
        (tx.y + ix.y) / 2,
        (tx.z + ix.z) / 2,
      );

      return { position: centerPos, pinchDist, isPinching: pinchDist < 0.04 };
    }
    return null;
  }

  /**
   * 停止 AR session
   */
  async function stopAR() {
    if (xrSession) {
      try { await xrSession.end(); } catch (e) { /* 忽略 */ }
    }
  }

  function onResize() {
    width = window.innerWidth;
    height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  /**
   * 取得手部指向射線（用食指尖 + 手腕方向）
   * @param {XRFrame} frame
   * @param {string} handedness - 'left' | 'right'
   * @returns {{ origin, direction, isPinching }|null}
   */
  function getHandRay(frame, handedness) {
    if (!frame || !xrReferenceSpace) return null;
    const session = renderer.xr.getSession();
    if (!session) return null;

    for (const inputSource of session.inputSources) {
      if (inputSource.handedness !== handedness) continue;
      if (!inputSource.hand) continue;

      const wristJ     = inputSource.hand.get('wrist');
      const indexTipJ  = inputSource.hand.get('index-finger-tip');
      const thumbTipJ  = inputSource.hand.get('thumb-tip');
      if (!wristJ || !indexTipJ) continue;

      const wristPose    = frame.getJointPose(wristJ,    xrReferenceSpace);
      const indexTipPose = frame.getJointPose(indexTipJ, xrReferenceSpace);
      if (!wristPose || !indexTipPose) continue;

      const wp = wristPose.transform.position;
      const ip = indexTipPose.transform.position;

      // 射線原點：食指尖
      const origin = new THREE.Vector3(ip.x, ip.y, ip.z);

      // 射線方向：手腕 → 食指尖（穩定的指向方向）
      const wristVec = new THREE.Vector3(wp.x, wp.y, wp.z);
      const direction = origin.clone().sub(wristVec).normalize();

      // 捏合偵測：拇指尖 + 食指尖距離 < 4cm
      let isPinching = false;
      if (thumbTipJ) {
        const thumbPose = frame.getJointPose(thumbTipJ, xrReferenceSpace);
        if (thumbPose) {
          const tp = thumbPose.transform.position;
          const d = Math.sqrt((ip.x-tp.x)**2 + (ip.y-tp.y)**2 + (ip.z-tp.z)**2);
          isPinching = d < 0.04;
        }
      }

      return { origin, direction, isPinching, handedness };
    }
    return null;
  }

  /**
   * 取得 XR controller 的射線（原點 + 方向）
   * @param {XRFrame} frame
   * @param {XRInputSource} inputSource
   * @returns {{ origin, direction }|null}
   */
  function getControllerRay(frame, inputSource) {
    if (!xrReferenceSpace || !inputSource.targetRaySpace) return null;
    const pose = frame.getPose(inputSource.targetRaySpace, xrReferenceSpace);
    if (!pose) return null;
    const p = pose.transform.position;
    const o = pose.transform.orientation;
    const origin    = new THREE.Vector3(p.x, p.y, p.z);
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(
      new THREE.Quaternion(o.x, o.y, o.z, o.w)
    );
    return { origin, direction };
  }

  function render() {
    renderer.render(scene, camera);
  }

  function getScene() { return scene; }
  function getCamera() { return camera; }
  function getRenderer() { return renderer; }
  function getIsAR() { return isAR; }
  function getARCardOffset() { return arCardOffset; }
  function getXRReferenceSpace() { return xrReferenceSpace; }

  return {
    init, render, getScene, getCamera, getRenderer,
    isARSupported, startAR, stopAR, setARAnimationLoop, getIsAR,
    getHandPinchPosition, getHandRay, getControllerRay,
    getARCardOffset, getXRReferenceSpace,
  };
})();
