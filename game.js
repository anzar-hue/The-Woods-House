// --- SAFE STORAGE WRAPPER (HF SPACES IFRAME SAFE) ---
const SafeStorage = {
  get(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, String(val)); } catch {}
  }
};

// --- PROCEDURAL + SPOKEN VOICE AUDIO ENGINE ---
const VOICE_BASE = "assets/audio/";

const SFX = {
  ctx: null,
  currentVoice: null,
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  playVoice(filename, volume = 0.85) {
    if (!filename) return;
    if (this.currentVoice) {
      this.currentVoice.pause();
      this.currentVoice.currentTime = 0;
    }
    const audio = new Audio(`${VOICE_BASE}${filename}`);
    audio.volume = Math.max(0.05, Math.min(1.0, volume));
    audio.play().catch(() => {});
    this.currentVoice = audio;
  },
  playHeartbeat(intensity = 0.5) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [0, 0.16].forEach((offset, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(idx === 0 ? 58 : 48, now + offset);
      osc.frequency.exponentialRampToValueAtTime(28, now + offset + 0.12);
      gain.gain.setValueAtTime(0.14 * intensity, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.13);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(now + offset); osc.stop(now + offset + 0.14);
    });
  },
  playStep(silent = false) {
    if (!this.ctx || silent) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(88 + Math.random() * 20, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(32, this.ctx.currentTime + 0.07);
    gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(); osc.stop(this.ctx.currentTime + 0.08);
  },
  playCreak() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.linearRampToValueAtTime(82, now + 0.22);
    osc.frequency.linearRampToValueAtTime(120, now + 0.36);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.6);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(now); osc.stop(now + 0.63);
  },
  playPickup() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [440, 622].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.11, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.28);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.09); osc.stop(now + idx * 0.09 + 0.29);
    });
  },
  playKnifeSlash() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(560, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.24);
    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(now); osc.stop(now + 0.26);
  }
};

// --- ALERT FEED ---
let alertTimeout = null;
function showAlert(msg, type = "warn", durationMs = 4600) {
  const el = document.getElementById("alert-feed");
  el.textContent = msg;
  el.className = type === "danger" ? "alert-danger" : type === "whisper" ? "alert-whisper" : "alert-warn";
  if (alertTimeout) clearTimeout(alertTimeout);
  alertTimeout = setTimeout(() => { el.classList.add("hidden"); }, durationMs);
}

// --- DIFFICULTY PRESETS (UNITS PER SECOND) ---
const MODES = {
  easy:      { label: "Easy",      maxStrikes: 2, npcSpeed: 1.6, lightDetect: false, guardMissing: false, desc: "Easy: Slower patrols, no flashlight detection, 2 escape strikes during lockdown." },
  normal:    { label: "Normal",    maxStrikes: 2, npcSpeed: 2.1, lightDetect: true,  guardMissing: true,  desc: "Normal: Flashlight & creaks attract NPCs; 2 escape strikes allowed during lockdown." },
  nightmare: { label: "Nightmare", maxStrikes: 0, npcSpeed: 2.6, lightDetect: true,  guardMissing: true,  desc: "Nightmare: Faster stalking, item guarding, and 0 escape strikes—1 catch in lockdown is fatal." }
};

let selectedMode = "normal";
let enginesLoaded = false;

// --- ENGINE HANDLES (C++ WASM + 9-Feature PyTorch ONNX) ---
let cppClearColliders = null;
let cppAddCollider = null;
let cppHasLOS = null;
let cppIsSpottedLOS = null;
let cppEuclideanScore = null;
let cppRuleDelta = null;
let ortSession = null;
let dialogues = null;

// --- GAME STATE ---
let gameCount = parseInt(SafeStorage.get("woods_game_count", "1"), 10) || 1;
let state = "MENU"; // MENU, LOADING, PLAYING, PAUSED, DIALOGUE, KNIFE_ANIM, ESCAPE_ANIM, ENDED
let keys = {};
let flashlightOn = true;
let spotCooldown = 0;
let lightAlertCooldown = 0;
let activeNPC = null;
let nearbyItem = null;
let nearMainDoor = false;
let lockdownStrikes = 0;
let lockdown = false;
let animTimer = 0;
let stepSoundTimer = 0;
let heartbeatTimer = 0;
let creakCooldown = 0;
let meetingCooldown = 0;
let lockdownTrackTimer = 0;
let npcsKnowItemsMissing = false;
let playerMissingFromFloor1 = false;
let lastNoticedItem = null;
let lastHudKey = "";

const usedPlayerLines = new Set();
const usedNpcLineIds = new Set();
const usedNormalMeetings = new Set();
const usedMissingMeetings = new Set();

const player = {
  x: 0, y: 0, z: 11.5,
  vy: 0, onGround: true, crouching: false,
  yaw: 0, pitch: 0,
  walkSpeed: 5.2, crouchSpeed: 2.8, stealth: 0.72, itemsStolen: 0
};

// --- THREE.JS SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205);
scene.fog = new THREE.FogExp2(0x020205, 0.078);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 75);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.outputEncoding = THREE.sRGBEncoding;
document.getElementById("viewport").appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0x181c28, 0.30);
scene.add(ambientLight);

const downstairsLamp = new THREE.PointLight(0xff9e44, 0.85, 17);
downstairsLamp.position.set(-4, 3.4, 4);
scene.add(downstairsLamp);

const upstairsMoon = new THREE.PointLight(0x3a4c7a, 0.45, 22);
upstairsMoon.position.set(-4, 7.3, -4);
scene.add(upstairsMoon);

const studyLamp = new THREE.PointLight(0xffb454, 0.55, 8);
studyLamp.position.set(-11.5, 5.4, 11.0);
scene.add(studyLamp);

const alarmLight = new THREE.PointLight(0xff1111, 0, 38);
alarmLight.position.set(0, 3.5, 0);
scene.add(alarmLight);

const flashlight = new THREE.SpotLight(0xfff1cc, 3.4, 21, Math.PI / 5.5, 0.62, 1.25);
const flashTarget = new THREE.Object3D();
flashTarget.position.set(0, 0, -1);
camera.add(flashlight);
camera.add(flashTarget);
flashlight.target = flashTarget;
scene.add(camera);

