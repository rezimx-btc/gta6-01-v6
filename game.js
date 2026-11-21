"use strict";
// MARAVELA: NEON TIDE — open-world crime at dusk. Single-file game, no dependencies.
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const mini = document.getElementById("minimap");
const mctx = mini.getContext("2d");

const WORLD_W = 3200;
const WORLD_H = 2400;
const VIEW_W = 1280;
const VIEW_H = 720;

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry(20261121);

// --- City layout ---
const AVENUES = [400, 900, 1400, 1900, 2400];
const STREETS = [350, 800, 1250, 1700, 2050];
const BEACH_X = 2700;
const OCEAN_X = 2960;

const buildings = [];
(function buildCity() {
  const names = ["Hotel Miramar", "Casa Palma", "Torre Coral", "Neon Plaza", "Villa Marea", "The Pelican", "Arcade Sol", "Marina Lofts", "Cafe Brisa", "Club Marea"];
  let n = 0;
  for (let gx = 0; gx < 5; gx++) {
    for (let gy = 0; gy < 4; gy++) {
      const bx = 180 + gx * 500 + rng() * 60;
      const by = 180 + gy * 450 + rng() * 60;
      const bw = 180 + rng() * 140;
      const bh = 130 + rng() * 110;
      if (bx + bw > BEACH_X - 60) continue;
      buildings.push({
        x: bx, y: by, w: bw, h: bh,
        height: 26 + rng() * 70,
        hue: 265 + Math.floor(rng() * 60),
        name: names[n % 10],
        lit: rng() > 0.35,
      });
      n++;
    }
  }
  // Boardwalk strip along the beach
  for (let i = 0; i < 6; i++) {
    buildings.push({ x: 2560, y: 240 + i * 360, w: 120, h: 150, height: 30 + rng() * 40, hue: 20 + Math.floor(rng() * 30), name: "Boardwalk " + (i + 1), lit: true });
  }
})();

