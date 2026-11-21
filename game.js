// --- SAFE STORAGE WRAPPER (HF SPACES IFRAME SAFE) ---
const SafeStorage = {
  get(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, String(val)); } catch {}
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch {}
  },
};

// --- TUNING CONSTANTS ---
const MODEL_YAW_OFFSET = 0; // Fixes backwards-walking Mixamo models
const MOOD_GAIN = 1.8;            // Scales positive Curiosity/Aggression deltas
const gain = (d) => (d > 0 ? d * MOOD_GAIN : d);

// --- PROCEDURAL + SPOKEN VOICE AUDIO ENGINE ---
const VOICE_BASE = "assets/audio/";

const SFX = {
  ctx: null,
  currentVoice: null,
  voiceQueue: [],
  menuNodes: null,
  menuGain: null,
  menuAudio: null,
  menuFadeTimer: null,
  startMenuAmbience() {
    this.init();
    if (this.menuAudio) return;

    const audio = new Audio(`${VOICE_BASE}menu_theme.mp3`);
    audio.loop = true;
    audio.volume = 0.01;
    audio.play().catch(() => {});
    this.menuAudio = audio;

    // Smooth fade-in to 45% volume
    if (this.menuFadeTimer) clearInterval(this.menuFadeTimer);
    this.menuFadeTimer = setInterval(() => {
      if (!this.menuAudio) return clearInterval(this.menuFadeTimer);
      if (this.menuAudio.volume < 0.45) {
        this.menuAudio.volume = Math.min(0.45, this.menuAudio.volume + 0.03);
      } else {
        clearInterval(this.menuFadeTimer);
      }
    }, 80);
  },
  stopMenuAmbience() {
    if (!this.menuAudio) return;
    const audio = this.menuAudio;
    this.menuAudio = null;

    if (this.menuFadeTimer) clearInterval(this.menuFadeTimer);
    this.menuFadeTimer = setInterval(() => {
      if (audio.volume > 0.03) {
        audio.volume = Math.max(0, audio.volume - 0.03);
      } else {
        audio.pause();
        audio.currentTime = 0;
        clearInterval(this.menuFadeTimer);
      }
    }, 60);
  },
  chaseAudio: null,
  startChaseTheme() {
    if (this.chaseAudio) return;
    const audio = new Audio(`${VOICE_BASE}chase_theme.mp3`);
    audio.loop = true;
    audio.volume = 0.55;
    audio.play().catch(() => {});
    this.chaseAudio = audio;
  },
  stopChaseTheme() {
    if (!this.chaseAudio) return;
    this.chaseAudio.pause();
    this.chaseAudio.currentTime = 0;
    this.chaseAudio = null;
  },
  sirenAudio: null,
  playOneShot(filename, vol = 0.85) {
    const a = new Audio(`${VOICE_BASE}${filename}`);
    a.volume = vol;
    a.play().catch(() => {});
  },
  startSiren() {
    if (this.sirenAudio) return;
    const a = new Audio(`${VOICE_BASE}police_siren.mp3`);
    a.loop = true;
    a.volume = 0.25;
    a.play().catch(() => {});
    this.sirenAudio = a;
  },
  stopSiren() {
    if (!this.sirenAudio) return;
    this.sirenAudio.pause();
    this.sirenAudio.currentTime = 0;
    this.sirenAudio = null;
  },
  playUIClick() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.08);
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(now); osc.stop(now + 0.1);
  },
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  playVoice(filename, volume = 0.85, priority = false) {
    if (!filename) return;
    const clampedVol = Math.max(0.05, Math.min(1.0, volume));

    if (priority) {
      this.voiceQueue = [];
      if (this.currentVoice) {
        this.currentVoice.onended = null;
        this.currentVoice.onerror = null;
        this.currentVoice.pause();
        this.currentVoice = null;
      }
    } else if (this.currentVoice) {
      // Queue up to 2 ambient lines so nothing gets cut off or backlogged
      if (this.voiceQueue.length < 2) {
        this.voiceQueue.push({ filename, volume: clampedVol });
      }
      return;
    }

    const audio = new Audio(`${VOICE_BASE}${filename}`);
    audio.volume = clampedVol;
    const playNext = () => {
      if (this.currentVoice !== audio) return;
      this.currentVoice = null;
      if (this.voiceQueue.length > 0) {
        const next = this.voiceQueue.shift();
        this.playVoice(next.filename, next.volume, false);
      }
    };
    audio.onended = playNext;
    audio.onerror = playNext;
    this.currentVoice = audio;
    audio.play().catch(playNext);
  },
  playHeartbeat(intensity = 0.5) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [0, 0.16].forEach((offset, idx) => {
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(idx === 0 ? 58 : 48, now + offset);
      osc.frequency.exponentialRampToValueAtTime(28, now + offset + 0.12);
      gainNode.gain.setValueAtTime(0.14 * intensity, now + offset);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.13);
      osc.connect(gainNode); gainNode.connect(this.ctx.destination);
      osc.start(now + offset); osc.stop(now + offset + 0.14);
    });
  },
  playStep(silent = false) {
    if (!this.ctx || silent) return;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(88 + Math.random() * 20, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(32, this.ctx.currentTime + 0.07);
    gainNode.gain.setValueAtTime(0.06, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
    osc.connect(gainNode); gainNode.connect(this.ctx.destination);
    osc.start(); osc.stop(this.ctx.currentTime + 0.08);
  },
  playCreak() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.linearRampToValueAtTime(82, now + 0.22);
    osc.frequency.linearRampToValueAtTime(120, now + 0.36);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.6);
    gainNode.gain.setValueAtTime(0.15, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.62);
    osc.connect(gainNode); gainNode.connect(this.ctx.destination);
    osc.start(now); osc.stop(now + 0.63);
  },
  playPickup() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [440, 622].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gainNode.gain.setValueAtTime(0.11, now + idx * 0.09);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.28);
      osc.connect(gainNode); gainNode.connect(this.ctx.destination);
      osc.start(now + idx * 0.09); osc.stop(now + idx * 0.09 + 0.29);
    });
  },
  playKnifeSlash() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(560, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.24);
    gainNode.gain.setValueAtTime(0.26, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gainNode); gainNode.connect(this.ctx.destination);
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
let nearbyHideSpot = null;
let nearMainDoor = false;
let lockdownStrikes = 0;
let lockdown = false;
let animTimer = 0;
let stepSoundTimer = 0;
let heartbeatTimer = 0;
let creakCooldown = 0;
let meetingCooldown = 0;
let lockdownTrackTimer = 0;
let stairWarnCooldown = 0;
let introSeen = SafeStorage.get("woods_intro_seen", "0") === "1";
let introStep = 0;
let introStepTimer = 0;
let cutsceneStep = 0;
let cutsceneTimer = 0;

const STAIR_LINES = [
  "It would be better if you go back down and sit like a good boy.",
  "The upstairs is off-limits, dear. Step down before I lose my patience.",
  "Don't test me on those stairs. Get back to the ground floor.",
  "Why are you hovering on the staircase? Go downstairs where you belong.",
  "One more step up and we're going to have a problem. Down. Now."
];

const MISSING_ITEM_TEXT = {
  watch_arthur:  "Wait... where is my pocket watch? It was right here on the dresser.",
  watch_eleanor: "Arthur's pocket watch is gone... someone has been in the guest room.",
  photo_arthur:  "The family photo is missing. Who the hell touched our things?",
  photo_eleanor: "Our family photo... it's gone from the master bedroom!"
};
let npcsKnowItemsMissing = false;
let playerMissingFromFloor1 = false;
let lastNoticedItem = null;
let lastHudKey = "";

// Live AI Telemetry State ([Tab])
let telemetryVisible = false;
let telemetryTimer = 0;
let smoothedFps = 60;
let lastModelSource = "Standby";
let lastOnnxInputs = null;
let lastOnnxDeltas = null;

// Hiding & Lean State
let currentHideSpot = null;
let savedHideExit = null;
let leanAmount = 0; // -1 (left) to +1 (right)

const usedPlayerLines = new Set();
const usedNpcLineIds = new Set();
const usedStairLines = new Set();
const usedNormalMeetings = new Set();
const usedMissingMeetings = new Set();

const player = {
  x: 0, y: 0, z: 11.5,
  vy: 0, onGround: true, crouching: false, hiding: false,
  yaw: 0, pitch: 0,
  walkSpeed: 5.2, crouchSpeed: 2.8, stealth: 0.72, itemsStolen: 0
};

// --- THREE.JS SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205);
scene.fog = new THREE.FogExp2(0x020205, 0.095);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 75);
camera.rotation.order = "YXZ";
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.outputEncoding = THREE.sRGBEncoding;
document.getElementById("viewport").appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0x181c28, 0.16);
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
flashTarget.position.set(0, 0.18, -1); // Slightly raised beam
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