// --- TEXTURES (sRGB ENCODED) ---
const texLoader = new THREE.TextureLoader();
function loadTiledTexture(path, repeatX, repeatY) {
  const tex = texLoader.load(path, undefined, undefined, () => {});
  tex.encoding = THREE.sRGBEncoding;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

const wallMat = new THREE.MeshStandardMaterial({ map: loadTiledTexture("assets/textures/wallpaper.jpg", 6, 2), color: 0x7d746d, roughness: 0.92 });
const upperWallMat = new THREE.MeshStandardMaterial({ map: loadTiledTexture("assets/textures/wallpaper.jpg", 6, 2), color: 0x5e4247, roughness: 0.94 });
const floorMat = new THREE.MeshStandardMaterial({ map: loadTiledTexture("assets/textures/wood_floor.jpg", 8, 8), color: 0x786250, roughness: 0.85 });
const ceilingMat = new THREE.MeshStandardMaterial({ map: loadTiledTexture("assets/textures/ceiling.jpg", 6, 6), color: 0x454545, roughness: 0.96 });
const stairMat = new THREE.MeshStandardMaterial({ map: loadTiledTexture("assets/textures/wood_floor.jpg", 2, 2), color: 0x593f2c, roughness: 0.84 });
const doorMat = new THREE.MeshStandardMaterial({ map: loadTiledTexture("assets/textures/wood_floor.jpg", 1, 2), color: 0x4f311c, roughness: 0.75 });
const darkWoodMat = new THREE.MeshStandardMaterial({ map: loadTiledTexture("assets/textures/wood_floor.jpg", 1, 1), color: 0x3b2618, roughness: 0.8 });
const cushionMat = new THREE.MeshStandardMaterial({ color: 0x382028, roughness: 0.9 });
const sheetMat = new THREE.MeshStandardMaterial({ color: 0x7a736e, roughness: 0.92 });
const pillowMat = new THREE.MeshStandardMaterial({ color: 0xc9c2b8, roughness: 0.88 });
const goldTrimMat = new THREE.MeshStandardMaterial({ color: 0xc29b38, metalness: 0.7, roughness: 0.3 });

const colliders = [];
let mainDoorPivot = null;

function addBox(w, h, d, x, y, z, mat, solid = true, blocksLOS = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  if (solid) {
    colliders.push({
      minX: x - w / 2 - 0.34, maxX: x + w / 2 + 0.34,
      minZ: z - d / 2 - 0.34, maxZ: z + d / 2 + 0.34,
      minY: y - h / 2, maxY: y + h / 2,
      // Exact visual bounds for C++ LOS raycast
      losMinX: x - w / 2, losMaxX: x + w / 2,
      losMinY: y - h / 2, losMaxY: y + h / 2,
      losMinZ: z - d / 2, losMaxZ: z + d / 2,
      blocksLOS
    });
  }
  return mesh;
}

// --- COMPOSITE MULTI-PART FURNITURE ---
function addTable(x, y, z, w, d, h = 0.85) {
  addBox(w, 0.08, d, x, y + h, z, darkWoodMat, false);
  const lx = w / 2 - 0.1, lz = d / 2 - 0.1;
  [[-lx,-lz],[lx,-lz],[-lx,lz],[lx,lz]].forEach(([ox, oz]) => {
    addBox(0.1, h, 0.1, x + ox, y + h / 2, z + oz, darkWoodMat, false);
  });
  colliders.push({
    minX: x - w/2 - 0.3, maxX: x + w/2 + 0.3, minZ: z - d/2 - 0.3, maxZ: z + d/2 + 0.3,
    minY: y, maxY: y + h + 0.2, blocksLOS: false
  });
}

function addChair(x, y, z, facingZ = 1) {
  addBox(0.55, 0.07, 0.55, x, y + 0.45, z, darkWoodMat, false);
  addBox(0.55, 0.55, 0.07, x, y + 0.72, z - facingZ * 0.24, darkWoodMat, false);
  [[-0.22,-0.22],[0.22,-0.22],[-0.22,0.22],[0.22,0.22]].forEach(([ox, oz]) => {
    addBox(0.06, 0.45, 0.06, x + ox, y + 0.225, z + oz, darkWoodMat, false);
  });
}

function addBed(x, y, z) {
  addBox(2.4, 0.35, 2.2, x, y + 0.175, z, darkWoodMat, false);
  addBox(2.45, 1.25, 0.15, x, y + 0.625, z - 1.05, darkWoodMat, false);
  addBox(2.25, 0.26, 2.0, x, y + 0.45, z + 0.04, sheetMat, false);
  addBox(0.75, 0.14, 0.42, x - 0.52, y + 0.63, z - 0.68, pillowMat, false);
  addBox(0.75, 0.14, 0.42, x + 0.52, y + 0.63, z - 0.68, pillowMat, false);
  colliders.push({
    minX: x - 1.5, maxX: x + 1.5, minZ: z - 1.4, maxZ: z + 1.4,
    minY: y, maxY: y + 1.3, blocksLOS: false
  });
}

function addSofa(x, y, z) {
  addBox(2.8, 0.42, 0.95, x, y + 0.21, z, cushionMat, false);
  addBox(2.8, 0.65, 0.22, x, y + 0.62, z + 0.38, cushionMat, false);
  addBox(0.24, 0.58, 0.95, x - 1.32, y + 0.42, z, cushionMat, false);
  addBox(0.24, 0.58, 0.95, x + 1.32, y + 0.42, z, cushionMat, false);
  colliders.push({
    minX: x - 1.7, maxX: x + 1.7, minZ: z - 0.75, maxZ: z + 0.75,
    minY: y, maxY: y + 1.0, blocksLOS: false
  });
}

function addBookshelf(x, y, z) {
  addBox(0.55, 2.5, 2.2, x, y + 1.25, z, darkWoodMat, true, true);
  const bookColors = [0x6e1f24, 0x1f3a52, 0x2f4d2e, 0x6b5323];
  for (let s = 0; s < 4; s++) {
    const mat = new THREE.MeshStandardMaterial({ color: bookColors[s], roughness: 0.85 });
    addBox(0.32, 0.34, 1.85, x + 0.14, y + 0.45 + s * 0.54, z, mat, false);
  }
}

function addFramedPainting(x, y, z, rotY = 0) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.08), goldTrimMat);
  const canvas = new THREE.Mesh(new THREE.BoxGeometry(1.18, 1.58, 0.1), new THREE.MeshStandardMaterial({ color: 0x1a1418, roughness: 0.9 }));
  g.add(frame, canvas);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  scene.add(g);
}

function buildHouseAndFurniture() {
  addBox(28, 0.2, 28, 0, -0.1, 0, floorMat, false);
  addBox(28, 0.2, 28, 0, 8.1, 0, ceilingMat, false);

  addBox(28, 8, 0.4, 0, 4, -14, wallMat);
  addBox(0.4, 8, 28, -14, 4, 0, wallMat);
  addBox(0.4, 8, 28, 14, 4, 0, wallMat);

  addBox(12.5, 8, 0.4, -7.75, 4, 14, wallMat);
  addBox(12.5, 8, 0.4,  7.75, 4, 14, wallMat);
  addBox(3.0, 4.6, 0.4, 0, 5.7, 14, wallMat);

  mainDoorPivot = new THREE.Group();
  mainDoorPivot.position.set(-1.4, 0, 14);
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.3, 0.2), doorMat);
  doorMesh.position.set(1.4, 1.65, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), goldTrimMat);
  knob.position.set(2.45, 1.55, -0.16);
  mainDoorPivot.add(doorMesh, knob);
  scene.add(mainDoorPivot);

  addBox(24, 0.2, 28, -2, 4.0, 0, floorMat, false);
  addBox(4, 0.2, 8, 12, 4.0, -10, floorMat, false);
  addBox(4, 0.2, 8, 12, 4.0, 10, floorMat, false);

  const steps = 18;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    addBox(3.6, 0.25, 12 / steps + 0.12, 12, t * 4.1 + 0.12, 6 - t * 12 - 0.3, stairMat, false);
  }
  addBox(0.2, 3.4, 10.0, 9.8, 1.7, 0.8, stairMat, true, true);

  // Interior Walls (block LOS!)
  addBox(0.3, 4, 9, -2, 2, -9.5, wallMat, true, true);
  addBox(0.3, 4, 8, -2, 2, 5, wallMat, true, true);
  addBox(0.3, 4, 10, 2, 6, -9, upperWallMat, true, true);
  addBox(0.3, 4, 10, 2, 6, 9, upperWallMat, true, true);
  addBox(0.3, 4, 9, -5, 6, -4, upperWallMat, true, true);
  addBox(9, 4, 0.3, -9.5, 6, 2, upperWallMat, true, true);

  // Ground Floor Furniture
  addTable(-9.2, 0, -6.5, 3.2, 1.6, 0.82);
  addChair(-9.8, 0, -7.7, 1);
  addChair(-8.6, 0, -7.7, 1);
  addChair(-9.8, 0, -5.3, -1);
  addChair(-8.6, 0, -5.3, -1);

  addSofa(-9.5, 0, 8.8);
  addTable(-9.5, 0, 6.8, 1.6, 0.8, 0.45);
  addBookshelf(-13.4, 0, 3.5);
  addFramedPainting(-13.72, 2.2, -6.5, Math.PI / 2);
  addFramedPainting(13.72, 2.2, 10.0, -Math.PI / 2);

  // Upper Floor Furniture
  addBed(11.6, 4.1, -11.6);
  addTable(6.0, 4.1, -12.2, 0.9, 0.9, 0.8);
  addTable(-11.5, 4.1, 11.4, 1.9, 1.1, 0.82);
  addChair(-11.5, 4.1, 10.2, 1);
  addBookshelf(-13.4, 4.1, 6.5);
  addBox(0.9, 0.95, 0.9, -11.8, 4.575, -11.8, darkWoodMat, true, false);
  addFramedPainting(-13.72, 6.1, -7.0, Math.PI / 2);
}
buildHouseAndFurniture();

