import * as THREE from "three";

const ARENA = 19;
const EYE = 1.62;
const PLAYER_R = 0.42;
const ENEMY_R = 0.5;
const PLAYER_SPEED = 9.1;
const ENEMY_SPEED = 6.15;
const TURN_SPEED = 3.35;
const FIRE_DELAY = 0.34;
const PLAYER_DAMAGE = 20;
const ENEMY_DAMAGE = 22;
const WINDUP = 0.58;
const ENEMY_COOLDOWN = 0.82;
const PLAYER_HIT_R = 0.5;
const ENEMY_HIT_R = 0.68;

const coverData = [
  { x: -7.4, z: -5.2, w: 2.4, d: 2.4, h: 3.3, kind: "pillar" },
  { x: 7.4, z: -5.2, w: 2.4, d: 2.4, h: 3.3, kind: "pillar" },
  { x: -7.4, z: 5.6, w: 2.4, d: 2.4, h: 3.3, kind: "pillar" },
  { x: 7.4, z: 5.6, w: 2.4, d: 2.4, h: 3.3, kind: "pillar" },
  { x: 0, z: 0.2, w: 7.2, d: 1.25, h: 1.02, kind: "barrier" },
];

const covers = coverData.map((o) => ({
  ...o,
  minX: o.x - o.w / 2,
  maxX: o.x + o.w / 2,
  minZ: o.z - o.d / 2,
  maxZ: o.z + o.d / 2,
}));

const view = document.getElementById("view");
const overlay = document.getElementById("overlay");
const kicker = document.getElementById("kicker");
const title = document.getElementById("title");
const lede = document.getElementById("lede");
const tally = document.getElementById("tally");
const legend = document.getElementById("legend");
const note = document.getElementById("note");
const action = document.getElementById("action");
const hpFill = document.getElementById("hp-fill");
const rivalFill = document.getElementById("rival-fill");
const youScore = document.getElementById("you-score");
const kiteScore = document.getElementById("kite-score");
const hint = document.getElementById("hint");
const crosshair = document.getElementById("crosshair");
const readyFill = document.getElementById("ready-fill");
const callout = document.getElementById("callout");
const hurtEl = document.getElementById("hurt");
const map = document.getElementById("minimap");
const mapCtx = map.getContext("2d");

const keys = new Set();
const bolts = [];
const sparks = [];

const forward = new THREE.Vector3();
const shotDir = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const laserEnd = new THREE.Vector3();
const aim = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

let mode = "menu";
let clock = 0;
let youWins = 0;
let kiteWins = 0;
let winner = null;
let toldDodge = false;
let hintTimer = 0;
let hurt = 0;
let recoil = 0;
let shakeX = 0;
let shakeY = 0;
let shakeZ = 0;
let audioCtx = null;

const player = {
  x: 0,
  z: 9,
  yaw: 0,
  pitch: 0,
  hp: 100,
  cooldown: 0,
  shots: 0,
  hits: 0,
  moving: false,
};

const enemy = {
  x: 0,
  z: -9,
  hp: 100,
  cooldown: 1.1,
  windup: 0,
  strafeDir: 1,
  strafeTimer: 1.2,
  flash: 0,
  px: 0,
  pz: -9,
  locked: new THREE.Vector3(),
};

const renderer = new THREE.WebGLRenderer({
  canvas: view,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c2430);
scene.fog = new THREE.Fog(0x1c2430, 28, 68);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.08, 140);
scene.add(camera);

const boltGeo = new THREE.SphereGeometry(0.1, 10, 10);
const sparkGeo = new THREE.SphereGeometry(0.07, 6, 6);
const playerBoltMat = new THREE.MeshBasicMaterial({ color: 0xd8fff8 });
const enemyBoltMat = new THREE.MeshBasicMaterial({ color: 0xff5a32 });

const laserMat = new THREE.MeshBasicMaterial({
  color: 0xff2d1a,
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 10), laserMat);
laser.visible = false;
laser.frustumCulled = false;
scene.add(laser);

const markerMat = new THREE.MeshBasicMaterial({
  color: 0xff2d1a,
  transparent: true,
  opacity: 0.95,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const marker = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.68, 28), markerMat);
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);

const columnMat = new THREE.MeshBasicMaterial({
  color: 0xff3b22,
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
});
const column = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 2.5, 18, 1, true), columnMat);
column.visible = false;
scene.add(column);

const incomingEl = document.getElementById("incoming");