function onRoad(x, y) {
  for (const ax of AVENUES) if (Math.abs(x - ax) < 46) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) < 46) return true;
  return false;
}
function inBuilding(x, y) {
  for (const b of buildings) {
    if (x > b.x - 8 && x < b.x + b.w + 8 && y > b.y - 8 && y < b.y + b.h + 8) return b;
  }
  return null;
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

// --- Game state ---
const RANKS = [
  { at: 0, name: "Street Punk" },
  { at: 150, name: "Boardwalk Hustler" },
  { at: 400, name: "Neon Runner" },
  { at: 800, name: "Tide Boss" },
  { at: 1400, name: "Maravela King" },
  { at: 2200, name: "Legend of the Coast" },
];
function rankFor(respect) {
  let r = RANKS[0].name;
  for (const k of RANKS) if (respect >= k.at) r = k.name;
  return r;
}

const state = {
  started: false, paused: false, muted: false,
  cash: 500, respect: 0, wanted: 0,
  missionIndex: 0, missionStage: 0,
  time: 19.7, // dusk, hours
  radio: 0, radioBeat: 0,
  weapons: { pistol: false, smg: false, rifle: false, armor: 0 },
  upgrades: { engine: 0, armor: 0, nitro: 0, paint: 0 },
  crewCd: { rico: 0, lena: 0, marco: 0 },
  nitroUntil: 0, now: 0,
  stats: { carsJacked: 0, missionsDone: 0, copsDodged: 0 },
};

const player = {
  x: 1400, y: 1250, angle: -Math.PI / 2, speed: 0,
  onFoot: true, car: null, color: "#ff5e8a",
};

const cars = [];
const CAR_COLORS = ["#e63946", "#f4d35e", "#2a9d8f", "#4361ee", "#f72585", "#ff9a5a", "#90be6d", "#9b5de5", "#ffffff", "#222222"];
function spawnCar(x, y, angle, isTraffic, color) {
  const c = { x, y, angle, speed: 0, color: color || CAR_COLORS[Math.floor(rng() * 10)], traffic: !!isTraffic, police: false, hp: 100 };
  cars.push(c);
  return c;
}
// Player starter car parked on the avenue
spawnCar(1420, 1330, -Math.PI / 2, false, "#ff5e8a");
// Traffic
for (let i = 0; i < 26; i++) {
  const ax = AVENUES[Math.floor(rng() * 5)];
  const sy = STREETS[Math.floor(rng() * 5)];
  const horiz = rng() > 0.5;
  spawnCar(horiz ? 200 + rng() * 2400 : ax, horiz ? sy : 200 + rng() * 1900, horiz ? (rng() > 0.5 ? 0 : Math.PI) : (rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2), true, null);
}

const peds = [];
for (let i = 0; i < 60; i++) {
  peds.push({
    x: 200 + rng() * 2500, y: 150 + rng() * 2000,
    angle: rng() * Math.PI * 2, speed: 12 + rng() * 22,
    color: ["#ffd166", "#8ecae6", "#ffb703", "#e0aaff", "#90be6d"][Math.floor(rng() * 5)],
    panic: 0,
  });
}

const pickups = [];
for (let i = 0; i < 8; i++) {
  pickups.push({ x: 300 + rng() * 2300, y: 200 + rng() * 1800, kind: i % 2 === 0 ? "cash" : "health", taken: false });
}
// --- 10 story missions ---
const MISSIONS = [
  { title: "MISSION 1 — WELCOME TO MARAVELA", reward: 400, respect: 60,
    stages: [{ x: 2720, y: 1250, text: "Drive to the yellow marker on the boardwalk." }] },
  { title: "MISSION 2 — THE PELICAN DROP", reward: 700, respect: 90,
    stages: [
      { x: 900, y: 800, text: "Pick up the package at The Pelican bar." },
      { x: 2400, y: 1700, text: "Deliver the package to the marina warehouse. Stay off the main avenues." },
    ] },
  { title: "MISSION 3 — NEON HEIST", reward: 1100, respect: 130,
    stages: [
      { x: 1400, y: 350, text: "Steal the getaway car from Neon Plaza." },
      { x: 400, y: 2050, text: "Lose any heat, then bring the car to Rico's garage." },
    ] },
  { title: "MISSION 4 — TIDE RUNNER", reward: 1500, respect: 160,
    stages: [
      { x: 2720, y: 350, text: "Race down the boardwalk to the north pier." },
      { x: 2720, y: 2050, text: "Now sprint the full beachfront to the south pier — beat the clock." },
    ] },
  { title: "MISSION 5 — RICO'S GAMBIT", reward: 2000, respect: 200,
    stages: [
      { x: 1900, y: 800, text: "Meet Rico at Torre Coral. He has a job that pays." },
      { x: 900, y: 1700, text: "Collect the cash from the arcade on 2nd Street." },
      { x: 1900, y: 800, text: "Bring it back to Rico. MVPD is watching — keep it clean." },
    ] },
  { title: "MISSION 6 — LENA'S BACKDOOR", reward: 2400, respect: 230,
    stages: [
      { x: 1400, y: 1700, text: "Drive Lena to the Marina Lofts server room." },
      { x: 400, y: 350, text: "Escape north while Lena wipes the cameras. 3 stars will follow." },
    ] },
  { title: "MISSION 7 — MARCO'S DEBT", reward: 3000, respect: 280,
    stages: [
      { x: 2400, y: 800, text: "Marco needs muscle at the docks. Go." },
      { x: 2720, y: 1700, text: "Chase the debtor's car down the beachfront and ram it to a stop." },
    ] },
  { title: "MISSION 8 — THE CONDOR'S EYE", reward: 3800, respect: 320,
    stages: [
      { x: 900, y: 1250, text: "Grab the shipment at the 1st Street garage." },
      { x: 2400, y: 350, text: "HAWK-1 is airborne. Lose the helicopter, then reach the safehouse." },
    ] },
  { title: "MISSION 9 — KING OF THE BOARDWALK", reward: 5000, respect: 400,
    stages: [
      { x: 2720, y: 800, text: "Win the boardwalk street race: three checkpoints, no mercy." },
      { x: 2720, y: 1250, text: "Checkpoint 2 — hold the lead through the neon strip." },
      { x: 2720, y: 2050, text: "Final checkpoint — cross the line and take the crown." },
    ] },
  { title: "MISSION 10 — NEON TIDE", reward: 8000, respect: 600,
    stages: [
      { x: 1400, y: 1250, text: "The whole crew is waiting at the plaza. This is the big one." },
      { x: 400, y: 800, text: "Hit the vault on 1st Avenue and grab the tide money." },
      { x: 2720, y: 1250, text: "Escape to the boardwalk at 5 stars. Survive, and Maravela is yours." },
    ] },
];

function currentMission() { return MISSIONS[state.missionIndex] || null; }
function missionTarget() {
  const m = currentMission();
  if (!m) return null;
  return m.stages[state.missionStage];
}
function toast(msg, ms) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.opacity = "0"; }, ms || 2600);
}
function addWanted(n) {
  state.wanted = clamp(state.wanted + n, 0, 5);
  updateHud();
}
function completeStage() {
  const m = currentMission();
  state.missionStage++;
  if (state.missionStage >= m.stages.length) {
    state.cash += m.reward;
    state.respect += m.respect;
    state.stats.missionsDone++;
    state.missionIndex++;
    state.missionStage = 0;
    toast("MISSION COMPLETE  +$" + m.reward + "  +" + m.respect + " RESPECT", 3600);
    if (state.missionIndex >= MISSIONS.length) {
      toast("YOU ARE THE LEGEND OF THE COAST. MARAVELA IS YOURS.", 8000);
    } else {
      setTimeout(() => toast("NEW MISSION: " + MISSIONS[state.missionIndex].title, 3200), 3400);
    }
  } else {
    toast("OBJECTIVE UPDATED", 2200);
  }
  updateHud();
  saveGame();
}
// --- Input ---
const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase())) e.preventDefault();
  if (!state.started || state.paused) return;
  const k = e.key.toLowerCase();
  if (k === "e") tryEnterCar();
  if (k === "f") { state.radio = (state.radio + 1) % 3; updateHud(); toast("RADIO: " + RADIO[state.radio].name); }
  if (k === "m") { state.muted = !state.muted; toast(state.muted ? "RADIO MUTED" : "RADIO ON"); }
  if (k === "p") togglePause();
  if (k === "s") { saveGame(); toast("GAME SAVED"); }
  if (k === "b") openShop("weapons");
  if (k === "g") openShop("garage");
  if (k === "1") crewAbility("rico");
  if (k === "2") crewAbility("lena");
  if (k === "3") crewAbility("marco");
});
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