// ===== DECOR PROPS (non-stealable, cheap Lambert materials for Iris Xe) =====
const L = (c, e) => new THREE.MeshLambertMaterial(e ? { color: c, emissive: e } : { color: c });
const PM = {
  rugRed: L(0x5a1a1f), rugBlue: L(0x22303d), rugGreen: L(0x2e3a2a),
  pot: L(0x6b4a2f), leaf: L(0x2f5a30), white: L(0xcfcac2), counter: L(0x4a4a50),
  stone: L(0x55524e), ember: L(0xff5a1a, 0xff3a00), shade: L(0xc9a86a, 0x6b4a1a),
  flame: L(0xffc060, 0xffa030), metal: L(0x3a3a40), crate: L(0x6a5030), leather: L(0x3a2218)
};

function solidAABB(x, y, z, w, h, d) {
  colliders.push({
    minX: x - w / 2 - 0.34, maxX: x + w / 2 + 0.34,
    minZ: z - d / 2 - 0.34, maxZ: z + d / 2 + 0.34,
    minY: y, maxY: y + h, blocksLOS: false
  });
}
function addRug(x, y, z, w, d, mat) { addBox(w, 0.02, d, x, y + 0.012, z, mat, false); }

function addPlant(x, y, z) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.42, 10), PM.pot);
  pot.position.set(x, y + 0.21, z);
  const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), PM.leaf);
  leaves.position.set(x, y + 0.82, z);
  scene.add(pot, leaves);
  solidAABB(x, y, z, 0.6, 1.3, 0.6);
}
function addFloorLamp(x, y, z) {
  addBox(0.3, 0.04, 0.3, x, y + 0.02, z, PM.metal, false);
  addBox(0.05, 1.5, 0.05, x, y + 0.75, z, PM.metal, false);
  addBox(0.35, 0.28, 0.35, x, y + 1.6, z, PM.shade, false);
  solidAABB(x, y, z, 0.35, 1.7, 0.35);
}
function addCandle(x, y, z) {
  addBox(0.06, 0.3, 0.06, x, y + 0.15, z, goldTrimMat, false);
  addBox(0.05, 0.08, 0.05, x, y + 0.34, z, PM.flame, false);
}
function addWardrobe(x, y, z, facing = 1, w = 1.7, d = 0.75, h = 2.3) {
  addBox(w, h, d, x, y + h / 2, z, darkWoodMat, true, true);
  const fz = z + facing * (d / 2 + 0.02);
  addBox(0.05, 0.3, 0.04, x - 0.12, y + h / 2, fz, goldTrimMat, false);
  addBox(0.05, 0.3, 0.04, x + 0.12, y + h / 2, fz, goldTrimMat, false);
  addBox(0.03, h - 0.2, 0.03, x, y + h / 2, z + facing * (d / 2 + 0.01), PM.metal, false);
}
function addDresser(x, y, z, facing = 1, w = 1.8, d = 0.6) {
  addBox(w, 0.9, d, x, y + 0.45, z, darkWoodMat, true, false);
  addBox(w + 0.08, 0.05, d + 0.08, x, y + 0.925, z, PM.leather, false);
  for (let i = 0; i < 3; i++) addBox(0.25, 0.04, 0.04, x, y + 0.2 + i * 0.27, z + facing * (d / 2 + 0.02), goldTrimMat, false);
}
function addArmchair(x, y, z, facing = 1) {
  addBox(0.95, 0.4, 0.9, x, y + 0.3, z, cushionMat, false);
  addBox(0.95, 0.7, 0.2, x, y + 0.75, z - facing * 0.38, cushionMat, false);
  addBox(0.18, 0.5, 0.9, x - 0.5, y + 0.45, z, cushionMat, false);
  addBox(0.18, 0.5, 0.9, x + 0.5, y + 0.45, z, cushionMat, false);
  solidAABB(x, y, z, 1.2, 1.1, 1.0);
}
function addTrunk(x, y, z) {
  addBox(1.2, 0.55, 0.7, x, y + 0.275, z, PM.crate, true, false);
  addBox(1.24, 0.06, 0.74, x, y + 0.58, z, goldTrimMat, false);
}
function addCrates(x, y, z) {
  addBox(0.8, 0.8, 0.8, x, y + 0.4, z, PM.crate, true, false);
  addBox(0.6, 0.6, 0.6, x + 0.1, y + 1.1, z - 0.05, PM.crate, false);
}
function addGrandfatherClock(x, y, z) {
  addBox(0.7, 2.3, 0.45, x, y + 1.15, z, darkWoodMat, true, true);
  addBox(0.4, 0.4, 0.05, x, y + 1.85, z + 0.24, PM.shade, false);
  addBox(0.12, 0.9, 0.04, x, y + 0.9, z + 0.24, goldTrimMat, false);
}
function addFireplace(x, y, z) {
  addBox(0.7, 1.5, 2.2, x, y + 0.75, z, PM.stone, true, false);
  addBox(0.85, 0.12, 2.5, x + 0.05, y + 1.56, z, darkWoodMat, false);
  addBox(0.1, 0.8, 1.2, x + 0.38, y + 0.55, z, PM.ember, false);
}

function addDecorProps() {
  const U = 4.1;
  // Ground Floor
  addRug(5.5, 0, 5.0, 5.0, 3.4, PM.rugRed);
  addRug(-9.5, 0, 7.8, 4.2, 3.0, PM.rugBlue);
  addRug(-9.2, 0, -6.5, 4.4, 2.8, PM.rugGreen);
  addCandle(-10.4, 0.86, -6.5);
  addCandle(-8.0, 0.86, -6.5);
  addPlant(-3.0, 0, 13.0);
  addPlant(3.0, 0, 13.0);
  addBox(5.2, 0.9, 0.9, 6.0, 0.45, -13.25, darkWoodMat, true, false);
  addBox(5.3, 0.06, 1.0, 6.0, 0.93, -13.25, PM.counter, false);
  addBox(1.1, 2.1, 0.9, 9.5, 1.05, -13.25, PM.white, true, true);
  addDresser(-5.4, 0, -13.4, 1);
  addGrandfatherClock(-3.0, 0, -13.3);
  addFireplace(-13.45, 0, 11.5);
  addArmchair(-5.0, 0, 4.2, -1);
  addBox(0.7, 0.6, 0.7, -12.3, 0.3, 8.8, darkWoodMat, true, false);
  addFloorLamp(-13.0, 0, 6.2);
  addFramedPainting(-8, 2.4, 13.72, Math.PI);
  addFramedPainting(8, 2.4, 13.72, Math.PI);
  addFramedPainting(-5.4, 2.6, -13.72, 0);
  addFramedPainting(1.5, 2.4, -13.72, 0);

  // Upper Floor
  addRug(6.0, U, 9.0, 4.4, 3.2, PM.rugBlue);
  addDresser(6.0, U, 13.4, -1);
  addWardrobe(12.8, U, 13.3, -1);
  addTrunk(3.6, U, 12.9);
  addRug(6.0, U, 0.0, 3.0, 3.0, PM.rugRed);
  addPlant(3.2, U, -3.0);
  addFloorLamp(8.8, U, 3.0);
  addDresser(8.8, U, -13.3, 1);
  addRug(9.0, U, -8.0, 3.0, 2.2, PM.rugGreen);
  addGrandfatherClock(0.5, U, -13.3);
  addPlant(-3.3, U, 12.6);
  addFramedPainting(1.77, 6.3, -9, -Math.PI / 2);
  addFramedPainting(1.77, 6.3, 9, -Math.PI / 2);
  addFramedPainting(-4.77, 6.3, -4, Math.PI / 2);
  addFramedPainting(4.0, 6.3, -13.72, 0);
  addFramedPainting(-6.5, 6.3, -13.72, 0);
  addFramedPainting(-8, 6.3, 13.72, Math.PI);
  addFramedPainting(6, 6.3, 13.72, Math.PI);
  addArmchair(-6.6, U, 12.4, -1);
  addRug(-9.0, U, 8.0, 4.0, 3.0, PM.rugRed);
  addFloorLamp(-6.3, U, 3.4);
  addTrunk(-12.6, U, -8.9);
  addCandle(-12.9, U + 0.61, -8.9);
  addCrates(-6.2, U, -13.0);
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

  // Interior Walls
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

  addDecorProps();
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

// --- UPSTAIRS HIDING SPOTS ---
const HIDING_SPOTS = [
  { id: "wardrobe", name: "Guest Room Wardrobe", x: 12.2, y: 4.1, z: 12.1, hideX: 12.8, hideY: 4.1, hideZ: 12.6, lookYaw: Math.PI },
  { id: "desk",     name: "Under Study Desk",    x: -11.5, y: 4.1, z: 10.0, hideX: -11.5, hideY: 4.1, hideZ: 11.2, lookYaw: 0 },
  { id: "crates",   name: "Behind NW Crates",    x: -6.2, y: 4.1, z: -11.5, hideX: -6.2, hideY: 4.1, hideZ: -12.1, lookYaw: 0 }
];

// --- CUSTOM 3D ITEMS (5 ARTIFACTS) ---
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
  } else if (type === "watch") {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 10, 20), goldMat);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0xe6dec5 }));
    face.rotation.x = Math.PI / 2;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 8), goldMat);
    crown.position.y = 0.17;
    group.add(ring, face, crown);
  } else if (type === "photo") {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.04), goldMat);
    const pic = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.05), new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.9 }));
    group.add(frame, pic);
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