function hideTelegraph() {
  laser.visible = false;
  marker.visible = false;
  column.visible = false;
  incomingEl.style.opacity = "0";
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function paintFloor() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  g.fillStyle = "#3d4652";
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 5000; i += 1) {
    const shade = 70 + Math.random() * 40;
    g.fillStyle = `rgba(${shade}, ${shade + 4}, ${shade + 8}, 0.22)`;
    g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  g.strokeStyle = "rgba(150, 236, 226, 0.28)";
  g.lineWidth = 2;
  for (let i = 0; i <= size; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, size);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(size, i);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function paintSeven() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, 512, 512);
  g.strokeStyle = "rgba(92, 225, 255, 0.28)";
  g.lineWidth = 26;
  g.lineJoin = "miter";
  g.lineCap = "square";
  g.beginPath();
  g.moveTo(90, 78);
  g.lineTo(422, 78);
  g.lineTo(236, 448);
  g.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildArena() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 46),
    new THREE.MeshStandardMaterial({
      map: paintFloor(),
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.04,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const seven = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({
      map: paintSeven(),
      transparent: true,
      depthWrite: false,
    }),
  );
  seven.rotation.x = -Math.PI / 2;
  seven.position.y = 0.025;
  scene.add(seven);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(6.2, 0.035, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0x2f6f68 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.03;
  scene.add(ring);

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x6a7380,
    roughness: 0.78,
    metalness: 0.06,
  });
  const height = 4.7;
  const thick = 1.15;
  const span = ARENA * 2 + thick;
  const edge = ARENA + thick / 2;
  const wallSpecs = [
    [0, height / 2, -edge, span, height, thick],
    [0, height / 2, edge, span, height, thick],
    [-edge, height / 2, 0, thick, height, span],
    [edge, height / 2, 0, thick, height, span],
  ];
  for (const [x, y, z, w, h, d] of wallSpecs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    wall.position.set(x, y, z);
    wall.receiveShadow = true;
    scene.add(wall);
  }

  const trimMat = new THREE.MeshBasicMaterial({ color: 0xff6a3c });
  const trimZ = [
    [0, 3.55, -ARENA + 0.06, span - 2, 0.07, 0.08],
    [0, 3.55, ARENA - 0.06, span - 2, 0.07, 0.08],
  ];
  const trimX = [
    [-ARENA + 0.06, 3.55, 0, 0.08, 0.07, span - 2],
    [ARENA - 0.06, 3.55, 0, 0.08, 0.07, span - 2],
  ];
  for (const spec of trimZ) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(spec[3], spec[4], spec[5]), trimMat);
    trim.position.set(spec[0], spec[1], spec[2]);
    scene.add(trim);
  }
  const cyanTrim = new THREE.MeshBasicMaterial({ color: 0x5ce1ff });
  for (const spec of trimX) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(spec[3], spec[4], spec[5]), cyanTrim);
    trim.position.set(spec[0], spec[1], spec[2]);
    scene.add(trim);
  }

  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x737c88,
    roughness: 0.68,
    metalness: 0.16,
  });
  const barrierMat = new THREE.MeshStandardMaterial({
    color: 0x8a624c,
    roughness: 0.8,
    metalness: 0.05,
  });
  const slitMat = new THREE.MeshBasicMaterial({ color: 0x5ce1ff });
  const capMat = new THREE.MeshBasicMaterial({ color: 0xff6a3c });

  for (const o of covers) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(o.w, o.h, o.d),
      o.kind === "pillar" ? pillarMat : barrierMat,
    );
    mesh.position.set(o.x, o.h / 2, o.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    if (o.kind === "pillar") {
      const inward = -Math.sign(o.x);
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.08, o.h * 0.42, 0.1), slitMat);
      slit.position.set(o.x + inward * (o.w / 2 + 0.01), o.h * 0.58, o.z);
      scene.add(slit);
    } else {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.07, o.d), capMat);
      cap.position.set(o.x, o.h + 0.02, o.z);
      scene.add(cap);
    }
  }

  addLamp(-14, -14, 0x5ce1ff);
  addLamp(14, 14, 0xff5a32);
  addLamp(14, -14, 0xc9d4e2);
  addLamp(-14, 14, 0xc9d4e2);
}

function addLamp(x, z, color) {
  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.12, 0.46),
    new THREE.MeshStandardMaterial({ color: 0x121418, roughness: 0.45, metalness: 0.6 }),
  );
  housing.position.set(x, 4.45, z);
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.05, 0.28),
    new THREE.MeshBasicMaterial({ color }),
  );
  glow.position.set(x, 4.36, z);
  const light = new THREE.PointLight(color, 80, 32, 2);
  light.position.set(x, 4.15, z);
  scene.add(housing, glow, light);
}

function addLights() {
  scene.add(new THREE.HemisphereLight(0xd5e4f5, 0x6a5344, 1.65));
  scene.add(new THREE.AmbientLight(0xd0d8e4, 0.42));

  const dir = new THREE.DirectionalLight(0xfff3e2, 3.4);
  dir.position.set(16, 28, 10);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.near = 8;
  dir.shadow.camera.far = 60;
  dir.shadow.camera.left = -24;
  dir.shadow.camera.right = 24;
  dir.shadow.camera.top = 24;
  dir.shadow.camera.bottom = -24;
  dir.shadow.bias = -0.0006;
  dir.target.position.set(0, 0, 0);
  dir.shadow.camera.updateProjectionMatrix();
  scene.add(dir);
  scene.add(dir.target);

  const fill = new THREE.DirectionalLight(0xc5e4ff, 1.15);
  fill.position.set(-12, 10, -8);
  scene.add(fill);
}