function tryEnterCar() {
  if (!player.onFoot) {
    // exit car
    player.onFoot = true;
    player.x = player.car.x + Math.cos(player.car.angle + Math.PI / 2) * 40;
    player.y = player.car.y + Math.sin(player.car.angle + Math.PI / 2) * 40;
    player.car = null;
    return;
  }
  let best = null, bestD = 90;
  for (const c of cars) {
    const d = dist(player.x, player.y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (!best) { toast("No car nearby"); return; }
  if (best.traffic) {
    best.traffic = false;
    state.stats.carsJacked++;
    addWanted(1);
    toast("CARJACKED! The driver ran off screaming. +1 STAR");
  } else if (best.police) {
    toast("That is an MVPD cruiser — stealing it brings the whole department.");
    addWanted(2);
  }
  player.onFoot = false;
  player.car = best;
  player.angle = best.angle;
}

function crewAbility(who) {
  const now = state.now;
  if (who === "rico" && state.crewCd.rico <= now) {
    state.crewCd.rico = now + 20000;
    state.nitroUntil = now + 6000;
    toast("RICO: NITRO BOOST! Hold on tight.");
  } else if (who === "lena" && state.crewCd.lena <= now) {
    if (state.wanted === 0) { toast("LENA: No heat to hack right now."); return; }
    state.crewCd.lena = now + 45000;
    addWanted(-1);
    toast("LENA: Cameras looped. -1 STAR.");
  } else if (who === "marco" && state.crewCd.marco <= now) {
    state.crewCd.marco = now + 30000;
    for (const p of peds) if (dist(player.x, player.y, p.x, p.y) < 220) p.panic = 3000;
    for (const c of cars) if (c.police && dist(player.x, player.y, c.x, c.y) < 260) { c.speed = 0; c.angle += 0.9; }
    toast("MARCO: Cleared the street. Cops spun out.");
  } else {
    toast("Crew ability recharging...");
  }
  updateHud();
}

// --- Police, roadblocks, helicopter ---
const police = [];
const heli = { x: 1400, y: 1250, active: false, angle: 0 };
let roadblocks = [];
let policeTimer = 0;
let wantedDecay = 0;

function wantedTargetCount() {
  return state.wanted <= 1 ? 1 : state.wanted === 2 ? 2 : state.wanted === 3 ? 3 : state.wanted === 4 ? 4 : 5;
}
function updatePolice(dt) {
  heli.active = state.wanted >= 4;
  const want = wantedTargetCount();
  policeTimer -= dt;
  if (state.wanted > 0 && policeTimer <= 0 && police.length < want + 2) {
    policeTimer = 2600;
    const a = rng() * Math.PI * 2;
    const c = spawnCar(player.x + Math.cos(a) * 620, player.y + Math.sin(a) * 620, angleTo(player.x + Math.cos(a) * 620, player.y + Math.sin(a) * 620, player.x, player.y), false, "#1b2a4a");
    c.police = true;
    police.push(c);
  }
  for (let i = police.length - 1; i >= 0; i--) {
    const c = police[i];
    const d = dist(c.x, c.y, player.x, player.y);
    if (state.wanted === 0 && d > 900) { cars.splice(cars.indexOf(c), 1); police.splice(i, 1); continue; }
    const target = angleTo(c.x, c.y, player.x, player.y);
    let da = target - c.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    c.angle += clamp(da, -0.05, 0.05);
    c.speed = Math.min(c.speed + 0.35, 5.6);
    c.x += Math.cos(c.angle) * c.speed;
    c.y += Math.sin(c.angle) * c.speed;
    if (d < 70) {
      c.speed = 0;
      if (!player.onFoot) { player.car.speed *= 0.6; }
      state.stats.copsDodged += 0;
    }
  }
  // Roadblocks at 3+ stars: two cruisers parked across the nearest avenue ahead
  if (state.wanted >= 3 && roadblocks.length === 0) {
    const ax = AVENUES.reduce((best, v) => Math.abs(v - player.x) < Math.abs(best - player.x) ? v : best, AVENUES[0]);
    roadblocks = [
      { x: ax, y: player.y - 260, angle: Math.PI / 2 },
      { x: ax, y: player.y - 190, angle: Math.PI / 2 },
    ];
    toast("MVPD ROADBLOCK AHEAD — find another route!");
  }
  if (state.wanted < 3) roadblocks = [];
  // Helicopter follows the player and keeps the heat on
  if (heli.active) {
    heli.angle += dt * 0.001;
    heli.x += (player.x - heli.x) * 0.01;
    heli.y += (player.y - heli.y) * 0.01;
    wantedDecay = 0;
  }
  // Wanted decays only when out of sight and slow
  if (state.wanted > 0 && !heli.active) {
    wantedDecay += dt;
    if (wantedDecay > 14000) { addWanted(-1); wantedDecay = 0; toast("Heat cooling off... -1 STAR"); }
  } else if (state.wanted === 0) { wantedDecay = 0; }
}
// --- Radio (WebAudio synth, 3 stations) ---
const RADIO = [
  { name: "98.7 TIDE FM", desc: "Sunset synthwave", scale: [220, 261.63, 329.63, 392, 440, 523.25], bpm: 112 },
  { name: "104.5 NEON LATINA", desc: "Reggaeton heat", scale: [196, 246.94, 293.66, 329.63, 392, 440], bpm: 96 },
  { name: "89.1 BOARDWALK TALK", desc: "Dusk jazz + talk", scale: [174.61, 220, 261.63, 311.13, 349.23, 415.3], bpm: 76 },
];
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; } }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
function radioTick() {
  if (!audioCtx || state.muted || !state.started || state.paused) return;
  const st = RADIO[state.radio];
  const stepMs = 60000 / st.bpm / 2;
  if (state.now - state.radioBeat < stepMs) return;
  state.radioBeat = state.now;
  const note = st.scale[Math.floor(Math.random() * st.scale.length)];
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = state.radio === 2 ? "sine" : "sawtooth";
  osc.frequency.value = note;
  gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.34);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.36);
}

