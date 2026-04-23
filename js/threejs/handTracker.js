/**
 * handTracker.js — MediaPipe 手部追蹤與手勢識別
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
  const WRIST = 0;

  /**
   * 初始化 MediaPipe HandLandmarker
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

      console.log('✅ HandLandmarker 初始化完成');
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
      // 先取得一次權限，讓 enumerateDevices 能拿到完整名稱
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      tempStream.getTracks().forEach(t => t.stop());

      // 列舉所有攝影機裝置
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      console.log('📹 偵測到的攝影機裝置：', videoDevices.map(d => d.label));

      // 過濾掉虛擬攝影機
      const virtualKeywords = ['virtual', 'vcam', 'obs', 'snap', 'manycam', 'xsplit', 'camtwist', 'fake'];
      const realCameras = videoDevices.filter(d => {
        const label = d.label.toLowerCase();
        return !virtualKeywords.some(kw => label.includes(kw));
      });

      // 優先使用真實攝影機，若都沒有則用第一個
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

  /**
   * 建立 3D 手部游標
   */
  function createHandCursor(scene) {
    if (!handPosition) handPosition = new THREE.Vector3();
    const cursorGroup = new THREE.Group();

    // 主圓環
    const ringGeom = new THREE.RingGeometry(0.12, 0.18, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ced1,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    cursorGroup.add(ring);

    // 中心點
    const dotGeom = new THREE.CircleGeometry(0.05, 16);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const dot = new THREE.Mesh(dotGeom, dotMat);
    cursorGroup.add(dot);

    // 抓取指示外環
    const outerRingGeom = new THREE.RingGeometry(0.22, 0.25, 32);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const outerRing = new THREE.Mesh(outerRingGeom, outerRingMat);
    cursorGroup.add(outerRing);

    cursorGroup.visible = false;
    cursorGroup._ringMat = ringMat;
    cursorGroup._outerRingMat = outerRingMat;
    scene.add(cursorGroup);
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

      // 取手掌中心（食指根部與手腕的中點）
      const palm = landmarks[9]; // MIDDLE_FINGER_MCP
      
      // 映射到 Three.js 空間
      // MediaPipe 座標：x 0~1（左到右），y 0~1（上到下），z 深度
      // 自拍鏡頭是鏡像的：MediaPipe x=0 是影像左側（使用者右手），
      // 翻轉 x 讓使用者往左移，畫面也往左（鏡像一致）
      const mappedX = -(palm.x - 0.5) * 12;  // 翻轉 x：映射到 6 ~ -6
      const mappedY = -(palm.y - 0.5) * 8;   // 映射到 -4 ~ 4（翻轉 y）
      const mappedZ = 3 - palm.z * 5;        // 深度映射

      handPosition.set(mappedX, mappedY, mappedZ);

      // 判斷抓取手勢：拇指 & 食指之間的距離
      const thumbTip = landmarks[THUMB_TIP];
      const indexTip = landmarks[INDEX_TIP];
      const middleTip = landmarks[MIDDLE_TIP];

      const pinchDist = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) +
        Math.pow(thumbTip.y - indexTip.y, 2) +
        Math.pow(thumbTip.z - indexTip.z, 2)
      );

      // 抓取判定：拇指和食指距離小於閾值
      const wasGrabbing = isGrabbing;
      isGrabbing = pinchDist < 0.07;

      // 更新游標
      if (handCursor) {
        handCursor.visible = true;
        handCursor.position.copy(handPosition);
        handCursor._ringMat.color.setHex(isGrabbing ? 0xffd700 : 0x00ced1);
        handCursor._outerRingMat.opacity = isGrabbing ? 0.6 : 0;
        
        // 抓取時游標縮小
        const scale = isGrabbing ? 0.7 : 1.0;
        handCursor.scale.setScalar(scale);
      }

      // 觸發回調
      if (onMoveCallback) onMoveCallback(handPosition);
      if (!wasGrabbing && isGrabbing && onGrabCallback) {
        onGrabCallback(handPosition);
      }
    } else {
      handVisible = false;
      if (handCursor) handCursor.visible = false;
    }
  }

  /**
   * 滑鼠 fallback —— 當攝影機不可用時
   */
  function setupMouseFallback(camera) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('mousemove', (e) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      // 將螢幕座標映射到 3D 世界
      const vec = new THREE.Vector3(mouse.x, mouse.y, 0.5);
      vec.unproject(camera);
      const dir = vec.sub(camera.position).normalize();
      const distance = (2 - camera.position.z) / dir.z;
      const worldPos = camera.position.clone().add(dir.multiplyScalar(distance));

      handPosition.copy(worldPos);
      handVisible = true;

      if (handCursor) {
        handCursor.visible = true;
        handCursor.position.copy(handPosition);
      }

      if (onMoveCallback) onMoveCallback(handPosition);
    });

    window.addEventListener('click', () => {
      if (onGrabCallback) onGrabCallback(handPosition);
    });

    // 觸控支援
    window.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;

      const vec = new THREE.Vector3(mouse.x, mouse.y, 0.5);
      vec.unproject(camera);
      const dir = vec.sub(camera.position).normalize();
      const distance = (2 - camera.position.z) / dir.z;
      const worldPos = camera.position.clone().add(dir.multiplyScalar(distance));

      handPosition.copy(worldPos);
      handVisible = true;

      if (handCursor) {
        handCursor.visible = true;
        handCursor.position.copy(handPosition);
      }

      if (onMoveCallback) onMoveCallback(handPosition);
    }, { passive: false });

    window.addEventListener('touchstart', (e) => {
      // 先更新位置再觸發 grab
      const touch = e.touches[0];
      mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;

      const vec = new THREE.Vector3(mouse.x, mouse.y, 0.5);
      vec.unproject(camera);
      const dir = vec.sub(camera.position).normalize();
      const distance = (2 - camera.position.z) / dir.z;
      const worldPos = camera.position.clone().add(dir.multiplyScalar(distance));

      handPosition.copy(worldPos);

      if (onGrabCallback) onGrabCallback(handPosition);
    });
  }

  function onGrab(cb) { onGrabCallback = cb; }
  function onMove(cb) { onMoveCallback = cb; }
  function getHandPosition() { return handPosition; }
  function getIsGrabbing() { return isGrabbing; }
  function getHandVisible() { return handVisible; }
  function getIsRunning() { return isRunning; }
  function _getGrabCallback() { return onGrabCallback; }

  return {
    init, startCamera, createHandCursor, detect,
    setupMouseFallback, onGrab, onMove,
    getHandPosition, getIsGrabbing, getHandVisible, getIsRunning,
    _getGrabCallback,
  };
})();