function buildRival() {
  const rival = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({
    color: 0xd24b32,
    roughness: 0.48,
    metalness: 0.4,
    emissive: 0x3a0d08,
    emissiveIntensity: 0.55,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x1b1e25,
    roughness: 0.4,
    metalness: 0.62,
  });
  const visor = new THREE.MeshStandardMaterial({
    color: 0xff5a32,
    emissive: 0xff3a16,
    emissiveIntensity: 2.2,
  });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.82, 0.46), armor);
  torso.position.y = 1.18;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), dark);
  chest.position.set(0, 1.22, 0.24);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.38), dark);
  head.position.y = 1.82;
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.06), visor);
  eye.position.set(0, 1.84, 0.2);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.18), dark);
  pack.position.set(0, 1.22, -0.28);

  function makeLeg(x) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.74, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.74, 0.22), dark);
    mesh.position.y = -0.37;
    pivot.add(mesh);
    return pivot;
  }

  const legL = makeLeg(-0.22);
  const legR = makeLeg(0.22);
  const gunArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.62), dark);
  gunArm.position.set(0.52, 1.16, 0.36);
  const muzzleGlow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.06), visor);
  muzzleGlow.position.set(0.52, 1.16, 0.68);

  rival.add(torso, chest, head, eye, pack, legL, legR, gunArm, muzzleGlow);
  rival.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const eyeLight = new THREE.PointLight(0xff4a28, 8, 5.5, 2);
  eyeLight.position.set(0, 1.84, 0.32);
  rival.add(eyeLight);

  rival.userData.armor = armor;
  rival.userData.visor = visor;
  rival.userData.eye = eyeLight;
  rival.userData.legL = legL;
  rival.userData.legR = legR;
  scene.add(rival);
  return rival;
}

function buildGun() {
  const gun = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({
    color: 0x2c333c,
    roughness: 0.38,
    metalness: 0.72,
  });
  const glove = new THREE.MeshStandardMaterial({
    color: 0x23262c,
    roughness: 0.7,
    metalness: 0.1,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0x12383d,
    emissive: 0x1ad4c8,
    emissiveIntensity: 0.55,
    roughness: 0.4,
    metalness: 0.35,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.36), metal);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), metal);
  barrel.position.set(0, 0.035, -0.28);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.05, 0.24), accent);
  stripe.position.set(0.05, 0.02, -0.06);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.08), glove);
  grip.position.set(0, -0.08, 0.08);
  gun.add(body, barrel, stripe, grip);
  gun.position.set(0.3, -0.24, -0.52);
  gun.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = false;
      obj.receiveShadow = false;
    }
  });
  const flash = new THREE.PointLight(0xd8fff8, 0, 5, 2);
  flash.position.set(0, 0.04, -0.48);
  gun.add(flash);
  camera.add(gun);
  gun.userData.flash = flash;
  gun.userData.accent = accent;
  return gun;
}

const rival = buildRival();
const gun = buildGun();
addLights();
buildArena();

function coverBlocks(x, z, radius, passY) {
  for (const o of covers) {
    if (passY != null && passY > o.h) continue;
    const cx = clamp(x, o.minX, o.maxX);
    const cz = clamp(z, o.minZ, o.maxZ);
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

function blocked(x, z, radius) {
  if (Math.abs(x) > ARENA - radius || Math.abs(z) > ARENA - radius) return true;
  return coverBlocks(x, z, radius, null);
}

function tryMove(ent, dx, dz, radius) {
  if (!blocked(ent.x + dx, ent.z, radius)) ent.x += dx;
  if (!blocked(ent.x, ent.z + dz, radius)) ent.z += dz;
}

function segmentBlocked(x1, z1, x2, z2, y) {
  const dist = Math.hypot(x2 - x1, z2 - z1);
  const steps = Math.max(2, Math.ceil(dist / 0.35));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const z = z1 + (z2 - z1) * t;
    if (Math.abs(x) > ARENA || Math.abs(z) > ARENA) return true;
    if (coverBlocks(x, z, 0.08, y)) return true;
  }
  return false;
}

function clearBolts() {
  for (const bolt of bolts) scene.remove(bolt.mesh);
  bolts.length = 0;
  for (const spark of sparks) {
    scene.remove(spark.mesh);
    spark.mat.dispose();
  }
  sparks.length = 0;
}

function resetActors() {
  player.x = 0;
  player.z = 9;
  player.yaw = 0;
  player.pitch = 0;
  player.hp = 100;
  player.cooldown = 0;
  player.shots = 0;
  player.hits = 0;
  player.moving = false;
  enemy.x = 0;
  enemy.z = -9;
  enemy.hp = 100;
  enemy.cooldown = 1.75;
  enemy.windup = 0;
  enemy.strafeDir = Math.random() < 0.5 ? -1 : 1;
  enemy.strafeTimer = 1.1;
  enemy.flash = 0;
  enemy.px = enemy.x;
  enemy.pz = enemy.z;
  rival.position.set(enemy.x, 0, enemy.z);
  rival.rotation.set(0, 0, 0);
  recoil = 0;
  hurt = 0;
  shakeX = 0;
  shakeY = 0;
  shakeZ = 0;
  hideTelegraph();
  clearBolts();
}

function ac() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function safeAudio(fn) {
  try {
    fn(ac());
  } catch {
    /* sound is optional */
  }
}

function tone(ctx, freq, endFreq, dur, vol, type) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(ctx, dur, vol, freq) {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * dur));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 0.6;
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

