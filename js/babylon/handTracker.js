/**
 * handTracker.js — Babylon.js 版 MediaPipe 手部追蹤與手勢識別
 */

const HandTracker = (() => {
  let handLandmarker = null;
  let videoElement = null;
  let isRunning = false;
  let lastVideoTime = -1;
  let handPosition = null;
  let isGrabbing = false;
  let handVisible = false;
  let handCursor = null;
  let onGrabCallback = null;
  let onMoveCallback = null;

  // 手指追蹤點
  const THUMB_TIP = 4;
  const INDEX_TIP = 8;
  const MIDDLE_TIP = 12;

  /**
   * 初始化 MediaPipe HandLandmarker（引擎無關）
   */
  async function init() {
    try {
      const { FilesetResolver, HandLandmarker } = await import(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/+esm'
      );

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
      );

      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      console.log('✅ HandLandmarker 初始化完成 (Babylon.js)');
      return true;
    } catch (err) {
      console.warn('⚠️ HandLandmarker 初始化失敗，落回滑鼠模式：', err);
      return false;
    }
  }

  /**
   * 啟動攝影機（優先使用真實硬體攝影機）
   */
  async function startCamera() {
    videoElement = document.getElementById('camera-feed');
    if (!videoElement) {
      console.error('找不到 video 元素');
      return false;
    }

    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      tempStream.getTracks().forEach(t => t.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      console.log('📹 偵測到的攝影機裝置：', videoDevices.map(d => d.label));

      const virtualKeywords = ['virtual', 'vcam', 'obs', 'snap', 'manycam', 'xsplit', 'camtwist', 'fake'];
      const realCameras = videoDevices.filter(d => {
        const label = d.label.toLowerCase();
        return !virtualKeywords.some(kw => label.includes(kw));
      });

      const selectedDevice = realCameras.length > 0 ? realCameras[0] : videoDevices[0];
      console.log('🎯 選擇的攝影機：', selectedDevice?.label || '預設');

      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          ...(selectedDevice ? { deviceId: { exact: selectedDevice.deviceId } } : { facingMode: 'user' }),
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.srcObject = stream;
      await videoElement.play();
      isRunning = true;
      console.log('📷 攝影機啟動成功');
      return true;
    } catch (err) {
      console.warn('⚠️ 攝影機啟動失敗：', err);
      return false;
    }
  }

  // ========== 輔助：建立 2D 圓環 Mesh ==========

  function createRingMesh(name, innerRadius, outerRadius, tessellation, scene) {
    const mesh = new BABYLON.Mesh(name, scene);
    const positions = [];
    const indices = [];
    const normals = [];

    for (let i = 0; i <= tessellation; i++) {
      const angle = (i / tessellation) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // 內頂點
      positions.push(cos * innerRadius, sin * innerRadius, 0);
      normals.push(0, 0, 1);

      // 外頂點
      positions.push(cos * outerRadius, sin * outerRadius, 0);
      normals.push(0, 0, 1);
    }

    for (let i = 0; i < tessellation; i++) {
      const i0 = i * 2;
      const i1 = i * 2 + 1;
      const i2 = (i + 1) * 2;
      const i3 = (i + 1) * 2 + 1;

      indices.push(i0, i2, i1);
      indices.push(i1, i2, i3);
    }

    const vd = new BABYLON.VertexData();
    vd.positions = positions;
    vd.indices = indices;
    vd.normals = normals;
    vd.applyToMesh(mesh);

    return mesh;
  }

  /**
   * 建立 3D 手部游標
   */
  function createHandCursor(scene) {
    if (!handPosition) handPosition = new BABYLON.Vector3();

    const cursorGroup = new BABYLON.TransformNode('cursor', scene);

    // 主圓環
    const ring = createRingMesh('cursorRing', 0.12, 0.18, 32, scene);
    const ringMat = new BABYLON.StandardMaterial('ringMat', scene);
    ringMat.emissiveColor = new BABYLON.Color3(0, 206 / 255, 209 / 255);
    ringMat.disableLighting = true;
    ringMat.alpha = 0.7;
    ringMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
    ringMat.backFaceCulling = false;
    ring.material = ringMat;
    ring.parent = cursorGroup;
    ring.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

    // 中心點
    const dot = BABYLON.MeshBuilder.CreateDisc('cursorDot', { radius: 0.05, tessellation: 16 }, scene);
    const dotMat = new BABYLON.StandardMaterial('dotMat', scene);
    dotMat.emissiveColor = BABYLON.Color3.White();
    dotMat.disableLighting = true;
    dotMat.alpha = 0.9;
    dotMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
    dot.material = dotMat;
    dot.parent = cursorGroup;
    dot.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

    // 抓取指示外環
    const outerRing = createRingMesh('cursorOuterRing', 0.22, 0.25, 32, scene);
    const outerRingMat = new BABYLON.StandardMaterial('outerRingMat', scene);
    outerRingMat.emissiveColor = new BABYLON.Color3(1, 215 / 255, 0);
    outerRingMat.disableLighting = true;
    outerRingMat.alpha = 0;
    outerRingMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
    outerRingMat.backFaceCulling = false;
    outerRing.material = outerRingMat;
    outerRing.parent = cursorGroup;
    outerRing.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

    cursorGroup.setEnabled(false);
    cursorGroup._ringMat = ringMat;
    cursorGroup._outerRingMat = outerRingMat;
    handCursor = cursorGroup;
    return cursorGroup;
  }

  /**
   * 偵測一幀
   */
  function detect() {
    if (!isRunning || !handLandmarker || !videoElement) return;
    if (videoElement.currentTime === lastVideoTime) return;
    lastVideoTime = videoElement.currentTime;

    const results = handLandmarker.detectForVideo(videoElement, performance.now());

    if (results.landmarks && results.landmarks.length > 0) {
      const landmarks = results.landmarks[0];
      handVisible = true;

      const palm = landmarks[9]; // MIDDLE_FINGER_MCP

      // 映射到 Babylon.js 空間（自拍鏡頭鏡像翻轉 X）
      const mappedX = -(palm.x - 0.5) * 12;
      const mappedY = -(palm.y - 0.5) * 8;
      const mappedZ = 3 - palm.z * 5;

      handPosition.copyFromFloats(mappedX, mappedY, mappedZ);

      // 判斷抓取手勢
      const thumbTip = landmarks[THUMB_TIP];
      const indexTip = landmarks[INDEX_TIP];

      const pinchDist = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) +
        Math.pow(thumbTip.y - indexTip.y, 2) +
        Math.pow(thumbTip.z - indexTip.z, 2)
      );

      const wasGrabbing = isGrabbing;
      isGrabbing = pinchDist < 0.07;

      // 更新游標
      if (handCursor) {
        handCursor.setEnabled(true);
        handCursor.position.copyFrom(handPosition);
        handCursor._ringMat.emissiveColor = isGrabbing
          ? new BABYLON.Color3(1, 215 / 255, 0)
          : new BABYLON.Color3(0, 206 / 255, 209 / 255);
        handCursor._outerRingMat.alpha = isGrabbing ? 0.6 : 0;

        const scale = isGrabbing ? 0.7 : 1.0;
        handCursor.scaling.setAll(scale);
      }

      // 觸發回調
      if (onMoveCallback) onMoveCallback(handPosition);
      if (!wasGrabbing && isGrabbing && onGrabCallback) {
        onGrabCallback(handPosition);
      }
    } else {
      handVisible = false;
      if (handCursor) handCursor.setEnabled(false);
    }
  }

  /**
   * 滑鼠 fallback —— 使用 Babylon.js 射線
   */
  function setupMouseFallback(camera) {
    const scene = camera.getScene();

    window.addEventListener('mousemove', (e) => {
      const ray = scene.createPickingRay(
        e.clientX, e.clientY,
        BABYLON.Matrix.Identity(),
        camera,
      );

      // 與 z = 2 平面求交
      const t = (2 - ray.origin.z) / ray.direction.z;
      if (t > 0) {
        const worldPos = ray.origin.add(ray.direction.scale(t));
        handPosition.copyFrom(worldPos);
        handVisible = true;

        if (handCursor) {
          handCursor.setEnabled(true);
          handCursor.position.copyFrom(handPosition);
        }
        if (onMoveCallback) onMoveCallback(handPosition);
      }
    });

    window.addEventListener('click', () => {
      if (onGrabCallback) onGrabCallback(handPosition);
    });

    // 觸控支援
    window.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const ray = scene.createPickingRay(
        touch.clientX, touch.clientY,
        BABYLON.Matrix.Identity(),
        camera,
      );

      const t = (2 - ray.origin.z) / ray.direction.z;
      if (t > 0) {
        const worldPos = ray.origin.add(ray.direction.scale(t));
        handPosition.copyFrom(worldPos);
        handVisible = true;

        if (handCursor) {
          handCursor.setEnabled(true);
          handCursor.position.copyFrom(handPosition);
        }
        if (onMoveCallback) onMoveCallback(handPosition);
      }
    }, { passive: false });

    window.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      const ray = scene.createPickingRay(
        touch.clientX, touch.clientY,
        BABYLON.Matrix.Identity(),
        camera,
      );

      const t = (2 - ray.origin.z) / ray.direction.z;
      if (t > 0) {
        const worldPos = ray.origin.add(ray.direction.scale(t));
        handPosition.copyFrom(worldPos);
      }
      if (onGrabCallback) onGrabCallback(handPosition);
    });
  }

  function onGrab(cb) { onGrabCallback = cb; }
  function onMove(cb) { onMoveCallback = cb; }
  function getHandPosition() { return handPosition; }
  function getIsGrabbing() { return isGrabbing; }
  function getHandVisible() { return handVisible; }
  function getIsRunning() { return isRunning; }

  return {
    init, startCamera, createHandCursor, detect,
    setupMouseFallback, onGrab, onMove,
    getHandPosition, getIsGrabbing, getHandVisible, getIsRunning,
  };
})();