// --- 2-FLOOR CONNECTED NAVIGATION GRAPH + WEIGHTED A* ---
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

function nodeDist(a, b) {
  const na = NAV_NODES[a], nb = NAV_NODES[b];
  return Math.hypot(na.x - nb.x, (na.y - nb.y) * 1.5, na.z - nb.z);
}

function findNearestNode(x, y, z) {
  let best = 0, bestDist = Infinity;
  for (const n of NAV_NODES) {
    const d = Math.hypot(n.x - x, (n.y - y) * 2.5, n.z - z);
    if (d < bestDist) { bestDist = d; best = n.id; }
  }
  return best;
}

// Euclidean-Weighted A* Pathfinding
function findPathAStar(startId, goalId) {
  if (startId === goalId) return [goalId];
  const open = new Set([startId]);
  const cameFrom = new Map();
  const gScore = new Map([[startId, 0]]);
  const fScore = new Map([[startId, nodeDist(startId, goalId)]]);

  while (open.size > 0) {
    let curr = -1, bestF = Infinity;
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF) { bestF = f; curr = id; }
    }
    if (curr === goalId) {
      const path = [curr];
      while (cameFrom.has(curr)) { curr = cameFrom.get(curr); path.unshift(curr); }
      return path;
    }
    open.delete(curr);
    for (const next of NAV_NODES[curr].neighbors) {
      const tentativeG = (gScore.get(curr) ?? Infinity) + nodeDist(curr, next);
      if (tentativeG < (gScore.get(next) ?? Infinity)) {
        cameFrom.set(next, curr);
        gScore.set(next, tentativeG);
        fScore.set(next, tentativeG + nodeDist(next, goalId));
        open.add(next);
      }
    }
  }
  return [startId];
}

function lerpAngle(current, target, alpha) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * alpha;
}

// --- MIXAMO GLB + CACHING ---
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

  const prev = npc.currentAction;
  const next = npc.mixer.clipAction(clip);
  next.reset();
  next.enabled = true;
  next.setEffectiveTimeScale(1);
  next.setEffectiveWeight(1);
  if (loopOnce) {
    next.setLoop(THREE.LoopOnce);
    next.clampWhenFinished = true;
  } else {
    next.setLoop(THREE.LoopRepeat);
  }
  next.play();
  if (prev && prev !== next) prev.stop();
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

      model.rotation.y = MODEL_YAW_OFFSET; // Fixes backwards-walking Mixamo models
      npc.rig.group.add(model);
      npc.glbModel = model;

      const mixer = new THREE.AnimationMixer(model);
      npc.mixer = mixer;
      mixers.push(mixer);

      npc.walkClip = (gltf.animations && gltf.animations.length > 0) ? gltf.animations[0] : null;
      const startClip = (state === "INTRO_ANIM" && sharedIdleClip) ? sharedIdleClip : npc.walkClip;
      if (startClip) {
        npc.currentAction = mixer.clipAction(startClip);
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
  const path = findPathAStar(startNode, targetNodeId);
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
  SFX.stopSiren(); document.getElementById("police-cutscene").classList.add("hidden");
  SFX.stopChaseTheme();
  items.forEach(it => scene.remove(it.mesh));
  usedPlayerLines.clear();
  usedNpcLineIds.clear();
  usedNormalMeetings.clear();
  usedMissingMeetings.clear();

  const cfg = MODES[selectedMode];
  player.x = 0; player.y = 0; player.z = 11.5;
  player.vy = 0; player.onGround = true; player.crouching = false; player.hiding = false;
  player.yaw = 0; player.pitch = 0;
  player.itemsStolen = 0;
  currentHideSpot = null;
  savedHideExit = null;
  leanAmount = 0;
  flashlightOn = true;
  flashlight.intensity = 3.4;
  lockdownStrikes = 0;
  lockdown = false;
  spotCooldown = 0;
  lightAlertCooldown = 0;
  creakCooldown = 0;
  meetingCooldown = 0;
  lockdownTrackTimer = 0;
  stairWarnCooldown = 0; usedStairLines.clear();
  npcsKnowItemsMissing = false;
  playerMissingFromFloor1 = false;
  lastNoticedItem = null;
  lastHudKey = "";
  alarmLight.intensity = 0;
  ambientLight.color.setHex(0x181c28);
  mainDoorPivot.rotation.y = 0;
  camera.fov = 72;
  camera.updateProjectionMatrix();
  document.getElementById("damage-flash").style.background = "rgba(160,0,0,0)";
  document.getElementById("alert-feed").classList.add("hidden");

  generateCreakySpots();

  items = [
    { id: "key",    name: "Silver Key",    type: "key",    x: -11.8, y: 5.3,  z: -11.8, stolen: false, noticedMissing: false },
    { id: "ledger", name: "Secret Ledger", type: "ledger", x: -11.5, y: 5.15, z:  11.4, stolen: false, noticedMissing: false },
    { id: "locket", name: "Gold Locket",   type: "locket", x:   6.0, y: 5.15, z: -12.2, stolen: false, noticedMissing: false },
    { id: "watch",  name: "Pocket Watch",  type: "watch",  x:   6.0, y: 5.25, z:  13.4, stolen: false, noticedMissing: false },
    { id: "photo",  name: "Family Photo",  type: "photo",  x:   8.8, y: 5.28, z: -13.3, stolen: false, noticedMissing: false }
  ];
  items.forEach(it => { it.mesh = createCustomItemMesh(it.type, it.x, it.y, it.z); });

  initNPCsOnce();

  Object.assign(npcs[0], {
    x: 6.0, y: 4.1, z: -8.0, speed: cfg.npcSpeed, range: 4.2,
    path: [2, 4], pauseTimer: 0, mood: [0.5, 0.1, 0.1],
    checkingFloor1: false, sawPlayerOnFloor1: false, floor1Cooldown: 14.0,
    investigateTimer: 0, meetingTimer: 0, stairStopTimer: 0, stairLineSpoken: false
  });
  Object.assign(npcs[1], {
    x: -9.0, y: 4.1, z: 7.5, speed: cfg.npcSpeed * 0.95, range: 4.2,
    path: [7, 4], pauseTimer: 0, mood: [0.5, 0.1, 0.1],
    checkingFloor1: false, sawPlayerOnFloor1: false, floor1Cooldown: 24.0,
    investigateTimer: 0, meetingTimer: 0, stairStopTimer: 0, stairLineSpoken: false
  });
  npcs.forEach(n => {
    n.rig.group.position.set(n.x, n.y, n.z);
    if (n.mixer && n.walkClip) setNPCClip(n, n.walkClip);
  });

  updateHUD(true);
}
const SAVE_KEY = "woods_save_data";

function hasSavedGame() {
  return Boolean(SafeStorage.get(SAVE_KEY, null));
}

function updateContinueButton() {
  const btn = document.getElementById("btn-continue-save");
  if (!btn) return;
  const raw = SafeStorage.get(SAVE_KEY, null);
  if (!raw) {
    btn.classList.add("hidden");
    return;
  }
  try {
    const data = JSON.parse(raw);
    const modeLbl = MODES[data.selectedMode]?.label || "Normal";
    btn.textContent = `Continue Saved Game (${data.itemsStolen}/${data.totalItems} Items · ${modeLbl})`;
    btn.classList.remove("hidden");
  } catch {
    btn.classList.add("hidden");
  }
}

function saveCurrentGame() {
  const payload = {
    selectedMode,
    player: {
      x: player.x, y: player.y, z: player.z,
      yaw: player.yaw, pitch: player.pitch,
      itemsStolen: player.itemsStolen
    },
    itemsStolen: player.itemsStolen,
    totalItems: items.length,
    flashlightOn,
    lockdown,
    lockdownStrikes,
    npcsKnowItemsMissing,
    playerMissingFromFloor1,
    lastNoticedItem,
    items: items.map(it => ({ id: it.id, stolen: it.stolen, noticedMissing: it.noticedMissing })),
    npcs: npcs.map(n => ({
      x: n.x, y: n.y, z: n.z,
      mood: [...n.mood],
      checkingFloor1: n.checkingFloor1,
      sawPlayerOnFloor1: n.sawPlayerOnFloor1,
      floor1Cooldown: n.floor1Cooldown
    }))
  };
  SafeStorage.set(SAVE_KEY, JSON.stringify(payload));
  updateContinueButton();
}