function sfxShoot(isPlayer) {
  safeAudio((ctx) => {
    if (isPlayer) {
      noise(ctx, 0.07, 0.22, 1600);
      tone(ctx, 640, 150, 0.08, 0.035, "square");
    } else {
      noise(ctx, 0.1, 0.2, 700);
      tone(ctx, 220, 70, 0.14, 0.05, "sawtooth");
    }
  });
}

function sfxWindup() {
  safeAudio((ctx) => {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.linearRampToValueAtTime(460, t + WINDUP);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.linearRampToValueAtTime(1600, t + WINDUP);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.035, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + WINDUP);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + WINDUP + 0.02);
  });
}

function sfxConfirm() {
  safeAudio((ctx) => tone(ctx, 920, 460, 0.06, 0.04, "sine"));
}

function sfxHurt() {
  safeAudio((ctx) => tone(ctx, 160, 55, 0.16, 0.07, "sawtooth"));
}

function sfxEnd(win) {
  safeAudio((ctx) => {
    if (win) {
      tone(ctx, 440, 440, 0.08, 0.05, "square");
      setTimeout(() => safeAudio((c) => tone(c, 660, 880, 0.16, 0.05, "square")), 90);
    } else {
      tone(ctx, 220, 70, 0.28, 0.06, "sawtooth");
    }
  });
}

function say(text) {
  callout.textContent = text;
  callout.classList.remove("show");
  void callout.offsetWidth;
  callout.classList.add("show");
}

function setBars() {
  hpFill.style.transform = `scaleX(${clamp(player.hp / 100, 0, 1)})`;
  rivalFill.style.transform = `scaleX(${clamp(enemy.hp / 100, 0, 1)})`;
  hpFill.style.background = player.hp <= 34 ? "#ff4b2e" : "#5ce1ff";
  const ready = 1 - clamp(player.cooldown / FIRE_DELAY, 0, 1);
  readyFill.style.transform = `scaleX(${ready})`;
  youScore.textContent = String(youWins);
  kiteScore.textContent = String(kiteWins);
  document.body.classList.toggle("critical", mode === "play" && player.hp > 0 && player.hp <= 34);
}

function showEnd(kind) {
  mode = "end";
  document.body.dataset.mode = "end";
  if (kind === "player") {
    kicker.textContent = "Pit cleared";
    title.textContent = "Kite is down";
    const noun = player.hits === 1 ? "hit" : "hits";
    lede.textContent = `${player.hits} ${noun} landed. Bay 7 is yours.`;
  } else {
    kicker.textContent = "Tagged out";
    title.textContent = "You're down";
    lede.textContent = "Kite holds the bay. The red beam is the shot — step off it.";
  }
  tally.hidden = false;
  tally.textContent = `You ${youWins}  ·  Kite ${kiteWins}`;
  legend.hidden = true;
  note.hidden = true;
  action.textContent = "Rematch";
  overlay.hidden = false;
}

function finish(kind) {
  if (mode !== "play") return;
  winner = kind;
  if (kind === "player") youWins += 1;
  else kiteWins += 1;
  keys.clear();
  enemy.windup = 0;
  hideTelegraph();
  if (document.pointerLockElement) document.exitPointerLock();
  sfxEnd(kind === "player");
  showEnd(kind);
  setBars();
}

function hurtPlayer(amount) {
  if (mode !== "play") return;
  player.hp = Math.max(0, player.hp - amount);
  hurt = 0.75;
  shakeX = (Math.random() - 0.5) * 0.2;
  shakeY = Math.random() * 0.08;
  shakeZ = (Math.random() - 0.5) * 0.2;
  sfxHurt();
  const dx = player.x - enemy.x;
  const dz = player.z - enemy.z;
  const d = Math.hypot(dx, dz) || 1;
  tryMove(player, (dx / d) * 0.22, (dz / d) * 0.22, PLAYER_R);
  if (player.hp <= 0) finish("enemy");
}