function syncCollidersToWASM() {
  if (!cppClearColliders || !cppAddCollider) return;
  cppClearColliders();
  for (const c of colliders) {
    if (c.blocksLOS) {
      cppAddCollider(c.losMinX, c.losMaxX, c.losMinY, c.losMaxY, c.losMinZ, c.losMaxZ);
    }
  }
}

// --- CUSTOM 3D ITEMS ---
function createCustomItemMesh(type, x, y, z) {
  const group = new THREE.Group();
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xe3b341, emissive: 0x5c4208, metalness: 0.85, roughness: 0.2 });
  const silverMat = new THREE.MeshStandardMaterial({ color: 0xd0d7de, emissive: 0x30363d, metalness: 0.9, roughness: 0.15 });
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x5c1a1b, emissive: 0x240708, roughness: 0.7 });

  if (type === "key") {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 10, 18), silverMat); bow.position.x = -0.22;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 10), silverMat); shaft.rotation.z = Math.PI / 2;
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.04), silverMat); t1.position.set(0.14, -0.06, 0);
    group.add(bow, shaft, t1);
  } else if (type === "ledger") {
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.56), leatherMat);
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.52), new THREE.MeshStandardMaterial({ color: 0xe6dec5 }));
    pages.position.x = 0.02;
    group.add(cover, pages);
  } else {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 20), goldMat); body.rotation.x = Math.PI / 2;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshStandardMaterial({ color: 0xd93838, emissive: 0x590d0d }));
    gem.position.z = 0.04;
    group.add(body, gem);
  }

  group.position.set(x, y, z);
  scene.add(group);
  return group;
}

// --- 2-FLOOR CONNECTED NAVIGATION GRAPH ---
const NAV_NODES = [
  { id: 0,  x: 12.0, y: 4.1,  z: -8.0,  neighbors: [1, 9] },
  { id: 1,  x:  6.0, y: 4.1,  z: -8.0,  neighbors: [0, 2] },
  { id: 2,  x:  6.0, y: 4.1,  z:  0.0,  neighbors: [1, 3, 4] },
  { id: 3,  x:  6.0, y: 4.1,  z:  8.5,  neighbors: [2] },
  { id: 4,  x: -1.5, y: 4.1,  z:  0.0,  neighbors: [2, 5, 7] },
  { id: 5,  x: -1.5, y: 4.1,  z: -10.5, neighbors: [4, 6] },
  { id: 6,  x: -9.0, y: 4.1,  z: -10.5, neighbors: [5] },
  { id: 7,  x: -1.5, y: 4.1,  z:  7.5,  neighbors: [4, 8] },
  { id: 8,  x: -9.0, y: 4.1,  z:  7.5,  neighbors: [7] },
  { id: 9,  x: 12.0, y: 4.1,  z: -6.0,  neighbors: [0, 10] },
  { id: 10, x: 12.0, y: 2.05, z:  0.0,  neighbors: [9, 11] },
  { id: 11, x: 12.0, y: 0.0,  z:  6.5,  neighbors: [10, 12, 13] },
  { id: 12, x:  3.5, y: 0.0,  z: 10.5,  neighbors: [11, 13, 15] },
  { id: 13, x:  4.0, y: 0.0,  z: -1.5,  neighbors: [11, 12, 14] },
  { id: 14, x: -5.5, y: 0.0,  z: -1.5,  neighbors: [13] },
  { id: 15, x: -5.5, y: 0.0,  z: 11.0,  neighbors: [12] }
];

const FLOOR2_PATROL_NODES = [1, 2, 3, 4, 5, 6, 7, 8];
const FLOOR1_CHECK_NODES = [12, 14, 15];

function findNearestNode(x, y, z) {
  let best = 0, bestDist = Infinity;
  for (const n of NAV_NODES) {
    const d = Math.hypot(n.x - x, (n.y - y) * 2.5, n.z - z);
    if (d < bestDist) { bestDist = d; best = n.id; }
  }
  return best;
}

function findPathBFS(startId, goalId) {
  if (startId === goalId) return [goalId];
  const queue = [[startId]];
  const visited = new Set([startId]);
  while (queue.length > 0) {
    const path = queue.shift();
    const curr = path[path.length - 1];
    for (const next of NAV_NODES[curr].neighbors) {
      if (next === goalId) return [...path, next];
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([...path, next]);
      }
    }
  }
  return [startId];
}

function lerpAngle(current, target, alpha) {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * alpha;
}

// --- MIXAMO GLB + CACHING (LOADED ONCE, REUSED ON RESET) ---
function createFallbackRig(coatColor, isFemale) {
  const group = new THREE.Group();
  const coatMat = new THREE.MeshStandardMaterial({ color: coatColor, roughness: 0.75 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd8b4a0, roughness: 0.65 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x181311, roughness: 0.85 });

  const upperBody = new THREE.Group(); upperBody.position.y = 0.78;
  const torso = new THREE.Mesh(
    isFemale ? new THREE.CylinderGeometry(0.22, 0.40, 0.92, 16) : new THREE.CylinderGeometry(0.28, 0.24, 0.86, 14),
    coatMat
  );
  torso.position.y = 0.36;
  const headPivot = new THREE.Group(); headPivot.position.y = 0.98;
  headPivot.add(new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 16), skinMat));
  upperBody.add(torso, headPivot);
  group.add(upperBody);

  const leftLegPivot = new THREE.Group(); leftLegPivot.position.set(-0.14, 0.76, 0);
  const lLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.76, 10), darkMat); lLeg.position.y = -0.38;
  leftLegPivot.add(lLeg);
  const rightLegPivot = new THREE.Group(); rightLegPivot.position.set(0.14, 0.76, 0);
  rightLegPivot.add(lLeg.clone());
  group.add(leftLegPivot, rightLegPivot);

  scene.add(group);
  return { group, upperBody, headPivot, leftLegPivot, rightLegPivot };
}

const gltfLoader = new THREE.GLTFLoader();
const mixers = [];
const animClock = new THREE.Clock();
let sharedStabClip = null;
let sharedIdleClip = null;
let sharedStalkClip = null;

function loadOptionalClip(path) {
  return new Promise((resolve) => {
    gltfLoader.load(
      path,
      (gltf) => resolve(gltf.animations && gltf.animations.length > 0 ? gltf.animations[0] : null),
      undefined,
      () => resolve(null)
    );
  });
}

async function loadExtraAnimations() {
  [sharedStabClip, sharedIdleClip, sharedStalkClip] = await Promise.all([
    loadOptionalClip("assets/models/Stabbing.glb"),
    loadOptionalClip("assets/models/idle.glb"),
    loadOptionalClip("assets/models/stalk.glb")
  ]);
}

function setNPCClip(npc, clip, loopOnce = false) {
  if (!npc.mixer || !clip) return;
  if (npc.currentAction && npc.currentAction.getClip() === clip && !loopOnce) return;
  const next = npc.mixer.clipAction(clip);
  next.reset();
  if (loopOnce) {
    next.setLoop(THREE.LoopOnce);
    next.clampWhenFinished = true;
  } else {
    next.setLoop(THREE.LoopRepeat);
  }
  next.play();
  if (npc.currentAction && npc.currentAction !== next) {
    npc.currentAction.crossFadeTo(next, 0.25, false);
  }
  npc.currentAction = next;
}

function attachMixamoModel(npc, modelPath) {
  gltfLoader.load(
    modelPath,
    (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const height = box.max.y - box.min.y;
      if (height > 0) model.scale.setScalar(1.76 / height);

      npc.rig.upperBody.visible = false;
      npc.rig.leftLegPivot.visible = false;
      npc.rig.rightLegPivot.visible = false;

      npc.rig.group.add(model);
      npc.glbModel = model;

      const mixer = new THREE.AnimationMixer(model);
      npc.mixer = mixer;
      mixers.push(mixer);

      npc.walkClip = (gltf.animations && gltf.animations.length > 0) ? gltf.animations[0] : null;
      if (npc.walkClip) {
        npc.currentAction = mixer.clipAction(npc.walkClip);
        npc.currentAction.play();
      }
    },
    undefined,
    () => {}
  );
}