function applySavedGame() {
  const raw = SafeStorage.get(SAVE_KEY, null);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    selectedMode = data.selectedMode || "normal";
    resetWorld();

    Object.assign(player, data.player);
    flashlightOn = Boolean(data.flashlightOn);
    flashlight.intensity = flashlightOn ? 3.4 : 0;
    lockdown = Boolean(data.lockdown);
    lockdownStrikes = data.lockdownStrikes || 0;
    npcsKnowItemsMissing = Boolean(data.npcsKnowItemsMissing);
    playerMissingFromFloor1 = Boolean(data.playerMissingFromFloor1);
    lastNoticedItem = data.lastNoticedItem || null;

    if (Array.isArray(data.items)) {
      data.items.forEach(savedIt => {
        const it = items.find(x => x.id === savedIt.id);
        if (it) {
          it.stolen = Boolean(savedIt.stolen);
          it.noticedMissing = Boolean(savedIt.noticedMissing);
          if (it.stolen && it.mesh) scene.remove(it.mesh);
        }
      });
    }

    if (Array.isArray(data.npcs)) {
      data.npcs.forEach((savedN, idx) => {
        if (!npcs[idx]) return;
        npcs[idx].x = savedN.x;
        npcs[idx].y = savedN.y;
        npcs[idx].z = savedN.z;
        npcs[idx].mood = Array.isArray(savedN.mood) ? [...savedN.mood] : [0.5, 0.1, 0.1];
        npcs[idx].checkingFloor1 = Boolean(savedN.checkingFloor1);
        npcs[idx].sawPlayerOnFloor1 = Boolean(savedN.sawPlayerOnFloor1);
        npcs[idx].floor1Cooldown = savedN.floor1Cooldown ?? 14.0;
        npcs[idx].rig.group.position.set(savedN.x, savedN.y, savedN.z);
        assignNewPath(npcs[idx], FLOOR2_PATROL_NODES[Math.floor(Math.random() * FLOOR2_PATROL_NODES.length)]);
      });
    }

    if (lockdown) SFX.startChaseTheme();
    updateHUD(true);
    return true;
  } catch (err) {
    console.warn("Failed to restore save:", err);
    return false;
  }
}

function exitToTitleMenu(shouldSave) {
  if (shouldSave) saveCurrentGame();
  SFX.stopChaseTheme();
  SFX.stopSiren();
  state = "MENU";
  keys = {};
  if (document.pointerLockElement) document.exitPointerLock();
  document.getElementById("screen-pause").classList.add("hidden");
  document.getElementById("logout-save-bar").classList.add("hidden");
  document.getElementById("screen-title").classList.remove("hidden");
  updateContinueButton();
  SFX.startMenuAmbience();
}