function hurtEnemy(amount) {
  if (mode !== "play" || enemy.hp <= 0) return;
  enemy.hp = Math.max(0, enemy.hp - amount);
  player.hits += 1;
  enemy.flash = 0.09;
  crosshair.classList.add("hit");
  window.setTimeout(() => crosshair.classList.remove("hit"), 90);
  sfxConfirm();
  if (enemy.hp <= 0) finish("player");
}

function spawnBolt(origin, direction, owner) {
  const mesh = new THREE.Mesh(boltGeo, owner === "player" ? playerBoltMat : enemyBoltMat);
  mesh.position.copy(origin);
  const speed = owner === "player" ? 78 : 13;
  const vel = direction.clone().normalize().multiplyScalar(speed);
  scene.add(mesh);
  bolts.push({
    mesh,
    vel,
    owner,
    life: owner === "player" ? 1.05 : 2.8,
  });
}

function sparkAt(pos, color) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
  const mesh = new THREE.Mesh(sparkGeo, mat);
  mesh.position.copy(pos);
  scene.add(mesh);
  sparks.push({ mesh, mat, life: 0.14, max: 0.14 });
}

function hitsEnemy(pos) {
  const dx = pos.x - enemy.x;
  const dz = pos.z - enemy.z;
  return dx * dx + dz * dz < ENEMY_HIT_R * ENEMY_HIT_R && pos.y > 0.25 && pos.y < 2.2;
}

function hitsPlayer(pos) {
  const dx = pos.x - player.x;
  const dz = pos.z - player.z;
  return dx * dx + dz * dz < PLAYER_HIT_R * PLAYER_HIT_R && pos.y > 0.25 && pos.y < 2.05;
}

function boltImpact(bolt) {
  const pos = bolt.mesh.position;
  if (bolt.owner === "player" && hitsEnemy(pos)) {
    hurtEnemy(PLAYER_DAMAGE);
    sparkAt(pos, 0xffd0c4);
    return true;
  }
  if (bolt.owner === "enemy" && hitsPlayer(pos)) {
    hurtPlayer(ENEMY_DAMAGE);
    sparkAt(pos, 0xff5a32);
    return true;
  }
  if (pos.y < 0.1 || pos.y > 8 || bolt.life <= 0) {
    sparkAt(pos, bolt.owner === "player" ? 0xd8fff8 : 0xff5a32);
    return true;
  }
  if (coverBlocks(pos.x, pos.z, 0.1, pos.y)) {
    sparkAt(pos, 0xf4f0e6);
    return true;
  }
  if ((Math.abs(pos.x) > ARENA || Math.abs(pos.z) > ARENA) && pos.y <= 4.7) {
    sparkAt(pos, 0xf4f0e6);
    return true;
  }
  return false;
}

function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i -= 1) {
    const bolt = bolts[i];
    const dist = bolt.vel.length() * dt;
    const steps = Math.max(1, Math.ceil(dist / 0.28));
    let dead = false;
    for (let s = 0; s < steps; s += 1) {
      bolt.mesh.position.addScaledVector(bolt.vel, dt / steps);
      bolt.life -= dt / steps;
      if (boltImpact(bolt)) {
        dead = true;
        break;
      }
    }
    if (!dead) {
      laserEnd.copy(bolt.mesh.position).add(bolt.vel);
      bolt.mesh.lookAt(laserEnd);
      bolt.mesh.scale.set(0.75, 0.75, bolt.owner === "player" ? 2.5 : 1.7);
    } else {
      scene.remove(bolt.mesh);
      bolts.splice(i, 1);
    }
  }

  for (let i = sparks.length - 1; i >= 0; i -= 1) {
    const spark = sparks[i];
    spark.life -= dt;
    const k = Math.max(spark.life, 0) / spark.max;
    spark.mesh.scale.setScalar(1 + (1 - k) * 3.2);
    spark.mat.opacity = k;
    if (spark.life <= 0) {
      scene.remove(spark.mesh);
      spark.mat.dispose();
      sparks.splice(i, 1);
    }
  }
}

function tryShoot(dt) {
  player.cooldown = Math.max(0, player.cooldown - dt);
  if (!keys.has("Space") || player.cooldown > 0 || mode !== "play") return;
  player.cooldown = FIRE_DELAY;
  player.shots += 1;
  recoil = 0.13;
  camera.getWorldPosition(muzzle);
  camera.getWorldDirection(shotDir);
  muzzle.addScaledVector(shotDir, 0.55);
  spawnBolt(muzzle, shotDir, "player");
  gun.userData.flash.intensity = 18;
  sfxShoot(true);
}