// --- Shops + garage ---
const SHOP_WEAPONS = [
  { id: "pistol", name: "P9 Pistol", price: 800, desc: "Sidearm. Every hustler starts here." },
  { id: "smg", name: "Tide SMG", price: 2200, desc: "Sprays neon. Unlocks at Boardwalk Hustler." },
  { id: "rifle", name: "Maravela Rifle", price: 4500, desc: "Long reach. Unlocks at Neon Runner." },
  { id: "armor", name: "Kevlar Vest", price: 600, desc: "+25 armor, stackable up to 100." },
];
const SHOP_GARAGE = [
  { id: "engine", name: "Engine Tune (Lv 1-3)", price: 1500, desc: "+top speed per level." },
  { id: "armor", name: "Car Armor (Lv 1-3)", price: 1200, desc: "Takes more rams and bullets." },
  { id: "nitro", name: "Nitro Kit (Lv 1-3)", price: 900, desc: "Longer Rico boosts." },
  { id: "paint", name: "Neon Paint Job", price: 300, desc: "Fresh dusk-purple paint." },
];
let shopMode = "weapons";
function openShop(mode) {
  shopMode = mode;
  const panel = document.getElementById("shop-panel");
  const title = document.getElementById("shop-title");
  const items = document.getElementById("shop-items");
  title.textContent = mode === "weapons" ? "AMMU-NEON — WEAPONS & GEAR" : "RICO'S GARAGE — UPGRADES";
  const list = mode === "weapons" ? SHOP_WEAPONS : SHOP_GARAGE;
  items.innerHTML = "";
  for (const it of list) {
    const row = document.createElement("div");
    row.className = "shop-row";
    const owned = mode === "garage" ? state.upgrades[it.id] || 0 : (state.weapons[it.id] ? 1 : 0);
    const maxed = mode === "garage" && owned >= 3;
    const price = it.price * (mode === "garage" ? owned + 1 : 1);
    const btn = document.createElement("button");
    btn.textContent = maxed ? "MAXED" : "BUY $" + price;
    btn.disabled = maxed || state.cash < price || (mode === "weapons" && state.weapons[it.id] && it.id !== "armor");
    btn.onclick = () => { buyItem(it, price, mode); openShop(mode); };
    const label = document.createElement("span");
    label.textContent = it.name + (owned ? "  (Lv " + owned + ")" : "") + " — " + it.desc;
    row.appendChild(label);
    row.appendChild(btn);
    items.appendChild(row);
  }
  panel.hidden = false;
  state.paused = true;
}
function buyItem(it, price, mode) {
  if (state.cash < price) { toast("Not enough cash!"); return; }
  state.cash -= price;
  if (mode === "garage") {
    state.upgrades[it.id] = (state.upgrades[it.id] || 0) + 1;
    if (it.id === "paint" && player.car) player.car.color = "#9b5de5";
  } else {
    if (it.id === "armor") state.weapons.armor = Math.min(100, (state.weapons.armor || 0) + 25);
    else state.weapons[it.id] = true;
  }
  toast("Bought: " + it.name);
  updateHud();
  saveGame();
}
document.getElementById("shop-close").addEventListener("click", () => {
  document.getElementById("shop-panel").hidden = true;
  state.paused = false;
});

