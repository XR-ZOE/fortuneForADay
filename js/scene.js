/**
 * scene.js — Three.js 場景、攝影機、燈光、渲染器
 */

const SceneManager = (() => {
  let scene, camera, renderer;
  let width, height;

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
      alpha: false,
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

  return { init, render, getScene, getCamera, getRenderer };
})();