function updateGun(dt) {
  recoil = Math.max(0, recoil - dt * 0.85);
  const bob = Math.sin(clock * (player.moving ? 11 : 1.6)) * (player.moving ? 0.012 : 0.003);
  gun.position.z = -0.52 + recoil;
  gun.position.y = -0.24 + bob;
  const flash = gun.userData.flash;
  flash.intensity = Math.max(0, flash.intensity - dt * 140);
  gun.userData.accent.emissiveIntensity = player.cooldown > 0 ? 0.15 : 0.7;
}

function updateCamera() {
  camera.position.set(player.x + shakeX, EYE + shakeY, player.z + shakeZ);
  camera.rotation.order = "YXZ";
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.rotation.z = 0;
  const decay = Math.exp(-10 * 0.016);
  shakeX *= decay;
  shakeY *= decay;
  shakeZ *= decay;
}

function updatePlayer(dt) {
  if (keys.has("ArrowLeft")) player.yaw += TURN_SPEED * dt;
  if (keys.has("ArrowRight")) player.yaw -= TURN_SPEED * dt;

  camera.rotation.order = "YXZ";
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.rotation.z = 0;
  camera.position.set(player.x, EYE, player.z);
  camera.updateMatrixWorld();
  camera.getWorldDirection(forward);

  const flatLen = Math.hypot(forward.x, forward.z) || 1;
  let mx = 0;
  let mz = 0;
  if (keys.has("ArrowUp")) {
    mx += forward.x / flatLen;
    mz += forward.z / flatLen;
  }
  if (keys.has("ArrowDown")) {
    mx -= forward.x / flatLen;
    mz -= forward.z / flatLen;
  }
  player.moving = mx !== 0 || mz !== 0;
  if (player.moving) {
    const len = Math.hypot(mx, mz);
    tryMove(player, (mx / len) * PLAYER_SPEED * dt, (mz / len) * PLAYER_SPEED * dt, PLAYER_R);
  }
  tryShoot(dt);
  updateGun(dt);
}

function faceYaw(x, z) {
  return Math.atan2(x - enemy.x, z - enemy.z);
}

function updateLaser() {
  column.visible = true;
  column.position.set(enemy.locked.x, 1.2, enemy.locked.z);
  columnMat.opacity = 0.16 + Math.abs(Math.sin(clock * 16)) * 0.14;
  marker.visible = true;
  marker.position.set(enemy.locked.x, 0.04, enemy.locked.z);
  const pulse = 1 + Math.sin(clock * 18) * 0.08;
  marker.scale.set(pulse, pulse, pulse);
  const onSpot = Math.hypot(player.x - enemy.locked.x, player.z - enemy.locked.z) < 0.95;
  incomingEl.style.opacity = onSpot ? String(0.26 + Math.abs(Math.sin(clock * 22)) * 0.2) : "0";

  const yaw = rival.rotation.y;
  muzzle.set(enemy.x + Math.sin(yaw) * 0.8, 1.28, enemy.z + Math.cos(yaw) * 0.8);
  aim.copy(enemy.locked).sub(muzzle);
  if (aim.lengthSq() < 0.0001) {
    laser.visible = false;
    return;
  }
  aim.normalize();
  laserEnd.copy(muzzle);
  for (let t = 0.2; t < 42; t += 0.35) {
    laserEnd.copy(muzzle).addScaledVector(aim, t);
    const pastWall = Math.abs(laserEnd.x) > ARENA || Math.abs(laserEnd.z) > ARENA;
    const intoCover = coverBlocks(laserEnd.x, laserEnd.z, 0.05, laserEnd.y);
    if (laserEnd.y < 0.08 || pastWall || intoCover) break;
  }
  const span = muzzle.distanceTo(laserEnd);
  if (span < 0.2) {
    laser.visible = false;
    return;
  }
  laser.visible = true;
  laser.position.copy(muzzle).add(laserEnd).multiplyScalar(0.5);
  laser.scale.set(1, span, 1);
  shotDir.copy(laserEnd).sub(muzzle).normalize();
  laser.quaternion.setFromUnitVectors(up, shotDir);
  laserMat.opacity = 0.7 + Math.sin(clock * 30) * 0.25;
}