// --- Save system ---
const SAVE_KEY = "maravela-save-v6";
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash, respect: state.respect, wanted: 0,
      missionIndex: state.missionIndex, missionStage: state.missionStage,
      weapons: state.weapons, upgrades: state.upgrades,
      x: player.x, y: player.y, stats: state.stats,
    }));
  } catch (e) { /* storage unavailable */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    state.cash = s.cash; state.respect = s.respect;
    state.missionIndex = s.missionIndex; state.missionStage = s.missionStage;
    state.weapons = s.weapons; state.upgrades = s.upgrades;
    state.stats = s.stats || state.stats;
    player.x = s.x; player.y = s.y;
    return true;
  } catch (e) { return false; }
}
// --- HUD ---
function updateHud() {
  document.getElementById("cash-val").textContent = state.cash.toLocaleString("en-US");
  document.getElementById("respect-val").textContent = state.respect;
  document.getElementById("rank-val").textContent = rankFor(state.respect);
  document.getElementById("radio-val").textContent = RADIO[state.radio].name;
  const h = Math.floor(state.time), m = Math.floor((state.time - h) * 60);
  document.getElementById("clock-val").textContent = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById("star" + i);
    el.textContent = i <= state.wanted ? "★" : "☆";
    el.className = i <= state.wanted ? "hot" : "";
  }
  const m2 = currentMission();
  if (m2) {
    document.getElementById("mission-title").textContent = m2.title;
    const t = missionTarget();
    document.getElementById("mission-obj").textContent = t ? t.text : "All missions complete!";
    document.getElementById("mission-progress").textContent = state.stats.missionsDone + " / 10 missions complete · " + state.stats.carsJacked + " cars jacked";
  } else {
    document.getElementById("mission-title").textContent = "MARAVELA IS YOURS";
    document.getElementById("mission-obj").textContent = "Free roam the coast. Keep the crown.";
    document.getElementById("mission-progress").textContent = "10 / 10 missions complete · Legend of the Coast";
  }
  const cd = (name, until) => until > state.now ? Math.ceil((until - state.now) / 1000) + "s" : "ready";
  document.getElementById("crew-val").textContent =
    "Rico " + cd("rico", state.crewCd.rico) + " · Lena " + cd("lena", state.crewCd.lena) + " · Marco " + cd("marco", state.crewCd.marco);
}