let items = [];
let npcs = [];
let creakySpots = [];

function generateCreakySpots() {
  creakySpots = [];
  for (let i = 0; i < 6; i++) {
    creakySpots.push({ x: -10 + Math.random() * 17, z: -10 + Math.random() * 20, radius: 1.7 });
  }
}

function assignNewPath(npc, targetNodeId) {
  const startNode = findNearestNode(npc.x, npc.y, npc.z);
  const path = findPathBFS(startNode, targetNodeId);
  npc.path = path.length > 1 ? path.slice(1) : path;
}

function initNPCsOnce() {
  if (npcs.length > 0) return;
  npcs = [
    { name: "Arthur",  rig: createFallbackRig(0x3a1f1f, false) },
    { name: "Eleanor", rig: createFallbackRig(0x1f243a, true) }
  ];
  attachMixamoModel(npcs[0], "assets/models/arthur.glb");
  attachMixamoModel(npcs[1], "assets/models/eleanor.glb");
}

function resetWorld() {
  items.forEach(it => scene.remove(it.mesh));
  usedPlayerLines.clear();
  usedNpcLineIds.clear();
  usedNormalMeetings.clear();
  usedMissingMeetings.clear();

  const cfg = MODES[selectedMode];
  player.x = 0; player.y = 0; player.z = 11.5;
  player.vy = 0; player.onGround = true; player.crouching = false;
  player.yaw = 0; player.pitch = 0;
  player.itemsStolen = 0;
  flashlightOn = true;
  flashlight.intensity = 3.4;
  lockdownStrikes = 0;
  lockdown = false;
  spotCooldown = 0;
  lightAlertCooldown = 0;
  creakCooldown = 0;
  meetingCooldown = 0;
  lockdownTrackTimer = 0;
  npcsKnowItemsMissing = false;
  playerMissingFromFloor1 = false;
  lastNoticedItem = null;
  lastHudKey = "";
  alarmLight.intensity = 0;
  ambientLight.color.setHex(0x181c28);
  mainDoorPivot.rotation.y = 0;
  document.getElementById("damage-flash").style.background = "rgba(160,0,0,0)";
  document.getElementById("alert-feed").classList.add("hidden");

  generateCreakySpots();

  items = [
    { id: "key",    name: "Silver Key",    type: "key",    x: -11.8, y: 5.3,  z: -11.8, stolen: false, noticedMissing: false },
    { id: "ledger", name: "Secret Ledger", type: "ledger", x: -11.5, y: 5.15, z:  11.4, stolen: false, noticedMissing: false },
    { id: "locket", name: "Gold Locket",   type: "locket", x:   6.0, y: 5.15, z: -12.2, stolen: false, noticedMissing: false }
  ];
  items.forEach(it => { it.mesh = createCustomItemMesh(it.type, it.x, it.y, it.z); });

  initNPCsOnce();

  Object.assign(npcs[0], {
    x: 6.0, y: 4.1, z: -8.0, speed: cfg.npcSpeed, range: 4.2,
    path: [2, 4], pauseTimer: 0, mood: [0.5, 0.1, 0.1],
    checkingFloor1: false, sawPlayerOnFloor1: false, floor1Cooldown: 14.0,
    investigateTimer: 0, meetingTimer: 0
  });
  Object.assign(npcs[1], {
    x: -9.0, y: 4.1, z: 7.5, speed: cfg.npcSpeed * 0.95, range: 4.2,
    path: [7, 4], pauseTimer: 0, mood: [0.5, 0.1, 0.1],
    checkingFloor1: false, sawPlayerOnFloor1: false, floor1Cooldown: 24.0,
    investigateTimer: 0, meetingTimer: 0
  });
  npcs.forEach(n => {
    n.rig.group.position.set(n.x, n.y, n.z);
    if (n.mixer && n.walkClip) setNPCClip(n, n.walkClip);
  });

  updateHUD(true);
}

// --- LOADING SEQUENCE (HARDENED WITH ERROR RECOVERY) ---
async function runLoadingScreen() {
  state = "LOADING";
  document.getElementById("screen-title").classList.add("hidden");
  document.getElementById("screen-loading").classList.remove("hidden");

  const bar = document.getElementById("loading-bar");
  const txt = document.getElementById("loading-text");
  const setProgress = (pct, label) => { bar.style.width = `${pct}%`; txt.textContent = label; };

  try {
    if (!enginesLoaded) {
      if (typeof ort !== "undefined" && ort.env && ort.env.wasm) {
        ort.env.wasm.numThreads = 1; // Required for HF Spaces (no COOP/COEP)
      }

      setProgress(20, "Loading dialogue script & animations...");
      const res = await fetch("dialogues.json");
      if (!res.ok) throw new Error(`dialogues.json HTTP ${res.status}`);
      dialogues = await res.json();
      await loadExtraAnimations();

      setProgress(55, "Initializing C++ WebAssembly engine...");
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("WASM init timed out")), 10000);
        const done = () => { clearTimeout(timer); resolve(); };
        if (typeof Module !== "undefined" && (Module.calledRun || Module._cpp_euclidean_score || Module.asm)) {
          done();
        } else if (typeof Module !== "undefined") {
          Module.onRuntimeInitialized = done;
        } else {
          reject(new Error("house_engine.js not loaded"));
        }
      });

      cppClearColliders = Module.cwrap("cpp_clear_colliders", null, []);
      cppAddCollider    = Module.cwrap("cpp_add_collider", null, ["number","number","number","number","number","number"]);
      cppHasLOS         = Module.cwrap("cpp_has_los", "number", ["number","number","number","number","number","number"]);
      cppIsSpottedLOS   = Module.cwrap("cpp_is_spotted_los", "number", ["number","number","number","number","number","number","number","number","number"]);
      cppEuclideanScore = Module.cwrap("cpp_euclidean_score", "number", ["number","number","number","number","number","number"]);
      cppRuleDelta      = Module.cwrap("cpp_rule_delta", "number", ["number","number"]);
      syncCollidersToWASM();

      setProgress(85, "Loading 9-Feature PyTorch ONNX brain...");
      try {
        ortSession = await ort.InferenceSession.create("npc_brain.onnx");
      } catch (onnxErr) {
        console.warn("ONNX failed to load, falling back to C++ rules:", onnxErr);
        ortSession = null;
      }

      enginesLoaded = true;
      document.getElementById("engine-status").textContent = ortSession
        ? "Ready: 3D WebGL + C++ Raycast WASM + PyTorch ONNX"
        : "Ready: 3D WebGL + C++ Raycast WASM (Rule Fallback)";
    }

    setProgress(100, "Entering the house...");
    resetWorld();

    setTimeout(() => {
      document.getElementById("screen-loading").classList.add("hidden");
      state = "PLAYING";
      animClock.getDelta(); // flush dt spike
      safeLock();
    }, 350);
  } catch (err) {
    console.error("Boot failed:", err);
    txt.textContent = `Load error: ${err.message}. Refresh the page to retry.`;
  }
}

// --- HUD (DIRTY-FLAGGED FOR ZERO DOM THRASH) ---
function isMLActive() { return gameCount >= 5 && ortSession !== null; }
function isUpstairs() { return player.y >= 2.8; }
function isDangerZone() { return lockdown || isUpstairs(); }