function updateEnemy(dt) {
  if (enemy.hp <= 0) return;
  enemy.cooldown = Math.max(0, enemy.cooldown - dt);
  const dx = player.x - enemy.x;
  const dz = player.z - enemy.z;
  const dist = Math.hypot(dx, dz) || 1;
  const toX = dx / dist;
  const toZ = dz / dist;
  const los = !segmentBlocked(enemy.x, enemy.z, player.x, player.z, 1.35);

  enemy.strafeTimer -= dt;
  if (enemy.strafeTimer <= 0) {
    enemy.strafeDir *= -1;
    enemy.strafeTimer = 0.85 + Math.random() * 1.15;
  }

  let toward = 0;
  if (!los || dist > 13.5) toward = 1;
  else if (dist < 7.6) toward = -1;
  const strafe = enemy.strafeDir * (los ? 1 : 0.3) * (enemy.windup > 0 ? 0.4 : 1);
  let mx = toX * toward - toZ * strafe;
  let mz = toZ * toward + toX * strafe;
  const mag = Math.hypot(mx, mz) || 1;
  mx /= mag;
  mz /= mag;
  const beforeX = enemy.x;
  const beforeZ = enemy.z;
  tryMove(enemy, mx * ENEMY_SPEED * dt, mz * ENEMY_SPEED * dt, ENEMY_R);
  if (Math.hypot(enemy.x - beforeX, enemy.z - beforeZ) < ENEMY_SPEED * dt * 0.2) {
    enemy.strafeDir *= -1;
    enemy.strafeTimer = 0.7;
  }

  const faceX = enemy.windup > 0 ? enemy.locked.x : player.x;
  const faceZ = enemy.windup > 0 ? enemy.locked.z : player.z;
  rival.rotation.set(0, faceYaw(faceX, faceZ), 0);
  rival.position.set(enemy.x, 0, enemy.z);

  const moved = Math.hypot(enemy.x - enemy.px, enemy.z - enemy.pz);
  enemy.px = enemy.x;
  enemy.pz = enemy.z;
  const swing = Math.sin(clock * 9) * (moved > 0.002 ? 0.75 : 0.06);
  rival.userData.legL.rotation.x = swing;
  rival.userData.legR.rotation.x = -swing;

  if (enemy.windup > 0) {
    enemy.windup -= dt;
    updateLaser();
    if (enemy.windup <= 0) {
      const yaw = rival.rotation.y;
      muzzle.set(enemy.x + Math.sin(yaw) * 0.85, 1.28, enemy.z + Math.cos(yaw) * 0.85);
      shotDir.copy(enemy.locked).sub(muzzle);
      if (shotDir.lengthSq() > 0.0001) {
        shotDir.normalize();
        muzzle.addScaledVector(shotDir, 0.35);
        spawnBolt(muzzle, shotDir, "enemy");
        sfxShoot(false);
      }
      enemy.cooldown = ENEMY_COOLDOWN;
      hideTelegraph();
    }
  } else {
    hideTelegraph();
    if (los && dist < 28 && enemy.cooldown <= 0) {
      enemy.locked.set(player.x, 1.42, player.z);
      enemy.windup = WINDUP;
      if (!toldDodge) {
        toldDodge = true;
        say("STEP OFF THE BEAM");
      }
      sfxWindup();
    }
  }
}

function updateFlash() {
  const armor = rival.userData.armor;
  const visor = rival.userData.visor;
  const eye = rival.userData.eye;
  const charging = enemy.windup > 0 && mode === "play";
  if (enemy.flash > 0) {
    enemy.flash -= 0.016;
    armor.emissive.setHex(0xffffff);
    armor.emissiveIntensity = 1.3;
  } else {
    armor.emissive.setHex(0x3a0d08);
    armor.emissiveIntensity = charging ? 0.95 : 0.5;
  }
  visor.emissiveIntensity = charging ? 6 : 2.2;
  eye.intensity = charging ? 16 : 7;
}

function separate() {
  let dx = player.x - enemy.x;
  let dz = player.z - enemy.z;
  let d = Math.hypot(dx, dz);
  const min = PLAYER_R + ENEMY_R + 0.2;
  if (d >= min) return;
  if (d < 0.0001) {
    dx = 1;
    dz = 0;
    d = 1;
  }
  const push = (min - d) * 0.5;
  tryMove(player, (dx / d) * push, (dz / d) * push, PLAYER_R);
  tryMove(enemy, (-dx / d) * push, (-dz / d) * push, ENEMY_R);
}

function updateHud(dt) {
  setBars();
  const critical = mode === "play" && player.hp > 0 && player.hp <= 34
    ? 0.2 + Math.sin(clock * 6) * 0.08
    : 0;
  hurt = Math.max(0, hurt - dt * 1.5);
  hurtEl.style.opacity = String(Math.min(0.82, Math.max(hurt * 0.75, critical)));
  if (hintTimer > 0) hintTimer -= dt;
  hint.style.opacity = hintTimer > 0 ? "1" : "0";
}