// --- Movement ---
function updatePlayer(dt) {
  const up = keys["w"] || keys["arrowup"];
  const down = keys["s"] || keys["arrowdown"];
  const left = keys["a"] || keys["arrowleft"];
  const right = keys["d"] || keys["arrowright"];
  if (player.onFoot) {
    const sp = 3.4;
    let mx = (right ? 1 : 0) - (left ? 1 : 0);
    let my = (down ? 1 : 0) - (up ? 1 : 0);
    if (mx || my) {
      const len = Math.hypot(mx, my);
      player.angle = Math.atan2(my / len, mx / len);
      const nx = player.x + (mx / len) * sp * (dt / 16.7);
      const ny = player.y + (my / len) * sp * (dt / 16.7);
      if (!inBuilding(nx, player.y)) player.x = clamp(nx, 40, WORLD_W - 40);
      if (!inBuilding(player.x, ny)) player.y = clamp(ny, 40, WORLD_H - 40);
    }
    return;
  }
  const car = player.car;
  if (!car) { player.onFoot = true; return; }
  const maxSpeed = 6.2 + state.upgrades.engine * 1.1 + (state.now < state.nitroUntil ? 3.4 + state.upgrades.nitro * 0.8 : 0);
  const accel = 0.22 + state.upgrades.engine * 0.03;
  if (up) car.speed = Math.min(car.speed + accel, maxSpeed);
  else if (down) car.speed = Math.max(car.speed - 0.3, -2.6);
  else car.speed *= 0.985;
  if (keys[" "]) car.speed *= 0.94; // handbrake
  if (left) car.angle -= 0.045 * Math.sign(car.speed || 1) * Math.min(1, Math.abs(car.speed) / 3);
  if (right) car.angle += 0.045 * Math.sign(car.speed || 1) * Math.min(1, Math.abs(car.speed) / 3);
  const nx = car.x + Math.cos(car.angle) * car.speed * (dt / 16.7);
  const ny = car.y + Math.sin(car.angle) * car.speed * (dt / 16.7);
  if (!inBuilding(nx, car.y)) car.x = clamp(nx, 30, WORLD_W - 30); else car.speed *= -0.4;
  if (!inBuilding(car.x, ny)) car.y = clamp(ny, 30, WORLD_H - 30); else car.speed *= -0.4;
  player.x = car.x; player.y = car.y; player.angle = car.angle;
  // Beach sand slows the car, ocean blocks
  if (car.x > BEACH_X) car.speed *= 0.985;
  if (car.x > OCEAN_X - 20) { car.x = OCEAN_X - 20; car.speed = 0; }
}

function updateTraffic(dt) {
  for (const c of cars) {
    if (!c.traffic) continue;
    c.speed = 2.2 + Math.sin(c.x * 0.01 + c.y * 0.01) * 0.4;
    const nx = c.x + Math.cos(c.angle) * c.speed * (dt / 16.7);
    const ny = c.y + Math.sin(c.angle) * c.speed * (dt / 16.7);
    if (inBuilding(nx, ny)) { c.angle += Math.PI / 2; continue; }
    c.x = clamp(nx, 60, OCEAN_X - 60);
    c.y = clamp(ny, 60, WORLD_H - 60);
    if (c.x < 120 || c.x > WORLD_W - 120 || c.y < 120 || c.y > WORLD_H - 120) c.angle += Math.PI;
  }
  for (const p of peds) {
    if (p.panic > 0) {
      p.panic -= dt;
      p.x += Math.cos(p.angle) * 3.2 * (dt / 16.7);
      p.y += Math.sin(p.angle) * 3.2 * (dt / 16.7);
    } else {
      p.x += Math.cos(p.angle) * p.speed * 0.016 * (dt / 16.7);
      p.y += Math.sin(p.angle) * p.speed * 0.016 * (dt / 16.7);
      if (Math.random() < 0.004) p.angle = rng() * Math.PI * 2;
      if (inBuilding(p.x, p.y)) p.angle += Math.PI / 2;
    }
    p.x = clamp(p.x, 40, WORLD_W - 40);
    p.y = clamp(p.y, 40, WORLD_H - 40);
  }
}

function updateMissions() {
  const t = missionTarget();
  if (!t) return;
  if (dist(player.x, player.y, t.x, t.y) < 90) completeStage();
  // Mission heat: the vault job and the helicopter job draw MVPD attention
  if (state.missionIndex === 5 && state.missionStage === 1 && state.wanted < 3) addWanted(0);
  if (state.missionIndex === 7 && state.missionStage === 1 && state.wanted < 4) addWanted(1);
  if (state.missionIndex === 9 && state.missionStage === 2 && state.wanted < 5) addWanted(1);
  for (const pk of pickups) {
    if (!pk.taken && dist(player.x, player.y, pk.x, pk.y) < 46) {
      pk.taken = true;
      if (pk.kind === "cash") { state.cash += 150; toast("Found street cash +$150"); }
      else { toast("Health restored"); }
      updateHud();
    }
  }
}
// --- Rendering ---
function drawCar(c, camX, camY) {
  ctx.save();
  ctx.translate(c.x - camX, c.y - camY);
  ctx.rotate(c.angle);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(-24, -10, 50, 26);
  ctx.fillStyle = c.police ? "#1b2a4a" : c.color;
  ctx.fillRect(-26, -12, 52, 24);
  ctx.fillStyle = c.police ? "#ffffff" : "rgba(255,255,255,0.75)";
  ctx.fillRect(-6, -11, 16, 22);
  if (c.police) {
    ctx.fillStyle = (Math.floor(state.now / 240) % 2 === 0) ? "#ff2244" : "#2266ff";
    ctx.fillRect(-24, -12, 10, 5);
    ctx.fillRect(-24, 7, 10, 5);
  }
  ctx.restore();
}