function updateHUD(force = false) {
  const ref = activeNPC || npcs[0];
  const [t, c, a] = ref ? ref.mood.map(v => Math.round(v * 100)) : [50, 10, 10];
  const zoneCode = lockdown ? 2 : isUpstairs() ? 1 : 0;
  const hudKey = `${gameCount}|${isMLActive()}|${player.itemsStolen}|${selectedMode}|${lockdownStrikes}|${zoneCode}|${t}|${c}|${a}`;
  if (!force && hudKey === lastHudKey) return;
  lastHudKey = hudKey;

  const badge = document.getElementById("mode-badge");
  badge.textContent = isMLActive() ? `PyTorch AI Active (Game ${gameCount})` : `Rule-Based (Game ${gameCount}/4)`;
  badge.className = isMLActive() ? "badge badge-ml" : "badge badge-rule";

  const cfg = MODES[selectedMode];
  document.getElementById("items-count").textContent = `${player.itemsStolen} / 3`;
  document.getElementById("diff-label").textContent = cfg.label;
  document.getElementById("strikes-count").textContent = lockdown ? `${lockdownStrikes} / ${cfg.maxStrikes}` : "∞";

  const zone = document.getElementById("zone-label");
  if (lockdown) {
    zone.textContent = "RED ZONE — ESCAPE TO MAIN DOOR!";
    zone.className = "zone-escape";
  } else if (isUpstairs()) {
    zone.textContent = "Upper Floor [RESTRICTED]";
    zone.className = "zone-danger";
  } else {
    zone.textContent = "Ground Floor (Safe)";
    zone.className = "zone-safe";
  }

  document.getElementById("trust-val").textContent = `${t}%`;
  document.getElementById("curiosity-val").textContent = `${c}%`;
  document.getElementById("aggression-val").textContent = `${a}%`;
  document.getElementById("trust-fill").style.width = `${t}%`;
  document.getElementById("curiosity-fill").style.width = `${c}%`;
  document.getElementById("aggression-fill").style.width = `${a}%`;
}

// --- CREAKY FLOORBOARD BRAIN DECISION ---
function handleCreakSound(soundX, soundZ) {
  SFX.playCreak();
  creakCooldown = 3.4;

  const targetNode = findNearestNode(soundX, 4.1, soundZ);
  let approachingNames = [];
  for (const npc of npcs) {
    if (npc.meetingTimer > 0) continue;
    const dist = Math.hypot(npc.x - soundX, npc.z - soundZ);
    const score = (npc.mood[1] * 0.65) + (npc.mood[2] * 0.45) + (npcsKnowItemsMissing ? 0.35 : 0) + (dist < 11 ? 0.25 : 0);
    if (score >= 0.34) {
      assignNewPath(npc, targetNode);
      npc.investigateTimer = 5.5;
      npc.checkingFloor1 = false;
      approachingNames.push(npc.name);
    }
  }

  if (approachingNames.length > 0) {
    showAlert(`CREAK! ${approachingNames.join(" & ")} heard the floorboard and is approaching!`, "danger", 4200);
  } else {
    showAlert("CREAK! Wood groaned upstairs... no one came over.", "warn", 3200);
  }
}

// --- CHOICE-AWARE EUCLIDEAN DIALOGUE ENGINE ---
function pickFreshPlayerOption(group) {
  let pool = group.options.filter(line => !usedPlayerLines.has(line));
  if (pool.length === 0) pool = group.options;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  usedPlayerLines.add(chosen);
  return chosen;
}

function pickBestFreshNpcLine(npc, choiceId) {
  const choiceTag = choiceId === 0 ? "bluff" : choiceId === 1 ? "charm" : "intimidate";
  let candidates = dialogues.npc_lines.filter(l => !l.triggers || l.triggers.includes(choiceTag));
  if (candidates.length === 0) candidates = dialogues.npc_lines;

  let bestLine = candidates[0];
  let bestScore = -2;
  for (const line of candidates) {
    const mv = line.mood_vector;
    let score = cppEuclideanScore(npc.mood[0], npc.mood[1], npc.mood[2], mv[0], mv[1], mv[2]);
    if (usedNpcLineIds.has(line.id)) score -= 0.45;
    if (score > bestScore) { bestScore = score; bestLine = line; }
  }
  usedNpcLineIds.add(bestLine.id);
  const rawScore = cppEuclideanScore(
    npc.mood[0], npc.mood[1], npc.mood[2],
    bestLine.mood_vector[0], bestLine.mood_vector[1], bestLine.mood_vector[2]
  );
  return { id: bestLine.id, text: bestLine.text, score: rawScore };
}

function pickFreshMeetingIndex(pool, usedSet) {
  let available = [];
  for (let i = 0; i < pool.length; i++) {
    if (!usedSet.has(i)) available.push(i);
  }
  if (available.length === 0) {
    usedSet.clear();
    for (let i = 0; i < pool.length; i++) available.push(i);
  }
  const idx = available[Math.floor(Math.random() * available.length)];
  usedSet.add(idx);
  return idx;
}

// --- CONFRONTATION & KNIFE ATTACK ---
function triggerKnifeAttack(npc, reasonText) {
  state = "KNIFE_ANIM";
  activeNPC = npc;
  activeNPC.killReason = reasonText;
  activeNPC.slashSoundPlayed = false;
  animTimer = 0;
  if (document.pointerLockElement) document.exitPointerLock();
  document.getElementById("screen-dialogue").classList.add("hidden");

  if (npc.mixer && sharedStabClip) setNPCClip(npc, sharedStabClip, true);
}

function startConfrontation(npc) {
  const cfg = MODES[selectedMode];
  if (lockdown) {
    lockdownStrikes += 1;
    updateHUD(true);
    if (lockdownStrikes > cfg.maxStrikes) {
      triggerKnifeAttack(npc, `Caught during Lockdown by ${npc.name} (${cfg.label} limit exceeded).`);
      return;
    }
  }

  state = "DIALOGUE";
  activeNPC = npc;
  keys = {};
  if (document.pointerLockElement) document.exitPointerLock();

  document.getElementById("confront-title").textContent = lockdown
    ? `Spotted by ${npc.name}! (Escape Strike ${lockdownStrikes}/${cfg.maxStrikes})`
    : `Spotted by ${npc.name}!`;
  document.getElementById("confront-sub").textContent = npcsKnowItemsMissing
    ? `${npc.name} glares at you—they know ${lastNoticedItem || "an item"} is missing!`
    : playerMissingFromFloor1
      ? `${npc.name} noticed you weren't downstairs where you belong...`
      : "Choose how to respond:";
  document.getElementById("npc-reply").classList.add("hidden");
  document.getElementById("btn-continue").classList.add("hidden");

  const box = document.getElementById("choices-container");
  box.innerHTML = "";
  dialogues.player_choices.forEach((group) => {
    const line = pickFreshPlayerOption(group);
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = `[${group.type}] "${line}"`;
    btn.onclick = () => handleChoice(npc, group.id);
    box.appendChild(btn);
  });

  document.getElementById("screen-dialogue").classList.remove("hidden");
  updateHUD(true);
}

async function handleChoice(npc, choiceId) {
  document.getElementById("choices-container").innerHTML = "";
  let dTrust = 0, dCur = 0, dAgg = 0;

  if (isMLActive()) {
    try {
      const inputArr = Float32Array.from([
        isDangerZone() ? 1.0 : 0.0,
        player.itemsStolen / 3.0,
        player.stealth,
        choiceId / 2.0,
        npc.mood[0],
        npc.mood[1],
        npc.mood[2],
        npcsKnowItemsMissing ? 1.0 : 0.0,
        playerMissingFromFloor1 ? 1.0 : 0.0
      ]);
      const tensor = new ort.Tensor("float32", inputArr, [1, 9]);
      const results = await ortSession.run({ player_state: tensor });
      const deltas = results.mood_deltas.data;
      [dTrust, dCur, dAgg] = [deltas[0], deltas[1], deltas[2]];
    } catch (err) {
      console.warn("ONNX inference error, using C++ rule fallback:", err);
      dTrust = cppRuleDelta(choiceId, 0);
      dCur   = cppRuleDelta(choiceId, 1);
      dAgg   = cppRuleDelta(choiceId, 2);
    }
  } else {
    dTrust = cppRuleDelta(choiceId, 0);
    dCur   = cppRuleDelta(choiceId, 1);
    dAgg   = cppRuleDelta(choiceId, 2);
  }

  // Trust has real gameplay impact: high trust softens hostility; low trust amplifies it
  if (npc.mood[0] > 0.7 && dAgg > 0) dAgg *= 0.75;
  if (npc.mood[0] < 0.25 && dAgg > 0) dAgg *= 1.25;

  npc.mood[0] = Math.max(0, Math.min(1, npc.mood[0] + dTrust));
  npc.mood[1] = Math.max(0, Math.min(1, npc.mood[1] + dCur));
  npc.mood[2] = Math.max(0, Math.min(1, npc.mood[2] + dAgg));
  updateHUD(true);

  const match = pickBestFreshNpcLine(npc, choiceId);
  SFX.playVoice(`${npc.name.toLowerCase()}_${match.id}.mp3`, 0.9);

  const replyEl = document.getElementById("npc-reply");
  replyEl.textContent = `${npc.name}: "${match.text}"`;
  replyEl.classList.remove("hidden");
  document.getElementById("btn-continue").classList.remove("hidden");
}