function drawMap() {
  const w = map.width;
  const h = map.height;
  const pad = 12;
  mapCtx.clearRect(0, 0, w, h);
  const toX = (x) => pad + ((x / ARENA) * 0.5 + 0.5) * (w - pad * 2);
  const toY = (z) => pad + ((z / ARENA) * 0.5 + 0.5) * (h - pad * 2);

  mapCtx.strokeStyle = "rgba(244, 240, 230, 0.35)";
  mapCtx.lineWidth = 1;
  mapCtx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

  mapCtx.fillStyle = "rgba(244, 240, 230, 0.22)";
  for (const o of covers) {
    const x = toX(o.minX);
    const y = toY(o.minZ);
    mapCtx.fillRect(x, y, toX(o.maxX) - x, toY(o.maxZ) - y);
  }

  if (enemy.windup > 0) {
    mapCtx.strokeStyle = "#ff2d1a";
    mapCtx.lineWidth = 2;
    mapCtx.beginPath();
    mapCtx.moveTo(toX(enemy.x), toY(enemy.z));
    mapCtx.lineTo(toX(enemy.locked.x), toY(enemy.locked.z));
    mapCtx.stroke();
  }

  mapCtx.fillStyle = "#ff4b2e";
  mapCtx.beginPath();
  mapCtx.arc(toX(enemy.x), toY(enemy.z), 4.5, 0, Math.PI * 2);
  mapCtx.fill();

  const px = toX(player.x);
  const py = toY(player.z);
  const dx = -Math.sin(player.yaw);
  const dy = -Math.cos(player.yaw);
  mapCtx.save();
  mapCtx.translate(px, py);
  mapCtx.rotate(Math.atan2(dy, dx));
  mapCtx.fillStyle = "#5ce1ff";
  mapCtx.beginPath();
  mapCtx.moveTo(7, 0);
  mapCtx.lineTo(-5, 4);
  mapCtx.lineTo(-5, -4);
  mapCtx.closePath();
  mapCtx.fill();
  mapCtx.restore();
}

function updateMenu() {
  const a = clock * 0.15;
  camera.position.set(Math.sin(a) * 5.5, 10.4, 15.5);
  camera.lookAt(0, 0.4, -2);
  gun.visible = false;
  const dx = camera.position.x - enemy.x;
  const dz = camera.position.z - enemy.z;
  rival.rotation.set(0, Math.atan2(dx, dz), 0);
  rival.position.set(enemy.x, Math.sin(clock * 1.3) * 0.035, enemy.z);
  const swing = Math.sin(clock * 2.2) * 0.18;
  rival.userData.legL.rotation.x = swing;
  rival.userData.legR.rotation.x = -swing;
  hideTelegraph();
}

function updateEnd(dt) {
  gun.visible = true;
  if (winner === "player") {
    rival.rotation.x = Math.min(1.2, rival.rotation.x + dt * 1.6);
    rival.position.y = Math.max(-0.35, rival.position.y - dt * 0.35);
  }
  shakeX *= Math.exp(-8 * dt);
  shakeY *= Math.exp(-8 * dt);
  shakeZ *= Math.exp(-8 * dt);
  camera.position.set(player.x + shakeX, EYE + shakeY, player.z + shakeZ);
  camera.rotation.order = "YXZ";
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  hurt = Math.max(0, hurt - dt);
  hurtEl.style.opacity = String(hurt * 0.45);
  hideTelegraph();
}

function beginMatch() {
  action.blur();
  keys.clear();
  resetActors();
  winner = null;
  mode = "play";
  document.body.dataset.mode = "play";
  overlay.hidden = true;
  gun.visible = true;
  hintTimer = 8;
  updateCamera();
  setBars();
  say("FIGHT");
  ac();
}

function onAction() {
  if (mode === "menu" || mode === "end") beginMatch();
}

action.addEventListener("click", onAction);

window.addEventListener("keydown", (event) => {
  const gameKey = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code);
  if (gameKey) event.preventDefault();
  if (event.repeat) return;
  if ((event.code === "Enter" || event.code === "NumpadEnter") && (mode === "menu" || mode === "end")) {
    event.preventDefault();
    beginMatch();
    return;
  }
  if (mode === "play" && gameKey) keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("blur", () => keys.clear());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) keys.clear();
});

view.addEventListener("click", () => {
  if (mode === "play") view.requestPointerLock();
});

view.addEventListener("contextmenu", (event) => event.preventDefault());

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== view || mode !== "play") return;
  player.yaw -= event.movementX * 0.0022;
  player.pitch -= event.movementY * 0.0018;
  player.pitch = clamp(player.pitch, -0.55, 0.45);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function update(dt) {
  if (mode === "menu") {
    updateMenu();
    updateFlash();
    return;
  }
  if (mode === "end") {
    updateEnd(dt);
    updateBolts(dt);
    updateFlash();
    return;
  }
  updatePlayer(dt);
  updateEnemy(dt);
  updateBolts(dt);
  separate();
  rival.position.x = enemy.x;
  rival.position.z = enemy.z;
  updateCamera();
  updateFlash();
  updateHud(dt);
  drawMap();
  gun.visible = true;
}

resetActors();
setBars();

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  clock += dt;
  update(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