// --- LOADING SEQUENCE ---
async function runLoadingScreen(loadSave = false) {
  state = "LOADING";
  document.getElementById("screen-title").classList.add("hidden");
  document.getElementById("screen-loading").classList.remove("hidden");

  const bar = document.getElementById("loading-bar");
  const txt = document.getElementById("loading-text");
  const setProgress = (pct, label) => { bar.style.width = `${pct}%`; txt.textContent = label; };

  try {
    if (!enginesLoaded) {
      if (typeof ort !== "undefined" && ort.env && ort.env.wasm) {
        ort.env.wasm.numThreads = 1;
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
    const restored = loadSave && applySavedGame();
    if (!restored) resetWorld();

    setTimeout(() => {
      document.getElementById("screen-loading").classList.add("hidden");
      animClock.getDelta();
      SFX.stopMenuAmbience();

      if (restored) {
        state = "PLAYING";
        showAlert(`Loaded saved progress (${player.itemsStolen}/${items.length} items).`, "warn", 4500);
        safeLock();
      } else if (gameCount === 1 && !introSeen) {
        startIntroCutscene();
      } else {
        state = "PLAYING";
        showAlert("You have successfully entered their house with trust. Steal the items cautiously... death might be your ending.", "warn", 6000);
        safeLock();
      }
    }, 350);
  } catch (err) {
    console.error("Boot failed:", err);
    txt.textContent = `Load error: ${err.message}. Refresh the page to retry.`;
  }
}

// --- HUD & VISIBILITY GEM ---
function isMLActive() { return gameCount >= 5 && ortSession !== null; }
function isUpstairs() { return player.y >= 2.8; }
function isOnStairs() {
  return player.x > 9.8 && player.x < 14.0 && player.z >= -6.2 && player.z <= 6.5 && player.y > 0.25 && player.y < 3.85;
}
function isDangerZone() { return lockdown || isUpstairs(); }

function updateHUD(force = false) {
  const [at, ac, aa] = npcs[0] ? npcs[0].mood.map(v => Math.round(v * 100)) : [50, 10, 10];
  const [et, ec, ea] = npcs[1] ? npcs[1].mood.map(v => Math.round(v * 100)) : [50, 10, 10];
  const zoneCode = lockdown ? 2 : isUpstairs() ? 1 : 0;
  const visState = player.hiding ? 0 : (player.crouching && !flashlightOn) ? 1 : 2;
  const hudKey = `${gameCount}|${isMLActive()}|${player.itemsStolen}/${items.length}|${selectedMode}|${lockdownStrikes}|${zoneCode}|${visState}|${at},${ac},${aa}|${et},${ec},${ea}`;
  if (!force && hudKey === lastHudKey) return;
  lastHudKey = hudKey;

  const badge = document.getElementById("mode-badge");
  badge.textContent = isMLActive() ? `PyTorch AI Active (Game ${gameCount})` : `Rule-Based (Game ${gameCount}/4)`;
  badge.className = isMLActive() ? "badge badge-ml" : "badge badge-rule";

  const cfg = MODES[selectedMode];
  document.getElementById("items-count").textContent = `${player.itemsStolen} / ${items.length}`;
  document.getElementById("diff-label").textContent = cfg.label;
  document.getElementById("strikes-count").textContent = lockdown ? `${lockdownStrikes} / ${cfg.maxStrikes}` : "∞";

  const gem = document.getElementById("vis-gem");
  if (visState === 0) {
    gem.innerHTML = "&#9670; HIDDEN";
    gem.className = "vis-hidden";
  } else if (visState === 1) {
    gem.innerHTML = "&#9670; DIM";
    gem.className = "vis-dim";
  } else {
    gem.innerHTML = "&#9670; VISIBLE";
    gem.className = "vis-bright";
  }

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

  // Arthur
  document.getElementById("a-trust-val").textContent = `${at}%`;
  document.getElementById("a-curiosity-val").textContent = `${ac}%`;
  document.getElementById("a-aggression-val").textContent = `${aa}%`;
  document.getElementById("a-trust-fill").style.width = `${at}%`;
  document.getElementById("a-curiosity-fill").style.width = `${ac}%`;
  document.getElementById("a-aggression-fill").style.width = `${aa}%`;

  // Eleanor
  document.getElementById("e-trust-val").textContent = `${et}%`;
  document.getElementById("e-curiosity-val").textContent = `${ec}%`;
  document.getElementById("e-aggression-val").textContent = `${ea}%`;
  document.getElementById("e-trust-fill").style.width = `${et}%`;
  document.getElementById("e-curiosity-fill").style.width = `${ec}%`;
  document.getElementById("e-aggression-fill").style.width = `${ea}%`;
}

// --- LIVE AI & WASM TELEMETRY ([Tab]) ---
function updateTelemetry() {
  if (!telemetryVisible || !cppHasLOS || npcs.length < 2) return;
  const losRows = npcs.map(n => {
    const sameFl = Math.abs(player.y - n.y) < 1.8;
    const clear = sameFl && cppHasLOS(n.x, n.y + 1.4, n.z, player.x, player.y + 1.15, player.z) === 1;
    const dist = Math.hypot(player.x - n.x, player.z - n.z).toFixed(1);
    return `<div class="tele-row"><span>${n.name} (${dist}m)</span><span class="${clear ? 'tele-warn' : 'tele-ok'}">${clear ? 'LOS CLEAR' : 'OCCLUDED'}</span></div>`;
  }).join("");

  const inStr = lastOnnxInputs ? `[${lastOnnxInputs.map(v => v.toFixed(2)).join(", ")}]` : "Trigger a confrontation";
  const outStr = lastOnnxDeltas ? `T:${lastOnnxDeltas[0]} C:${lastOnnxDeltas[1]} A:${lastOnnxDeltas[2]}` : "—";

  document.getElementById("tele-body").innerHTML = `
    <div class="tele-row"><span>Engine</span><span class="tele-ok">${isMLActive() ? 'PyTorch ONNX' : 'C++ WASM Rules'}</span></div>
    <div class="tele-row"><span>Last Eval</span><span>${lastModelSource}</span></div>
    <div class="tele-row"><span>Perf (Iris Xe)</span><span class="tele-ok">${Math.round(smoothedFps)} FPS &middot; ${renderer.info.render.calls} draws</span></div>
    ${losRows}
    <div style="margin-top:6px; color:#8b949e;">9-Feature Input Tensor:</div>
    <div style="word-break:break-all; color:#79c0ff;">${inStr}</div>
    <div class="tele-row" style="margin-top:4px;"><span>Mood Deltas</span><span style="color:#f2cc60;">${outStr}</span></div>
  `;
}

// --- WALL-ATTENUATED SOUND PROPAGATION ---
function alertNPCsBySound(soundX, soundY, soundZ, baseRange, reasonLabel) {
  const targetNode = findNearestNode(soundX, soundY, soundZ);
  let alerted = [];
  for (const npc of npcs) {
    if (npc.meetingTimer > 0 || npc.checkingFloor1) continue;
    const dist = Math.hypot(npc.x - soundX, npc.z - soundZ);
    const sameFloor = Math.abs(npc.y - soundY) < 2.0;
    const hasLOS = sameFloor && cppHasLOS(soundX, soundY + 1.0, soundZ, npc.x, npc.y + 1.4, npc.z) === 1;
    // Walls dampen sound radius by 50%
    const effectiveRange = hasLOS ? baseRange : baseRange * 0.52;
    if (sameFloor && dist <= effectiveRange) {
      assignNewPath(npc, targetNode);
      npc.investigateTimer = 5.5;
      npc.pauseTimer = 0;
      alerted.push(npc.name);
    }
  }
  if (alerted.length > 0) {
    showAlert(`${reasonLabel} ${alerted.join(" & ")} heard it and is heading this way!`, "danger", 4200);
  }
  return alerted;
}

function handleCreakSound(soundX, soundZ) {
  SFX.playCreak();
  creakCooldown = 3.4;
  const heard = alertNPCsBySound(soundX, 4.1, soundZ, 14.0, "CREAK!");
  if (heard.length === 0) {
    showAlert("CREAK! Wood groaned upstairs... walls muffled the sound.", "warn", 3000);
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
  return { id: bestLine.id, text: bestLine.text };
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
  SFX.playOneShot("mc_stab.mp3", 0.45);
  activeNPC = npc;
  activeNPC.killReason = reasonText;
  activeNPC.slashSoundPlayed = false;
  animTimer = 0;
  if (document.pointerLockElement) document.exitPointerLock();
  document.getElementById("screen-dialogue").classList.add("hidden");
  if (npc.mixer && sharedStabClip) setNPCClip(npc, sharedStabClip, true);
}

function startConfrontation(npc, customSub = null) {
  const cfg = MODES[selectedMode];
  if (npc.mood[2] >= 1.0) {
    triggerKnifeAttack(npc, `${npc.name} was already furious (100%) and attacked you on sight.`);
    return;
  }
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
  document.getElementById("confront-sub").textContent = customSub
    ? customSub
    : npcsKnowItemsMissing
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

  const featureVec = [
    isDangerZone() ? 1.0 : 0.0,
    player.itemsStolen / items.length,
    player.stealth,
    choiceId / 2.0,
    npc.mood[0],
    npc.mood[1],
    npc.mood[2],
    npcsKnowItemsMissing ? 1.0 : 0.0,
    playerMissingFromFloor1 ? 1.0 : 0.0
  ];
  lastOnnxInputs = featureVec;

  if (isMLActive()) {
    try {
      const tensor = new ort.Tensor("float32", Float32Array.from(featureVec), [1, 9]);
      const results = await ortSession.run({ player_state: tensor });
      const deltas = results.mood_deltas.data;
      [dTrust, dCur, dAgg] = [deltas[0], deltas[1], deltas[2]];
      lastModelSource = "ONNX MLP";
    } catch (err) {
      console.warn("ONNX inference error, using C++ rule fallback:", err);
      dTrust = cppRuleDelta(choiceId, 0);
      dCur   = cppRuleDelta(choiceId, 1);
      dAgg   = cppRuleDelta(choiceId, 2);
      lastModelSource = "C++ Fallback";
    }
  } else {
    dTrust = cppRuleDelta(choiceId, 0);
    dCur   = cppRuleDelta(choiceId, 1);
    dAgg   = cppRuleDelta(choiceId, 2);
    lastModelSource = "C++ Rules";
  }

  // Trust modifier + MOOD_GAIN scaling
  if (npc.mood[0] > 0.7 && dAgg > 0) dAgg *= 0.75;
  if (npc.mood[0] < 0.25 && dAgg > 0) dAgg *= 1.25;

  dCur = gain(dCur);
  dAgg = gain(dAgg);
  lastOnnxDeltas = [dTrust.toFixed(2), dCur.toFixed(2), dAgg.toFixed(2)];

  npc.mood[0] = Math.max(0, Math.min(1, npc.mood[0] + dTrust));
  npc.mood[1] = Math.max(0, Math.min(1, npc.mood[1] + dCur));
  npc.mood[2] = Math.max(0, Math.min(1, npc.mood[2] + dAgg));
  updateHUD(true);
  updateTelemetry();

  const match = pickBestFreshNpcLine(npc, choiceId);
  SFX.playVoice(`${npc.name.toLowerCase()}_${match.id}.mp3`, 0.9, true);

  const replyEl = document.getElementById("npc-reply");
  replyEl.textContent = `${npc.name}: "${match.text}"`;
  replyEl.classList.remove("hidden");
  document.getElementById("btn-continue").classList.remove("hidden");
}

function endGame(title, desc) {
  SFX.stopChaseTheme();
  state = "ENDED";
  keys = {};
  if (document.pointerLockElement) document.exitPointerLock();
  gameCount += 1;
  SafeStorage.set("woods_game_count", gameCount);
  SafeStorage.remove(SAVE_KEY);
  updateContinueButton();
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
function startIntroCutscene() {
  state = "INTRO_ANIM";
  animTimer = 0;
  introStep = 0;
  introStepTimer = 0;
  mainDoorPivot.rotation.y = Math.PI * 0.52;
  document.getElementById("blink-overlay").style.opacity = "0";

  // Position Arthur & Eleanor in the foyer facing the front door
  npcs[0].rig.group.position.set(-1.5, 0, 8.4);
  npcs[0].rig.group.rotation.set(0, 0.22, 0);
  npcs[1].rig.group.position.set(1.5, 0, 8.4);
  npcs[1].rig.group.rotation.set(0, -0.22, 0);
  npcs.forEach(n => { if (n.mixer && sharedIdleClip) setNPCClip(n, sharedIdleClip); });
}

function finishIntroCutscene() {
  introSeen = true;
  SafeStorage.set("woods_intro_seen", "1");
  mainDoorPivot.rotation.y = 0;
  document.getElementById("blink-overlay").style.opacity = "0";

  // Return NPCs to their upstairs patrol starts
  npcs[0].rig.group.position.set(npcs[0].x, npcs[0].y, npcs[0].z);
  npcs[1].rig.group.position.set(npcs[1].x, npcs[1].y, npcs[1].z);
  npcs.forEach(n => { if (n.mixer && n.walkClip) setNPCClip(n, n.walkClip); });

  state = "PLAYING";
  showAlert("You have successfully entered their house with trust. Steal the items cautiously... death might be your ending.", "warn", 6000);
  safeLock();
}
function startDeathCutscene() {
  state = "DEATH_CUTSCENE";
  cutsceneStep = 0;
  cutsceneTimer = 0;
  SFX.stopChaseTheme();
  if (document.pointerLockElement) document.exitPointerLock();
  showAlert("You got caught.", "danger", 2500);
  document.getElementById("blink-overlay").style.opacity = "1";
}

function startArrestCutscene() {
  state = "ARREST_CUTSCENE";
  cutsceneStep = 0;
  cutsceneTimer = 0;
  SFX.stopChaseTheme();
  if (document.pointerLockElement) document.exitPointerLock();
}
function update() {
  const rawDt = animClock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  if (rawDt > 0) smoothedFps = smoothedFps * 0.9 + (1 / rawDt) * 0.1;

  if (state === "PAUSED") return;

  for (const m of mixers) m.update(dt);
  elapsed += dt;

  for (const it of items) {
    if (!it.stolen) it.mesh.rotation.y += 1.5 * dt;
  }

  downstairsLamp.intensity = 0.80 + Math.sin(elapsed * 9.0) * 0.08 + (Math.random() > 0.97 ? -0.35 : 0);
  // --- ONE-TIME WELCOME CUTSCENE (GAME 1 — VOICE-SYNCED + BLINK) ---
  if (state === "INTRO_ANIM") {
    animTimer += dt;
    introStepTimer += dt;
    if (sharedIdleClip) {
      npcs.forEach(n => setNPCClip(n, sharedIdleClip));
    }

    const stepIn = Math.min(1, animTimer / 2.2);
    const camZ = 14.2 - stepIn * 2.7;
    camera.position.set(0, 1.65 + Math.sin(animTimer * 6.0) * (stepIn < 1 ? 0.03 : 0.005), camZ);
    camera.lookAt(0, 1.45, 8.4);

    if (animTimer > 2.2) {
      mainDoorPivot.rotation.y = Math.max(0, mainDoorPivot.rotation.y - 1.4 * dt);
    }

    // 1. Arthur speaks
    if (introStep === 0 && animTimer >= 0.6) {
      introStep = 1;
      introStepTimer = 0;
      SFX.playVoice("intro_arthur.mp3", 0.95, true);
      showAlert('Arthur: "Lost in the woods at this hour? Come inside, get warm... just stay on the ground floor."  [Space to Skip]', "warn", 12000);
    }
    // 2. Wait until Arthur's audio finishes (+ brief beat), then Eleanor speaks
    else if (introStep === 1 && ((!SFX.currentVoice && introStepTimer >= 1.5) || introStepTimer >= 12.0)) {
      introStep = 2;
      introStepTimer = 0;
      SFX.playVoice("intro_eleanor.mp3", 0.95, true);
      showAlert('Eleanor: "Make yourself at home, dear. And please... do not wander upstairs."  [Space to Skip]', "whisper", 12000);
    }
    // 3. Wait until Eleanor's audio finishes, then close eyes (blink to black)
    else if (introStep === 2 && ((!SFX.currentVoice && introStepTimer >= 1.5) || introStepTimer >= 12.0)) {
      introStep = 3;
      introStepTimer = 0;
      document.getElementById("blink-overlay").style.opacity = "1";
    }
    // 4. While eyes are closed, move NPCs upstairs, then blink open into gameplay
    else if (introStep === 3 && introStepTimer >= 0.55) {
      finishIntroCutscene();
    }
    return;
  }

  // --- DEATH CUTSCENE (BLINK -> FLOOR VIEW -> ELEANOR'S LINE) ---
  if (state === "DEATH_CUTSCENE") {
    cutsceneTimer += dt;

    // Step 0: Screen goes black -> place camera on floor & position Arthur + Eleanor looking down
    if (cutsceneStep === 0 && cutsceneTimer >= 0.9) {
      cutsceneStep = 1;
      cutsceneTimer = 0;

      const fx = player.x, fz = player.z, fy = player.y;
      camera.position.set(fx, fy + 0.25, fz);
      camera.lookAt(fx, fy + 1.45, fz - 1.35);

      npcs[0].rig.group.position.set(fx - 0.55, fy, fz - 1.35);
      npcs[0].rig.group.lookAt(fx, fy + 0.25, fz);
      npcs[1].rig.group.position.set(fx + 0.55, fy, fz - 1.35);
      npcs[1].rig.group.lookAt(fx, fy + 0.25, fz);
      npcs.forEach(n => { if (n.mixer && sharedIdleClip) setNPCClip(n, sharedIdleClip); });

      document.getElementById("blink-overlay").style.opacity = "0";
    }
    // Step 1: Eyes open -> Eleanor delivers her line
    else if (cutsceneStep === 1 && cutsceneTimer >= 0.8) {
      cutsceneStep = 2;
      cutsceneTimer = 0;
      SFX.playVoice("death_eleanor.mp3", 0.95, true);
      showAlert('Eleanor: "Let\'s bury this one in the backyard too."', "danger", 8000);
    }
    // Step 2: Wait for Eleanor to finish, then fade to end screen
    else if (cutsceneStep === 2 && ((!SFX.currentVoice && cutsceneTimer >= 1.2) || cutsceneTimer >= 8.0)) {
      endGame("YOU WERE KILLED", "Arthur and Eleanor buried you in the backyard.");
    }
    return;
  }

  // --- POLICE CAR CUTSCENE (WAIT FOR DIALOGUE -> BLINK LINE -> SIREN CAR) ---
  if (state === "ARREST_CUTSCENE") {
    cutsceneTimer += dt;

    // Step 0: Wait for Eleanor/Arthur's confrontation line to finish, then blink to black
    if (cutsceneStep === 0 && ((!SFX.currentVoice && cutsceneTimer >= 0.8) || cutsceneTimer >= 7.0)) {
      cutsceneStep = 1;
      cutsceneTimer = 0;
      document.getElementById("blink-overlay").style.opacity = "1";
      showAlert('[Both]: "We are calling the cops on you, you little bastard."', "danger", 3200);
    }
    // Step 1: Hold black screen so the player reads the line, then open into the police car
    else if (cutsceneStep === 1 && cutsceneTimer >= 3.2) {
      cutsceneStep = 2;
      cutsceneTimer = 0;
      document.getElementById("police-cutscene").classList.remove("hidden");
      document.getElementById("blink-overlay").style.opacity = "0";
      SFX.startSiren();
    }
    // Step 2: Arthur tells the officer
    else if (cutsceneStep === 2 && cutsceneTimer >= 1.0) {
      cutsceneStep = 3;
      cutsceneTimer = 0;
      SFX.playVoice("arrest_arthur.mp3", 0.95, true);
      showAlert('Arthur: "Officer, we took him in out of the woods out of kindness, and he was stealing from our home!"', "warn", 12000);
    }
    // Step 3: Officer replies after Arthur finishes
    else if (cutsceneStep === 3 && ((!SFX.currentVoice && cutsceneTimer >= 1.2) || cutsceneTimer >= 12.0)) {
      cutsceneStep = 4;
      cutsceneTimer = 0;
      SFX.playVoice("arrest_officer.mp3", 0.95, true);
      showAlert('Officer: "Yeah, alright... I know this guy. A very old, notorious thief. You\'re coming with me."', "whisper", 12000);
    }
    // Step 4: End after officer finishes
    else if (cutsceneStep === 4 && ((!SFX.currentVoice && cutsceneTimer >= 1.2) || cutsceneTimer >= 10.0)) {
      SFX.stopSiren();
      document.getElementById("police-cutscene").classList.add("hidden");
      endGame("ARRESTED", "You were caught and taken away in the patrol car.");
    }
    return;
  }

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
      startDeathCutscene();
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
      endGame("Escaped!", `You stole all ${items.length} artifacts and slipped out the front door into the woods.`);
    }
    return;
  }

  if (state !== "PLAYING") return;

  const cfg = MODES[selectedMode];
  if (lockdown) {
    alarmLight.intensity = 1.4 + Math.sin(elapsed * 5.0) * 0.9;
    ambientLight.color.setHex(0x3a1014);
  }

  // Subtle FOV Widening in Lockdown
  const targetFov = lockdown ? 78 : 72;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, 5.0 * dt);
    camera.updateProjectionMatrix();
  }

  // Player Movement, Crouch & Corner Lean (Q / Z)
  const targetLean = (!player.hiding && keys["q"]) ? -1 : (!player.hiding && keys["z"]) ? 1 : 0;
  leanAmount += (targetLean - leanAmount) * Math.min(1, 10.0 * dt);

  let isMoving = false;
  if (!player.hiding) {
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
    isMoving = mag > 0;

    const sinY = Math.sin(player.yaw);
    const cosY = Math.cos(player.yaw);
    const dx = (-sinY * forward + cosY * strafe) * activeSpeed * dt;
    const dz = (-cosY * forward - sinY * strafe) * activeSpeed * dt;

    if (!hitsWall(player.x + dx, player.y, player.z)) player.x += dx;
    if (!hitsWall(player.x, player.y, player.z + dz)) player.z += dz;
    if (player.z > 13.3) player.z = 13.3;

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
  } else {
    player.stealth = 0.99;
  }

  const eyeHeight = player.hiding ? 0.95 : (player.crouching ? 1.15 : 1.65);
  const bob = (!player.hiding && player.onGround && isMoving)
    ? Math.sin(elapsed * (player.crouching ? 6.5 : 9.5)) * (player.crouching ? 0.02 : 0.04)
    : Math.sin(elapsed * 2.0) * 0.008;

  const leanRightX = Math.cos(player.yaw) * leanAmount * 0.42;
  const leanRightZ = -Math.sin(player.yaw) * leanAmount * 0.42;
  camera.position.set(player.x + leanRightX, player.y + eyeHeight + bob, player.z + leanRightZ);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.rotation.z = -leanAmount * 0.14;

  // Creaky Floorboards
  if (creakCooldown > 0) creakCooldown -= dt;
  if (!player.hiding && isUpstairs() && isMoving && player.onGround && creakCooldown <= 0) {
    for (const spot of creakySpots) {
      if (Math.hypot(player.x - spot.x, player.z - spot.z) < spot.radius) {
        handleCreakSound(player.x, player.z);
        break;
      }
    }
  }

  // Nearby Items / Hiding Spots / Main Door
  nearbyItem = null;
  nearbyHideSpot = null;
  if (!player.hiding) {
    for (const it of items) {
      if (!it.stolen && Math.hypot(player.x - it.x, player.z - it.z) < 2.3 && Math.abs(player.y + 1 - it.y) < 1.7) {
        nearbyItem = it;
        break;
      }
    }
    if (!nearbyItem && isUpstairs()) {
      for (const hs of HIDING_SPOTS) {
        if (Math.hypot(player.x - hs.x, player.z - hs.z) < 2.2) {
          nearbyHideSpot = hs;
          break;
        }
      }
    }
  }
  nearMainDoor = !player.hiding && lockdown && !isUpstairs() && Math.hypot(player.x - 0, player.z - 13.2) < 2.6;

  const prompt = document.getElementById("interact-prompt");
  if (player.hiding) {
    prompt.textContent = `Hiding (${currentHideSpot.name}) — Press [E] to Exit`;
    prompt.classList.remove("hidden");
  } else if (nearMainDoor) {
    prompt.textContent = "Press [E] to Escape through Main Door!";
    prompt.classList.remove("hidden");
  } else if (nearbyItem) {
    prompt.textContent = `Press [E] to Steal ${nearbyItem.name}`;
    prompt.classList.remove("hidden");
  } else if (nearbyHideSpot) {
    prompt.textContent = `Press [E] to Hide (${nearbyHideSpot.name})`;
    prompt.classList.remove("hidden");
  } else {
    prompt.classList.add("hidden");
  }

  if (spotCooldown > 0) spotCooldown -= dt;
  if (lightAlertCooldown > 0) lightAlertCooldown -= dt;
  if (meetingCooldown > 0) meetingCooldown -= dt;
  if (stairWarnCooldown > 0) stairWarnCooldown -= dt;

  // Heartbeat Tension Audio + Proximity Flashlight Flicker
  let nearestNpcDist = Infinity;
  for (const n of npcs) {
    if (Math.abs(n.y - player.y) < 2.0) {
      nearestNpcDist = Math.min(nearestNpcDist, Math.hypot(n.x - player.x, n.z - player.z));
    }
  }

  if (flashlightOn && !player.hiding) {
    if (nearestNpcDist < 6.5 || lockdown) {
      const flickerChance = lockdown ? 0.14 : (1.0 - nearestNpcDist / 6.5) * 0.16;
      flashlight.intensity = Math.random() < flickerChance ? (0.4 + Math.random() * 1.4) : 3.4;
    } else {
      flashlight.intensity = 3.4;
    }
  } else {
    flashlight.intensity = 0;
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

  // --- UPDATE NPCs (DT-SCALED + A* + C++ RAYCAST LOS) ---
  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i];
    if (npc.floor1Cooldown > 0) npc.floor1Cooldown -= dt;
    if (npc.investigateTimer > 0) npc.investigateTimer -= dt;

    if (!lockdown) {
      npc.mood[1] = Math.max(0.1, npc.mood[1] - 0.0008 * dt); // ~50s to lose 4%
      npc.mood[2] = Math.max(0.1, npc.mood[2] - 0.0005 * dt); // ~80s to lose 4%
    }

    if (npc.meetingTimer > 0) {
      npc.meetingTimer -= dt;
      if (npc.mixer && sharedIdleClip) setNPCClip(npc, sharedIdleClip);
      const other = npcs[1 - i];
      npc.rig.group.position.set(npc.x, npc.y, npc.z);
      npc.rig.group.rotation.set(0, Math.atan2(other.x - npc.x, other.z - npc.z), 0);
    } else if (npc.stairStopTimer > 0) {
      npc.stairStopTimer -= dt;
      if (npc.mixer && sharedIdleClip) setNPCClip(npc, sharedIdleClip);
      npc.rig.group.position.set(npc.x, npc.y, npc.z);
      npc.rig.group.rotation.set(0, Math.atan2(player.x - npc.x, player.z - npc.z), 0);

      // Deliver dialogue at the end of the 5s stare, then walk away
      if (npc.stairStopTimer <= 0.1 && !npc.stairLineSpoken) {
        npc.stairLineSpoken = true;
        stairWarnCooldown = 15.0; // Strict 1 dialogue per 15s after they leave
        npc.mood[1] = Math.min(1, npc.mood[1] + 0.04);
        const validIds = npc.name === "Arthur" ? [0, 2, 4] : [1, 3];
        let fresh = validIds.filter(id => !usedStairLines.has(id));
        if (fresh.length === 0) {
          validIds.forEach(id => usedStairLines.delete(id));
          fresh = validIds;
        }
        const idx = fresh[Math.floor(Math.random() * fresh.length)];
        usedStairLines.add(idx);
        SFX.playVoice(`stairs_${idx}.mp3`, 0.92);
        showAlert(`${npc.name}: "${STAIR_LINES[idx]}" (+4% Curiosity)`, "warn", 4600);
        updateHUD(true);
      }
    } else if (npc.pauseTimer > 0) {
      npc.pauseTimer -= dt;
      if (npc.mixer && sharedIdleClip) setNPCClip(npc, sharedIdleClip);
    } else {
      // Active Lockdown Hunter: Eleanor (i === 1) re-tracks your position every 1.5s
      if (lockdown && i === 1) {
        lockdownTrackTimer -= dt;
        if (lockdownTrackTimer <= 0) {
          assignNewPath(npc, findNearestNode(player.x, player.y, player.z));
          lockdownTrackTimer = 1.5;
        }
      }

      if (!npc.path || npc.path.length === 0) {
        const otherNpc = npcs[1 - i];
        const otherIsDownstairs = otherNpc.checkingFloor1 || otherNpc.y < 2.5;

        if (lockdown && i === 0) {
          const blockNodes = [12, 11];
          assignNewPath(npc, blockNodes[Math.floor(Math.random() * blockNodes.length)]);
        } else if (lockdown && i === 1) {
          assignNewPath(npc, findNearestNode(player.x, player.y, player.z));
        } else if (npc.checkingFloor1 && npc.y < 1.0) {
          npc.checkingFloor1 = false;
          npc.floor1Cooldown = 26.0;
          if (!npc.sawPlayerOnFloor1) {
            playerMissingFromFloor1 = true;
            npc.mood[1] = Math.min(1, npc.mood[1] + 0.25);
            npc.investigateTimer = 6.0;
            showAlert(`${npc.name} checked downstairs and didn't see you! Their Curiosity spiked!`, "danger", 4600);
          } else {
            playerMissingFromFloor1 = false;
          }
          assignNewPath(npc, FLOOR2_PATROL_NODES[Math.floor(Math.random() * FLOOR2_PATROL_NODES.length)]);
        } else if (!lockdown && !otherIsDownstairs && npc.floor1Cooldown <= 0 && npc.y > 3.0) {
          npc.checkingFloor1 = true;
          npc.sawPlayerOnFloor1 = false;
          assignNewPath(npc, FLOOR1_CHECK_NODES[Math.floor(Math.random() * FLOOR1_CHECK_NODES.length)]);
        } else if (otherIsDownstairs || (cfg.guardMissing && npcsKnowItemsMissing && Math.random() < 0.65)) {
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

    // Floor 1 Safe Check
    if (!player.hiding && npc.checkingFloor1 && npc.y < 1.0 && sameFloor && Math.hypot(player.x - npc.x, player.z - npc.z) < 10.0) {
      if (cppHasLOS(npc.x, npc.y + 1.4, npc.z, player.x, player.y + 1.2, player.z) === 1) {
        npc.sawPlayerOnFloor1 = true;
      }
    }

    // Flashlight Beam Detection
    if (!player.hiding && cfg.lightDetect && flashlightOn && sameFloor && isDangerZone() && lightAlertCooldown <= 0) {
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

    // Notice Missing Items + Speak (6.8m radius covers Watch & Photo from nearest nav nodes)
    if (npc.y > 3.0) {
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        if (it.stolen && !it.noticedMissing && Math.hypot(npc.x - it.x, npc.z - it.z) < 6.8) {
          it.noticedMissing = true;
          npcsKnowItemsMissing = true;
          lastNoticedItem = it.name;
          npc.mood[1] = Math.min(1, npc.mood[1] + 0.25);
          npc.mood[2] = Math.min(1, npc.mood[2] + 0.22);
          const customKey = `${it.id}_${npc.name.toLowerCase()}`;
          const spoken = MISSING_ITEM_TEXT[customKey]
            || dialogues.missing_item_comments[idx % dialogues.missing_item_comments.length].replace("{item}", it.name);
          SFX.playVoice(`missing_${npc.name.toLowerCase()}_${it.id}.mp3`, 0.9);
          showAlert(`${npc.name}: "${spoken}"`, "danger", 5000);
          updateHUD(true);
        }
      }
    }
    // Staircase Warning: Stop & stare for 5s when passing you on the stairs (1 per 15s)
    if (!lockdown && !player.hiding && isOnStairs() && stairWarnCooldown <= 0 && npc.stairStopTimer <= 0 && npc.meetingTimer <= 0) {
      const dxS = player.x - npc.x;
      const dyS = player.y - npc.y;
      const dzS = player.z - npc.z;
      const dist3D = Math.hypot(dxS, dyS, dzS);
      const fwdX = Math.sin(npc.rig.group.rotation.y);
      const fwdZ = Math.cos(npc.rig.group.rotation.y);
      const horiz = Math.hypot(dxS, dzS) || 1;
      const dot = (dxS / horiz) * fwdX + (dzS / horiz) * fwdZ;

      if (Math.abs(dxS) < 2.6 && dist3D < 3.5 && dot > 0.1 &&
          cppHasLOS(npc.x, npc.y + 1.4, npc.z, player.x, player.y + 1.2, player.z) === 1) {
        npc.stairStopTimer = 5.0;
        npc.stairLineSpoken = false;
        stairWarnCooldown = 20.0; // Locks out the other NPC during the 5s stare + 15s cooldown
      }
    }

    // Real C++ 3D AABB Raycast + FOV Cone Spotting (Skipped while safely hiding)
    if (!player.hiding && spotCooldown <= 0 && isDangerZone() && sameFloor) {
      const effectiveRange = player.crouching ? npc.range * 0.55 : npc.range;
      const cosHalfFov = 0.25;
      if (cppIsSpottedLOS(player.x, player.y, player.z, npc.x, npc.y, npc.z, npc.rig.group.rotation.y, effectiveRange, cosHalfFov) === 1) {
        startConfrontation(npc);
        return;
      }
    }
  }

  telemetryTimer -= dt;
  if (telemetryVisible && telemetryTimer <= 0) {
    updateTelemetry();
    telemetryTimer = 0.2;
  }

  updateHUD();
}
// --- SAVE / CONTINUE / LOGOUT / 2x RESET HANDLERS ---
document.getElementById("btn-continue-save").onclick = () => {
  SFX.init();
  SFX.playUIClick();
  runLoadingScreen(true);
};

document.getElementById("btn-logout-prompt").onclick = () => {
  SFX.playUIClick();
  document.getElementById("logout-save-bar").classList.remove("hidden");
};
document.getElementById("btn-logout-save-yes").onclick = () => {
  SFX.playUIClick();
  exitToTitleMenu(true);
};
document.getElementById("btn-logout-save-no").onclick = () => {
  SFX.playUIClick();
  exitToTitleMenu(false);
};
document.getElementById("btn-logout-cancel").onclick = () => {
  SFX.playUIClick();
  document.getElementById("logout-save-bar").classList.add("hidden");
};

let resetConfirmStep = 0;
const resetModal = document.getElementById("modal-reset-confirm");
const resetTitle = document.getElementById("reset-modal-title");
const resetMsg   = document.getElementById("reset-modal-msg");
const resetYes   = document.getElementById("btn-reset-confirm-yes");

document.getElementById("btn-reset-game1").onclick = () => {
  SFX.playUIClick();
  resetConfirmStep = 1;
  resetTitle.textContent = "Reset to Game 1? (1/2)";
  resetMsg.textContent = "All your progress, saved run, and Game Count will be lost.";
  resetYes.textContent = "Yes, Reset";
  resetModal.classList.remove("hidden");
};

resetYes.onclick = () => {
  SFX.playUIClick();
  if (resetConfirmStep === 1) {
    resetConfirmStep = 2;
    resetTitle.textContent = "Are You Absolutely Sure? (2/2)";
    resetMsg.textContent = "Final confirmation: this will wipe your saved game and replay the Game 1 intro.";
    resetYes.textContent = "Confirm Wipe";
  } else {
    SafeStorage.remove(SAVE_KEY);
    SafeStorage.set("woods_game_count", 1);
    SafeStorage.set("woods_intro_seen", "0");
    gameCount = 1;
    introSeen = false;
    resetModal.classList.add("hidden");
    updateContinueButton();
    updateHUD(true);

    const overlay = document.getElementById("reset-progress-overlay");
    const statusTxt = document.getElementById("reset-status-text");
    statusTxt.classList.remove("done");
    statusTxt.textContent = "Resetting......";
    overlay.classList.remove("hidden");

    setTimeout(() => {
      statusTxt.textContent = "Done";
      statusTxt.classList.add("done");
    }, 1300);

    setTimeout(() => {
      overlay.classList.add("hidden");
      document.getElementById("screen-title").classList.remove("hidden");
    }, 2200);
  }
};

document.getElementById("btn-reset-confirm-no").onclick = () => {
  SFX.playUIClick();
  resetConfirmStep = 0;
  resetModal.classList.add("hidden");
};

updateContinueButton();

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
  if (!document.pointerLockElement && state === "PLAYING") pauseGame();
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
  if (e.key === "Tab") {
    e.preventDefault();
    telemetryVisible = !telemetryVisible;
    document.getElementById("telemetry-panel").classList.toggle("hidden", !telemetryVisible);
    if (telemetryVisible) updateTelemetry();
    return;
  }
  if (e.key === " " && state === "INTRO_ANIM") {
    e.preventDefault();
    finishIntroCutscene();
    return;
  }

  const k = e.key.toLowerCase();
  keys[k] = true;

  if (k === "f" && state === "PLAYING" && !player.hiding) {
    flashlightOn = !flashlightOn;
  }

  if (k === "e" && state === "PLAYING") {
    // Toggle Hiding
    if (player.hiding) {
      player.hiding = false;
      player.x = savedHideExit.x;
      player.y = savedHideExit.y;
      player.z = savedHideExit.z;
      currentHideSpot = null;
      updateHUD(true);
      return;
    }

    if (nearMainDoor) {
      SFX.playCreak();
      SFX.stopChaseTheme();
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

      if (player.itemsStolen === items.length) {
        lockdown = true;
        SFX.startChaseTheme();
        lockdownTrackTimer = 1.5;
        npcs.forEach(n => { n.pauseTimer = 0; n.meetingTimer = 0; n.checkingFloor1 = false; });
        assignNewPath(npcs[0], 12);
        assignNewPath(npcs[1], findNearestNode(player.x, player.y, player.z));
        showAlert(`ALL ${items.length} ARTIFACTS STOLEN! Arthur is blocking the Main Door — Eleanor is hunting you!`, "danger", 5500);
      } else {
        const heard = alertNPCsBySound(nearbyItem.x, 4.1, nearbyItem.z, 16.0, `Grabbed ${nearbyItem.name}!`);
        if (heard.length === 0) {
          showAlert(`Grabbed ${nearbyItem.name} silently!`, "warn", 2600);
        }
      }
      updateHUD(true);
      return;
    }

    if (nearbyHideSpot) {
      // Check if an NPC has clear LOS as you duck in!
      let witness = null;
      for (const n of npcs) {
        if (Math.abs(n.y - player.y) < 1.8 && Math.hypot(n.x - player.x, n.z - player.z) < 8.5) {
          if (cppHasLOS(n.x, n.y + 1.4, n.z, player.x, player.y + 1.2, player.z) === 1) {
            witness = n;
            break;
          }
        }
      }

      if (witness) {
        witness.mood[1] = Math.min(1, witness.mood[1] + 0.20);
        SFX.playVoice(`hiding_${witness.name.toLowerCase()}.mp3`, 0.95, true);
        startConfrontation(witness, `${witness.name} saw you duck into the ${nearbyHideSpot.name}! "Why are you hiding in there?" (+20% Curiosity)`);
        return;
      }

      savedHideExit = { x: player.x, y: player.y, z: player.z };
      currentHideSpot = nearbyHideSpot;
      player.hiding = true;
      player.x = nearbyHideSpot.hideX;
      player.y = nearbyHideSpot.hideY;
      player.z = nearbyHideSpot.hideZ;
      player.yaw = nearbyHideSpot.lookYaw;
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
  SFX.startMenuAmbience();
  SFX.playUIClick();
  document.getElementById("screen-disclaimer").classList.add("hidden");
  document.getElementById("screen-rules").classList.remove("hidden");
};
document.getElementById("btn-to-title").onclick = () => {
  SFX.playUIClick();
  document.getElementById("screen-rules").classList.add("hidden");
  document.getElementById("screen-title").classList.remove("hidden");
};
document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
    SFX.playUIClick();
    btn.classList.add("active");
    selectedMode = btn.dataset.mode;
    document.getElementById("mode-desc").textContent = MODES[selectedMode].desc;
    updateHUD(true);
  };
});
document.getElementById("btn-start-loading").onclick = () => {
  SFX.init();
  SFX.playUIClick();
  runLoadingScreen();
};
document.getElementById("btn-resume").onclick = () => {
  document.getElementById("screen-pause").classList.add("hidden");
  document.getElementById("logout-save-bar").classList.add("hidden");
  state = "PLAYING";
  animClock.getDelta();
  safeLock();
};
document.getElementById("btn-continue").onclick = () => {
  document.getElementById("screen-dialogue").classList.add("hidden");
  const other = npcs[0] === activeNPC ? npcs[1] : npcs[0];
  let totalAgg = Math.round(npcs[0].mood[2] * 100) + Math.round(npcs[1].mood[2] * 100);
  let totalCur = Math.round(npcs[0].mood[1] * 100) + Math.round(npcs[1].mood[1] * 100);

  // If one snaps to 100% before the team threshold, they warn their partner
  if (activeNPC.mood[2] >= 1.0 && totalAgg <= 185) {
    other.mood[2] = Math.min(1, other.mood[2] + 0.40);
    other.mood[1] = Math.min(1, other.mood[1] + 0.20);
    activeNPC.investigateTimer = 10.0;
    other.investigateTimer = 10.0;
    showAlert(`${activeNPC.name} is furious (100%) and warned ${other.name}! Avoid ${activeNPC.name} at all costs!`, "danger", 5500);
    updateHUD(true);
    totalAgg = Math.round(npcs[0].mood[2] * 100) + Math.round(npcs[1].mood[2] * 100);
  } else if (activeNPC.mood[1] >= 1.0 && totalCur <= 190) {
    other.mood[1] = Math.min(1, other.mood[1] + 0.40);
    other.investigateTimer = 8.0;
    showAlert(`${activeNPC.name} is completely suspicious (100%) and tipped off ${other.name}!`, "warn", 5000);
    updateHUD(true);
    totalCur = Math.round(npcs[0].mood[1] * 100) + Math.round(npcs[1].mood[1] * 100);
  }

  if (totalAgg > 185) {
    triggerKnifeAttack(activeNPC, `Combined Aggression passed 185% (${totalAgg}%). They snapped.`);
  } else if (totalCur > 190) {
    startArrestCutscene();
  } else {
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
  updateTelemetry();
};

animate();