function endGame(title, desc) {
  state = "ENDED";
  keys = {};
  if (document.pointerLockElement) document.exitPointerLock();
  gameCount += 1;
  SafeStorage.set("woods_game_count", gameCount);
  document.getElementById("end-title").textContent = title;
  document.getElementById("end-desc").textContent = desc;
  document.getElementById("screen-dialogue").classList.add("hidden");
  document.getElementById("screen-end").classList.remove("hidden");
}

// --- COLLISION & DELTA-TIME MAIN LOOP ---
function hitsWall(nx, ny, nz) {
  const feetY = ny + 0.5;
  for (const c of colliders) {
    if (nx > c.minX && nx < c.maxX && nz > c.minZ && nz < c.maxZ && feetY > c.minY && feetY < c.maxY) {
      return true;
    }
  }
  return false;
}

let elapsed = 0;
function update() {
  const rawDt = animClock.getDelta();
  const dt = Math.min(rawDt, 0.05); // Clamp dt to prevent tunneling on lag spikes

  if (state === "PAUSED") return;

  for (const m of mixers) m.update(dt);
  elapsed += dt;

  for (const it of items) {
    if (!it.stolen) it.mesh.rotation.y += 1.5 * dt;
  }

  downstairsLamp.intensity = 0.80 + Math.sin(elapsed * 9.0) * 0.08 + (Math.random() > 0.97 ? -0.35 : 0);

  // --- KNIFE ATTACK ANIMATION ---
  if (state === "KNIFE_ANIM") {
    animTimer += dt;
    const npc = activeNPC;
    const dirX = -Math.sin(player.yaw);
    const dirZ = -Math.cos(player.yaw);
    const dist = Math.max(1.15, 2.2 - animTimer * 1.4);
    npc.rig.group.position.set(player.x + dirX * dist, player.y, player.z + dirZ * dist);
    npc.rig.group.lookAt(player.x, player.y, player.z);

    if (animTimer >= 0.45) {
      if (!npc.slashSoundPlayed) { SFX.playKnifeSlash(); npc.slashSoundPlayed = true; }
      document.getElementById("damage-flash").style.background = "rgba(180, 0, 0, 0.62)";
      camera.rotation.z = Math.min(0.95, (animTimer - 0.45) * 1.8);
      camera.position.y = Math.max(player.y + 0.4, player.y + 1.65 - (animTimer - 0.45) * 1.9);
    }

    if (animTimer >= 1.45) {
      camera.rotation.z = 0;
      endGame("Game Over — Eliminated", activeNPC.killReason);
    }
    return;
  }

  // --- ESCAPE ANIMATION ---
  if (state === "ESCAPE_ANIM") {
    animTimer += dt;
    mainDoorPivot.rotation.y = Math.min(Math.PI * 0.6, animTimer * 1.3);
    player.z += 4.2 * dt;
    camera.position.set(player.x, 1.65, player.z);
    camera.lookAt(0, 1.65, 24);
    if (animTimer >= 1.6) {
      endGame("Escaped!", "You stole all 3 artifacts and slipped out the front door into the woods.");
    }
    return;
  }

  if (state !== "PLAYING") return;

  const cfg = MODES[selectedMode];
  if (lockdown) {
    alarmLight.intensity = 1.4 + Math.sin(elapsed * 5.0) * 0.9;
    ambientLight.color.setHex(0x3a1014);
  }

  // Player Movement & Crouch
  player.crouching = Boolean(keys["shift"]);
  player.stealth = player.crouching ? 0.96 : 0.72;
  const activeSpeed = player.crouching ? player.crouchSpeed : player.walkSpeed;

  let forward = 0, strafe = 0;
  if (keys["w"] || keys["arrowup"])    forward += 1;
  if (keys["s"] || keys["arrowdown"])  forward -= 1;
  if (keys["a"] || keys["arrowleft"])  strafe -= 1;
  if (keys["d"] || keys["arrowright"]) strafe += 1;

  const mag = Math.hypot(forward, strafe);
  if (mag > 0) { forward /= mag; strafe /= mag; }
  const isMoving = mag > 0;

  const sinY = Math.sin(player.yaw);
  const cosY = Math.cos(player.yaw);
  const dx = (-sinY * forward + cosY * strafe) * activeSpeed * dt;
  const dz = (-cosY * forward - sinY * strafe) * activeSpeed * dt;

  if (!hitsWall(player.x + dx, player.y, player.z)) player.x += dx;
  if (!hitsWall(player.x, player.y, player.z + dz)) player.z += dz;
  if (player.z > 13.3) player.z = 13.3;

  // Floor height + Jump + Gravity (dt-scaled)
  let floorY = 0;
  if (player.x > 10.2 && player.z >= -6.2 && player.z <= 6.2) {
    const t = Math.max(0, Math.min(1, (6 - player.z) / 12));
    floorY = t * 4.1;
  } else if (player.y >= 2.2) {
    floorY = 4.1;
  }

  if (keys[" "] && player.onGround) {
    player.vy = 5.6;
    player.onGround = false;
  }
  player.vy -= 16.0 * dt;
  player.y += player.vy * dt;
  if (player.y <= floorY) {
    player.y = floorY;
    player.vy = 0;
    player.onGround = true;
  }

  if (isMoving && player.onGround) {
    stepSoundTimer -= dt;
    if (stepSoundTimer <= 0) {
      SFX.playStep(player.crouching);
      stepSoundTimer = player.crouching ? 0.56 : 0.40;
    }
  }

  const eyeHeight = player.crouching ? 1.15 : 1.65;
  const bob = (player.onGround && isMoving)
    ? Math.sin(elapsed * (player.crouching ? 6.5 : 9.5)) * (player.crouching ? 0.02 : 0.04)
    : Math.sin(elapsed * 2.0) * 0.008;
  camera.position.set(player.x, player.y + eyeHeight + bob, player.z);
  camera.rotation.order = "YXZ";
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  // Creaky Floorboards
  if (creakCooldown > 0) creakCooldown -= dt;
  if (isUpstairs() && isMoving && player.onGround && creakCooldown <= 0) {
    for (const spot of creakySpots) {
      if (Math.hypot(player.x - spot.x, player.z - spot.z) < spot.radius) {
        handleCreakSound(player.x, player.z);
        break;
      }
    }
  }

  // Nearby Items / Main Door
  nearbyItem = null;
  for (const it of items) {
    if (!it.stolen && Math.hypot(player.x - it.x, player.z - it.z) < 2.3 && Math.abs(player.y + 1 - it.y) < 1.7) {
      nearbyItem = it;
      break;
    }
  }
  nearMainDoor = lockdown && !isUpstairs() && Math.hypot(player.x - 0, player.z - 13.2) < 2.6;

  const prompt = document.getElementById("interact-prompt");
  if (nearMainDoor) {
    prompt.textContent = "Press [E] to Escape through Main Door!";
    prompt.classList.remove("hidden");
  } else if (nearbyItem) {
    prompt.textContent = `Press [E] to Steal ${nearbyItem.name}`;
    prompt.classList.remove("hidden");
  } else {
    prompt.classList.add("hidden");
  }

  if (spotCooldown > 0) spotCooldown -= dt;
  if (lightAlertCooldown > 0) lightAlertCooldown -= dt;
  if (meetingCooldown > 0) meetingCooldown -= dt;

  // Heartbeat Tension Audio
  let nearestNpcDist = Infinity;
  for (const n of npcs) {
    if (Math.abs(n.y - player.y) < 2.0) {
      nearestNpcDist = Math.min(nearestNpcDist, Math.hypot(n.x - player.x, n.z - player.z));
    }
  }
  if (nearestNpcDist < 7.5 || lockdown) {
    heartbeatTimer -= dt;
    if (heartbeatTimer <= 0) {
      const intensity = lockdown ? 0.9 : Math.max(0.25, 1.0 - nearestNpcDist / 8.0);
      SFX.playHeartbeat(intensity);
      heartbeatTimer = Math.max(0.45, 0.95 - intensity * 0.42);
    }
  }

  // Non-Repeating 5-Second NPC Meetings
  if (meetingCooldown <= 0 && npcs.length === 2 && Math.abs(npcs[0].y - npcs[1].y) < 0.8) {
    if (Math.hypot(npcs[0].x - npcs[1].x, npcs[0].z - npcs[1].z) < 2.6) {
      npcs[0].meetingTimer = 5.0;
      npcs[1].meetingTimer = 5.0;
      meetingCooldown = 18.0;

      const pool = npcsKnowItemsMissing ? dialogues.npc_meetings_missing : dialogues.npc_meetings_normal;
      const usedSet = npcsKnowItemsMissing ? usedMissingMeetings : usedNormalMeetings;
      const idx = pickFreshMeetingIndex(pool, usedSet);
      const line = pool[idx];

      const playerDist = Math.hypot(player.x - npcs[0].x, player.z - npcs[0].z);
      const sameFloor = Math.abs(player.y - npcs[0].y) < 1.8;
      const vol = sameFloor ? Math.max(0.15, 1.0 - playerDist / 16) : 0.1;
      const clipName = npcsKnowItemsMissing ? `meeting_missing_${idx}.mp3` : `meeting_normal_${idx}.mp3`;
      SFX.playVoice(clipName, vol);
      showAlert(`[Overheard] ${line}`, "whisper", 5400);
    }
  }

  // --- UPDATE NPCs (DT-SCALED + C++ RAYCAST LOS) ---
  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i];
    if (npc.floor1Cooldown > 0) npc.floor1Cooldown -= dt;
    if (npc.investigateTimer > 0) npc.investigateTimer -= dt;

    // Gentle mood decay when not in Lockdown (prevents unavoidable arrest)
    if (!lockdown) {
      npc.mood[1] = Math.max(0.1, npc.mood[1] - 0.004 * dt);
      npc.mood[2] = Math.max(0.1, npc.mood[2] - 0.003 * dt);
    }

    if (npc.meetingTimer > 0) {
      npc.meetingTimer -= dt;
      if (npc.mixer && sharedIdleClip) setNPCClip(npc, sharedIdleClip);
      const other = npcs[1 - i];
      npc.rig.group.position.set(npc.x, npc.y, npc.z);
      npc.rig.group.lookAt(other.x, npc.y, other.z);
    } else if (npc.pauseTimer > 0) {
      npc.pauseTimer -= dt;
      if (npc.mixer && sharedIdleClip) setNPCClip(npc, sharedIdleClip);
    } else {
      // Pick next destination if path is empty
      // Active Lockdown Hunter: Eleanor (i === 1) re-tracks your position every 1.5s
      if (lockdown && i === 1) {
        lockdownTrackTimer -= dt;
        if (lockdownTrackTimer <= 0) {
          assignNewPath(npc, findNearestNode(player.x, player.y, player.z));
          lockdownTrackTimer = 1.5;
        }
      }

      // Pick next destination if path is empty
      if (!npc.path || npc.path.length === 0) {
        const otherNpc = npcs[1 - i];
        const otherIsDownstairs = otherNpc.checkingFloor1 || otherNpc.y < 2.5;

        if (lockdown && i === 0) {
          // Arthur camps & patrols between Main Door (12) and Stair Bottom (11)
          const blockNodes = [12, 11];
          assignNewPath(npc, blockNodes[Math.floor(Math.random() * blockNodes.length)]);
        } else if (lockdown && i === 1) {
          // Eleanor actively hunts your current node
          assignNewPath(npc, findNearestNode(player.x, player.y, player.z));
        } else if (npc.checkingFloor1 && npc.y < 1.0) {
          npc.checkingFloor1 = false;
          npc.floor1Cooldown = 26.0;
          if (!npc.sawPlayerOnFloor1) {
            playerMissingFromFloor1 = true;
            npc.mood[1] = Math.min(1, npc.mood[1] + 0.18);
            npc.investigateTimer = 6.0;
            showAlert(`${npc.name} checked downstairs and didn't see you! Their Curiosity spiked!`, "danger", 4600);
          } else {
            playerMissingFromFloor1 = false;
          }
          assignNewPath(npc, FLOOR2_PATROL_NODES[Math.floor(Math.random() * FLOOR2_PATROL_NODES.length)]);
        } else if (!lockdown && !otherIsDownstairs && npc.floor1Cooldown <= 0 && npc.y > 3.0) {
          // Mutual exclusion: only go downstairs if the other NPC is guarding Floor 2
          npc.checkingFloor1 = true;
          npc.sawPlayerOnFloor1 = false;
          assignNewPath(npc, FLOOR1_CHECK_NODES[Math.floor(Math.random() * FLOOR1_CHECK_NODES.length)]);
        } else if (otherIsDownstairs || (cfg.guardMissing && npcsKnowItemsMissing && Math.random() < 0.65)) {
          // Solo upstairs guard: patrol tightly between remaining un-stolen items
          const remaining = items.filter(it => !it.stolen);
          const pick = remaining.length > 0 ? remaining[Math.floor(Math.random() * remaining.length)] : null;
          const goal = pick ? findNearestNode(pick.x, 4.1, pick.z) : 4;
          assignNewPath(npc, goal);
        } else {
          const randNode = FLOOR2_PATROL_NODES[Math.floor(Math.random() * FLOOR2_PATROL_NODES.length)];
          assignNewPath(npc, randNode);
        }
      }

      const targetNode = NAV_NODES[npc.path[0]];
      const speedMult = lockdown ? 1.85 : (npc.investigateTimer > 0 ? 1.3 : 1.0);
      const stepDist = npc.speed * speedMult * dt;

      const dxN = targetNode.x - npc.x;
      const dyN = targetNode.y - npc.y;
      const dzN = targetNode.z - npc.z;
      const distN = Math.hypot(dxN, dyN, dzN);

      const oldX = npc.x, oldZ = npc.z;
      if (distN <= Math.max(0.25, stepDist)) {
        npc.x = targetNode.x;
        npc.y = targetNode.y;
        npc.z = targetNode.z;
        npc.path.shift();
        if (npc.path.length === 0) npc.pauseTimer = lockdown ? 0.25 : 1.1;
      } else {
        npc.x += (dxN / distN) * stepDist;
        npc.y += (dyN / distN) * stepDist;
        npc.z += (dzN / distN) * stepDist;
      }

      const movedX = npc.x - oldX;
      const movedZ = npc.z - oldZ;
      if (Math.hypot(movedX, movedZ) > 0.001) {
        const targetYaw = Math.atan2(movedX, movedZ);
        npc.rig.group.rotation.y = lerpAngle(npc.rig.group.rotation.y, targetYaw, Math.min(1, 8.0 * dt));
      }
      npc.rig.group.position.set(npc.x, npc.y, npc.z);

      if (npc.mixer) {
        const useStalk = Boolean(npc.investigateTimer > 0 || lockdown);
        const desiredClip = (useStalk && sharedStalkClip) ? sharedStalkClip : npc.walkClip;
        setNPCClip(npc, desiredClip);
        if (npc.currentAction) npc.currentAction.timeScale = lockdown ? 1.35 : (useStalk ? 1.15 : 0.85);
      }
    }

    const sameFloor = Math.abs(player.y - npc.y) < 1.8;

    // Floor 1 Safe Check (with C++ LOS)
    if (npc.checkingFloor1 && npc.y < 1.0 && sameFloor && Math.hypot(player.x - npc.x, player.z - npc.z) < 10.0) {
      if (cppHasLOS(npc.x, npc.y + 1.4, npc.z, player.x, player.y + 1.2, player.z) === 1) {
        npc.sawPlayerOnFloor1 = true;
      }
    }

    // Flashlight Beam Detection (with C++ LOS — walls block light!)
    if (cfg.lightDetect && flashlightOn && sameFloor && isDangerZone() && lightAlertCooldown <= 0) {
      const toNpcX = npc.x - player.x;
      const toNpcZ = npc.z - player.z;
      const dNpc = Math.hypot(toNpcX, toNpcZ);
      const fwdX = -Math.sin(player.yaw);
      const fwdZ = -Math.cos(player.yaw);
      const dot = dNpc > 0.1 ? (toNpcX / dNpc) * fwdX + (toNpcZ / dNpc) * fwdZ : 0;
      if (dNpc < 9.5 && dot > 0.72 && cppHasLOS(player.x, player.y + 1.3, player.z, npc.x, npc.y + 1.3, npc.z) === 1) {
        assignNewPath(npc, findNearestNode(player.x, player.y, player.z));
        npc.investigateTimer = 4.5;
        lightAlertCooldown = 4.5;
        showAlert(`${npc.name} spotted your flashlight beam! Turn it off with [F]!`, "warn", 3800);
      }
    }

    // Notice Missing Items + Speak
    if (npc.y > 3.0) {
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        if (it.stolen && !it.noticedMissing && Math.hypot(npc.x - it.x, npc.z - it.z) < 4.8) {
          it.noticedMissing = true;
          npcsKnowItemsMissing = true;
          lastNoticedItem = it.name;
          npc.mood[1] = Math.min(1, npc.mood[1] + 0.22);
          npc.mood[2] = Math.min(1, npc.mood[2] + 0.18);
          const tmpl = dialogues.missing_item_comments[idx % dialogues.missing_item_comments.length];
          const spoken = tmpl.replace("{item}", it.name);
          SFX.playVoice(`missing_${npc.name.toLowerCase()}_${it.id}.mp3`, 0.9);
          showAlert(`${npc.name}: "${spoken}"`, "danger", 5000);
        }
      }
    }

    // Real C++ 3D AABB Raycast + FOV Cone Spotting (Crouch shrinks range!)
    if (spotCooldown <= 0 && isDangerZone() && sameFloor) {
      const effectiveRange = player.crouching ? npc.range * 0.55 : npc.range;
      const cosHalfFov = 0.25; // ~150° total forward FOV
      if (cppIsSpottedLOS(player.x, player.y, player.z, npc.x, npc.y, npc.z, npc.rig.group.rotation.y, effectiveRange, cosHalfFov) === 1) {
        startConfrontation(npc);
        return;
      }
    }
  }

  updateHUD();
}