function render() {
  const camX = clamp(player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
  const camY = clamp(player.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
  // Dusk sky
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, "#2b1055");
  sky.addColorStop(0.45, "#b56576");
  sky.addColorStop(0.75, "#ff9a5a");
  sky.addColorStop(1, "#ffd166");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Sun low over the ocean
  ctx.fillStyle = "#ffdf8e";
  ctx.beginPath();
  ctx.arc(VIEW_W - 130, 150, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,223,142,0.25)";
  ctx.beginPath();
  ctx.arc(VIEW_W - 130, 150, 74, 0, Math.PI * 2);
  ctx.fill();
  // Ground: city asphalt, beach sand, ocean
  ctx.fillStyle = "#3a3f4d";
  ctx.fillRect(-camX, -camY, WORLD_W, WORLD_H);
  ctx.fillStyle = "#e8c98f";
  ctx.fillRect(BEACH_X - camX, -camY, OCEAN_X - BEACH_X, WORLD_H);
  const sea = ctx.createLinearGradient(BEACH_X - camX, 0, VIEW_W, 0);
  sea.addColorStop(0, "#2a6f97");
  sea.addColorStop(1, "#014f86");
  ctx.fillStyle = sea;
  ctx.fillRect(OCEAN_X - camX, -camY, WORLD_W - OCEAN_X, WORLD_H);
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const wy = ((state.now * 0.03 + i * 480) % WORLD_H) - camY;
    ctx.beginPath();
    ctx.moveTo(OCEAN_X - camX + 10, wy);
    ctx.lineTo(OCEAN_X - camX + 90, wy);
    ctx.stroke();
  }
  // Roads
  ctx.fillStyle = "#23262f";
  for (const ax of AVENUES) ctx.fillRect(ax - 46 - camX, -camY, 92, WORLD_H);
  for (const sy of STREETS) ctx.fillRect(-camX, sy - 46 - camY, WORLD_W, 92);
  ctx.strokeStyle = "#ffd166";
  ctx.setLineDash([18, 22]);
  ctx.lineWidth = 3;
  for (const ax of AVENUES) {
    ctx.beginPath(); ctx.moveTo(ax - camX, -camY); ctx.lineTo(ax - camX, WORLD_H - camY); ctx.stroke();
  }
  for (const sy of STREETS) {
    ctx.beginPath(); ctx.moveTo(-camX, sy - camY); ctx.lineTo(WORLD_W - camX, sy - camY); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Buildings with pseudo-3D extruded tops and lit windows
  for (const b of buildings) {
    const bx = b.x - camX, by = b.y - camY;
    if (bx > VIEW_W + 100 || by > VIEW_H + 100 || bx + b.w < -100 || by + b.h < -100) continue;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(bx + 8, by + b.height * 0.4, b.w, b.h);
    ctx.fillStyle = "hsl(" + b.hue + ", 45%, 26%)";
    ctx.fillRect(bx, by + b.height * 0.4, b.w, b.h);
    ctx.fillStyle = "hsl(" + b.hue + ", 55%, 38%)";
    ctx.fillRect(bx, by, b.w, b.h);
    ctx.fillStyle = "hsl(" + (b.hue + 20) + ", 60%, 55%)";
    ctx.fillRect(bx, by, b.w, 6);
    if (b.lit) {
      ctx.fillStyle = "#ffd166";
      for (let wx = 0; wx < 3; wx++) for (let wy = 0; wy < 2; wy++) {
        if ((wx + wy) % 2 === 0) ctx.fillRect(bx + 14 + wx * 34, by + 18 + wy * 30, 12, 14);
      }
    }
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "11px sans-serif";
    ctx.fillText(b.name, bx + 8, by + 14);
  }
  // Pickups
  for (const pk of pickups) {
    if (pk.taken) continue;
    ctx.fillStyle = pk.kind === "cash" ? "#7dff9a" : "#ff5e8a";
    ctx.beginPath();
    ctx.arc(pk.x - camX, pk.y - camY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#12081f";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(pk.kind === "cash" ? "$" : "+", pk.x - camX - 4, pk.y - camY + 4);
  }
  // Mission marker
  const t = missionTarget();
  if (t) {
    const pulse = 26 + Math.sin(state.now / 220) * 8;
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(t.x - camX, t.y - camY, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("▼", t.x - camX - 9, t.y - camY - pulse - 6);
  }
  // Roadblocks
  for (const rb of roadblocks) {
    ctx.save();
    ctx.translate(rb.x - camX, rb.y - camY);
    ctx.rotate(rb.angle);
    ctx.fillStyle = "#1b2a4a";
    ctx.fillRect(-26, -12, 52, 24);
    ctx.fillStyle = "#ff2244";
    ctx.fillRect(-26, -12, 52, 6);
    ctx.restore();
  }
  // Peds
  for (const p of peds) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - camX, p.y - camY, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cars
  for (const c of cars) drawCar(c, camX, camY);
  // Player on foot
  if (player.onFoot) {
    ctx.save();
    ctx.translate(player.x - camX, player.y - camY);
    ctx.rotate(player.angle);
    ctx.fillStyle = "#ff5e8a";
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(6, -3, 10, 6);
    ctx.restore();
  }
  // Helicopter + spotlight
  if (heli.active) {
    ctx.fillStyle = "rgba(255,255,200,0.14)";
    ctx.beginPath();
    ctx.arc(heli.x - camX, heli.y - camY, 130, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(heli.x - camX, heli.y - camY, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 3;
    const ra = heli.angle;
    ctx.beginPath();
    ctx.moveTo(heli.x - camX - Math.cos(ra) * 30, heli.y - camY - Math.sin(ra) * 30);
    ctx.lineTo(heli.x - camX + Math.cos(ra) * 30, heli.y - camY + Math.sin(ra) * 30);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("HAWK-1", heli.x - camX - 20, heli.y - camY - 24);
  }
  // Off-screen mission arrow
  if (t) {
    const dx = t.x - player.x, dy = t.y - player.y;
    if (Math.hypot(dx, dy) > 560) {
      const a = Math.atan2(dy, dx);
      const ax = VIEW_W / 2 + Math.cos(a) * 240;
      const ay = VIEW_H / 2 + Math.sin(a) * 180;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      ctx.moveTo(18, 0); ctx.lineTo(-10, -12); ctx.lineTo(-10, 12); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  drawMinimap();
}

function drawMinimap() {
  const sx = mini.width / WORLD_W, sy = mini.height / WORLD_H;
  mctx.fillStyle = "#1a1030";
  mctx.fillRect(0, 0, mini.width, mini.height);
  mctx.fillStyle = "#e8c98f";
  mctx.fillRect(BEACH_X * sx, 0, (OCEAN_X - BEACH_X) * sx, mini.height);
  mctx.fillStyle = "#014f86";
  mctx.fillRect(OCEAN_X * sx, 0, mini.width, mini.height);
  mctx.strokeStyle = "#555";
  mctx.lineWidth = 1;
  for (const ax of AVENUES) { mctx.beginPath(); mctx.moveTo(ax * sx, 0); mctx.lineTo(ax * sx, mini.height); mctx.stroke(); }
  for (const sy2 of STREETS) { mctx.beginPath(); mctx.moveTo(0, sy2 * sy); mctx.lineTo(mini.width, sy2 * sy); mctx.stroke(); }
  mctx.fillStyle = "#8b7bb8";
  for (const b of buildings) mctx.fillRect(b.x * sx, b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
  const t = missionTarget();
  if (t) {
    mctx.fillStyle = "#ffd166";
    mctx.beginPath(); mctx.arc(t.x * sx, t.y * sy, 5, 0, Math.PI * 2); mctx.fill();
  }
  mctx.fillStyle = "#ff5e8a";
  mctx.beginPath(); mctx.arc(player.x * sx, player.y * sy, 4, 0, Math.PI * 2); mctx.fill();
  if (heli.active) {
    mctx.fillStyle = "#fff";
    mctx.beginPath(); mctx.arc(heli.x * sx, heli.y * sy, 4, 0, Math.PI * 2); mctx.fill();
  }
}

// --- Main loop ---
let lastTs = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(50, ts - (lastTs || ts));
  lastTs = ts;
  state.now = ts;
  if (!state.started || state.paused) return;
  state.time += dt / 1000 / 240; // slow dusk drift
  if (state.time > 21.5) state.time = 19.2;
  updatePlayer(dt);
  updateTraffic(dt);
  updatePolice(dt);
  updateMissions();
  radioTick();
  render();
  updateHud();
}

function togglePause() {
  state.paused = !state.paused;
  toast(state.paused ? "PAUSED — press P to resume" : "RESUMED");
}
function startGame(fresh) {
  ensureAudio();
  if (fresh) {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  } else {
    loadGame();
  }
  document.getElementById("overlay").style.display = "none";
  state.started = true;
  state.paused = false;
  updateHud();
  toast("WELCOME TO MARAVELA — follow the yellow marker", 3600);
}
document.getElementById("btn-start").addEventListener("click", () => startGame(true));
document.getElementById("btn-continue").addEventListener("click", () => startGame(false));
document.getElementById("btn-how").addEventListener("click", () => {
  const h = document.getElementById("howto");
  h.hidden = !h.hidden;
});
updateHud();
requestAnimationFrame(loop);