function animate() {
  requestAnimationFrame(animate);
  update();
  renderer.render(scene, camera);
}

// --- CONTROLS & PAUSE ON BLUR / ESC ---
function safeLock() {
  SFX.init();
  const p = renderer.domElement.requestPointerLock();
  if (p && p.catch) p.catch(() => {});
}

function pauseGame() {
  if (state !== "PLAYING") return;
  state = "PAUSED";
  keys = {};
  document.getElementById("screen-pause").classList.remove("hidden");
}

document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement && state === "PLAYING") {
    pauseGame();
  }
});

window.addEventListener("blur", () => {
  keys = {};
  if (state === "PLAYING") pauseGame();
});

renderer.domElement.addEventListener("click", () => {
  if (state === "PLAYING" && !document.pointerLockElement) safeLock();
});

document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== renderer.domElement || state !== "PLAYING") return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch - e.movementY * 0.0022));
});

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;

  if (k === "f" && state === "PLAYING") {
    flashlightOn = !flashlightOn;
    flashlight.intensity = flashlightOn ? 3.4 : 0;
  }

  if (k === "e" && state === "PLAYING") {
    if (nearMainDoor) {
      SFX.playCreak();
      state = "ESCAPE_ANIM";
      animTimer = 0;
      document.getElementById("interact-prompt").classList.add("hidden");
      if (document.pointerLockElement) document.exitPointerLock();
      return;
    }
    if (nearbyItem) {
      SFX.playPickup();
      nearbyItem.stolen = true;
      scene.remove(nearbyItem.mesh);
      player.itemsStolen++;

      if (player.itemsStolen === 3) {
        lockdown = true;
        lockdownTrackTimer = 1.5;
        // Immediate ambush: Arthur sprints to Main Door (12), Eleanor hunts you
        npcs.forEach(n => { n.pauseTimer = 0; n.meetingTimer = 0; n.checkingFloor1 = false; });
        assignNewPath(npcs[0], 12);
        assignNewPath(npcs[1], findNearestNode(player.x, player.y, player.z));
        showAlert("ALL 3 ARTIFACTS STOLEN! Arthur is blocking the Main Door — Eleanor is hunting you!", "danger", 5500);
      } else {
        // Stealing makes noise: nearest upstairs NPC investigates the room immediately
        const itemNode = findNearestNode(nearbyItem.x, 4.1, nearbyItem.z);
        let alerted = null;
        for (const n of npcs) {
          if (n.y > 2.5 && !n.checkingFloor1 && n.meetingTimer <= 0) {
            assignNewPath(n, itemNode);
            n.investigateTimer = 5.0;
            n.pauseTimer = 0;
            alerted = n.name;
            break;
          }
        }
        if (alerted) {
          showAlert(`Grabbed ${nearbyItem.name}! ${alerted} heard the noise and is heading this way!`, "warn", 3800);
        }
      }
      updateHUD(true);
    }
  }
});
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- UI BUTTONS ---
document.getElementById("btn-to-rules").onclick = () => {
  SFX.init();
  document.getElementById("screen-disclaimer").classList.add("hidden");
  document.getElementById("screen-rules").classList.remove("hidden");
};
document.getElementById("btn-to-title").onclick = () => {
  document.getElementById("screen-rules").classList.add("hidden");
  document.getElementById("screen-title").classList.remove("hidden");
};
document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    selectedMode = btn.dataset.mode;
    document.getElementById("mode-desc").textContent = MODES[selectedMode].desc;
    updateHUD(true);
  };
});
document.getElementById("btn-start-loading").onclick = () => {
  SFX.init();
  runLoadingScreen();
};
document.getElementById("btn-resume").onclick = () => {
  document.getElementById("screen-pause").classList.add("hidden");
  state = "PLAYING";
  animClock.getDelta();
  safeLock();
};
document.getElementById("btn-continue").onclick = () => {
  document.getElementById("screen-dialogue").classList.add("hidden");
  if (activeNPC.mood[2] >= 1.0) {
    triggerKnifeAttack(activeNPC, `${activeNPC.name}'s aggression hit 100%. They snapped.`);
  } else if (activeNPC.mood[1] >= 1.0) {
    endGame("Game Over — Arrested", `${activeNPC.name}'s curiosity hit 100%. They called the police.`);
  } else {
    // Send NPC away to a different patrol node so you don't get stuck in a catch loop
    const farNode = FLOOR2_PATROL_NODES[Math.floor(Math.random() * FLOOR2_PATROL_NODES.length)];
    assignNewPath(activeNPC, farNode);
    spotCooldown = 2.8;
    state = "PLAYING";
    animClock.getDelta();
    safeLock();
  }
};
document.getElementById("btn-restart").onclick = () => {
  document.getElementById("screen-end").classList.add("hidden");
  runLoadingScreen();
};
document.getElementById("toggle-ai").onclick = (e) => {
  e.preventDefault();
  gameCount = 5;
  SafeStorage.set("woods_game_count", 5);
  updateHUD(true);
};

animate();