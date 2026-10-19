import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const CAD = window.CAD_DATA;
const container = document.getElementById('canvas-container');
const banner = document.getElementById('selection-banner');

// Scene, Camera, Renderer (Direct hardware MSAA + ACESFilmicToneMapping for crisp interior rendering)
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x161412);
scene.fog = new THREE.FogExp2(0x161412, 0.00001);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 60, 150000);
camera.position.set(11000, 15500, 18500);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
container.appendChild(renderer.domElement);

// Studio environment light disabled so only installed interior lights illuminate the store
scene.environment = null;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(11500, 2200, 2200);
controls.maxDistance = 65000;
controls.minDistance = 200;

const textureLoader = new THREE.TextureLoader();

// ============================================================================
// HIGH-RESOLUTION ARCHITECTURAL PBR TEXTURES (Photo 1 Floor, Photo 2 Wall, Photo 3 Open Kitchen)
// ============================================================================
function loadArchitecturalTextures() {
  const loadPbr = (url, repeatX = 1, repeatY = 1) => {
    const tex = textureLoader.load(url);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  };

  // Photo 1: White/Cream Terrazzo Tile Floor with warm tan/brown/charcoal stone chips
  const floorTerrazzoTex = loadPbr('./static/textures/floor_white_terrazzo.jpg', 1, 1);

  // Photo 2: Weathered Raw Industrial Concrete / Plaster Wall
  const wallConcreteTex = loadPbr('./static/textures/wall_raw_concrete.jpg', 1, 1);

  // Photo 3: White Square Mosaic Tile (Bar Base & Kitchen Back Wall)
  const whiteMosaicTex = loadPbr('./static/textures/white_mosaic_tile.jpg', 1, 1);

  // Photo 3: Hand-Drawn Folk Art Illustrated Canopy Light Box Banner
  const canopyArtTex = loadPbr('./static/textures/canopy_folk_art.jpg', 1, 1);

  const timberTex = loadPbr('./static/textures/wood_walnut_grain.jpg', 1, 1);
  const graniteTex = loadPbr('./static/textures/stone_speckled_granite.jpg', 1, 1);

  // Soft Radial Contact Shadow Texture
  const shCanvas = document.createElement('canvas');
  shCanvas.width = 128;
  shCanvas.height = 128;
  const shCtx = shCanvas.getContext('2d');
  const shGrad = shCtx.createRadialGradient(64, 64, 8, 64, 64, 64);
  shGrad.addColorStop(0, 'rgba(0, 0, 0, 0.38)');
  shGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.16)');
  shGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shCtx.fillStyle = shGrad;
  shCtx.fillRect(0, 0, 128, 128);
  const shadowTex = new THREE.CanvasTexture(shCanvas);

  return {
    floorTerrazzoTex,
    wallConcreteTex,
    whiteMosaicTex,
    canopyArtTex,
    timberTex,
    graniteTex,
    shadowTex,
  };
}

const PBR_TEX = loadArchitecturalTextures();

// World-Space Box UV Mapping Helper (Guarantees zero stretching on architectural meshes)
function applyBoxUV(geometry, scaleX = 2000, scaleY = 2000) {
  const pos = geometry.attributes.position;
  if (!pos) return;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const norm = geometry.attributes.normal;
  const count = pos.count;
  let uv = geometry.attributes.uv;
  if (!uv || uv.count !== count) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    uv = geometry.attributes.uv;
  }

  for (let i = 0; i < count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);

    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const nz = Math.abs(norm.getZ(i));

    let u = 0, v = 0;
    if (ny >= nx && ny >= nz) {
      u = px / scaleX;
      v = pz / scaleY;
    } else if (nx >= ny && nx >= nz) {
      u = pz / scaleX;
      v = py / scaleY;
    } else {
      u = px / scaleX;
      v = py / scaleY;
    }
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

// Cylindrical UV Mapping Helper for Curved Bar Fronts
function applyCylindricalUV(geometry, radius, height, scaleX = 600) {
  const pos = geometry.attributes.position;
  if (!pos) return;
  const count = pos.count;
  let uv = geometry.attributes.uv;
  if (!uv || uv.count !== count) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    uv = geometry.attributes.uv;
  }
  for (let i = 0; i < count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const angle = Math.atan2(pz, px);
    const arcDist = angle * radius;
    const u = arcDist / scaleX;
    const v = py / scaleX;
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

// ============================================================================
// SHARED ARCHITECTURAL MATERIALS (Photo 1, Photo 2, Photo 3)
// ============================================================================
const stainlessMat = new THREE.MeshPhysicalMaterial({
  color: 0xd4d8dd,
  roughness: 0.24,
  metalness: 0.88,
  clearcoat: 0.25,
});

const chromeTubularMat = new THREE.MeshPhysicalMaterial({
  color: 0xdce0e5,
  roughness: 0.18,
  metalness: 0.92,
  clearcoat: 0.35,
});

const darkMetalMat = new THREE.MeshStandardMaterial({
  color: 0x202022,
  roughness: 0.36,
  metalness: 0.72,
});

// Photo 2: Burgundy-Brown Ceiling Perforated Tray & Track Rail Material
const burgundyMetalMat = new THREE.MeshStandardMaterial({
  color: 0x461e1a,
  roughness: 0.42,
  metalness: 0.65,
});

// Photo 2: Antique Brass / Bronze Bell Wall Sconce Material
const antiqueBronzeMat = new THREE.MeshPhysicalMaterial({
  color: 0x6b533b,
  roughness: 0.32,
  metalness: 0.82,
  clearcoat: 0.2,
});

// PANTONE 4975C RED INFERNO (HEX #4E0000 / RGB 79, 0, 5) Deep Burgundy 2-Tier Bar Countertop Material
const terracottaCounterMat = new THREE.MeshPhysicalMaterial({
  color: 0x4e0000,
  emissive: 0x140001,
  roughness: 0.34,
  metalness: 0.02,
  clearcoat: 0.18,
  clearcoatRoughness: 0.28,
});

// Photo 3: White Square Mosaic Tile Material (Bar Base & Kitchen Back Wall)
const whiteMosaicTileMat = new THREE.MeshPhysicalMaterial({
  map: PBR_TEX.whiteMosaicTex,
  bumpMap: PBR_TEX.whiteMosaicTex,
  bumpScale: 0.8,
  color: 0xf5f0e8,
  roughness: 0.26,
  clearcoat: 0.35,
});

// Photo 2: Dark Espresso Café Dining Table Material
const darkTableWoodMat = new THREE.MeshPhysicalMaterial({
  map: PBR_TEX.timberTex,
  color: 0x3b2a22,
  roughness: 0.35,
  clearcoat: 0.25,
});

const speckledGraniteMat = new THREE.MeshPhysicalMaterial({
  map: PBR_TEX.graniteTex,
  bumpMap: PBR_TEX.graniteTex,
  bumpScale: 1.5,
  roughness: 0.25,
  metalness: 0.1,
  clearcoat: 0.3,
});

const whitePorcelainMat = new THREE.MeshPhysicalMaterial({
  color: 0xf8fafc,
  roughness: 0.14,
  clearcoat: 0.85,
});

// Photo 3: Warm Diffused Light Box Canopy Bottom Panel
const canopyDiffuserMat = new THREE.MeshStandardMaterial({
  color: 0xfff5dc,
  emissive: 0xffc864,
  emissiveIntensity: 1.35,
  roughness: 0.25,
});

// Photo 3: Illustrated Folk Art Canopy Side Banner Material
const canopyArtSideMat = new THREE.MeshStandardMaterial({
  map: PBR_TEX.canopyArtTex,
  color: 0xfff8ed,
  emissive: 0xffd28a,
  emissiveMap: PBR_TEX.canopyArtTex,
  emissiveIntensity: 0.55,
  roughness: 0.5,
});

const warmLampGlowMat = new THREE.MeshStandardMaterial({
  color: 0xfff0d4,
  emissive: 0xffb347,
  emissiveIntensity: 1.4,
});

const amberGlassMat = new THREE.MeshPhysicalMaterial({
  color: 0x78350f,
  roughness: 0.12,
  transmission: 0.78,
  transparent: true,
  opacity: 0.88,
});

const greenGlassMat = new THREE.MeshPhysicalMaterial({
  color: 0x143322,
  roughness: 0.12,
  transmission: 0.75,
  transparent: true,
  opacity: 0.9,
});

const clearGlassMat = new THREE.MeshPhysicalMaterial({
  color: 0xf8fafc,
  roughness: 0.06,
  transmission: 0.92,
  transparent: true,
  opacity: 0.88,
});

const mirrorGlassMat = new THREE.MeshStandardMaterial({
  color: 0xdbeafe,
  roughness: 0.05,
  metalness: 0.95,
});

const contactShadowMat = new THREE.MeshBasicMaterial({
  map: PBR_TEX.shadowTex,
  transparent: true,
  opacity: 0.40,
  depthWrite: false,
});

// ============================================================================
// GENERAL STORE LIGHTS TURNED OFF (Only installed fixture lights active)
// ============================================================================
const ambientLight = new THREE.AmbientLight(0xffe8cc, 0.06);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfffaf0, 0.0);
dirLight.position.set(18000, 28000, 20000);
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xffe4c4, 0.0);
fillLight.position.set(-12000, 15000, -14000);
scene.add(fillLight);

// Ground Reference Grid
const gridHelper = new THREE.GridHelper(48000, 48, 0x2b2623, 0x1c1917);
gridHelper.position.set(11000, -40, 2200);
scene.add(gridHelper);

// State & Groups
const floorGroups = {};
const cadPlaneMeshes = [];
const ceilingMeshes = [];
const outerWallMeshes = [];
const innerWallMeshes = [];
const fixtureGroups = [];
const interactiveMeshes = [];
const htmlLabels = [];

// Helper: Extrude a 2D polygon [[x, z], ...] vertically along +Y by height `h`
function createCleanWallMesh(poly, height, material, addBaseboard = false) {
  const shape = new THREE.Shape();
  poly.forEach((pt, idx) => {
    if (idx === 0) shape.moveTo(pt[0], -pt[1]);
    else shape.lineTo(pt[0], -pt[1]);
  });
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
  });
  geom.rotateX(-Math.PI / 2);
  geom.computeVertexNormals();
  applyBoxUV(geom, 2400, 2400);

  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  if (addBaseboard) {
    const baseGeom = new THREE.ExtrudeGeometry(shape, {
      depth: 75,
      bevelEnabled: true,
      bevelThickness: 3,
      bevelSize: 3,
      bevelSegments: 1,
    });
    baseGeom.rotateX(-Math.PI / 2);
    applyBoxUV(baseGeom, 1000, 75);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x3b3530, roughness: 0.65 });
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.position.y = 2;
    mesh.add(baseMesh);
  }

  return mesh;
}

function createSlabMesh(poly, holePoly, thickness, material) {
  const shape = new THREE.Shape();
  poly.forEach((pt, idx) => {
    if (idx === 0) shape.moveTo(pt[0], -pt[1]);
    else shape.lineTo(pt[0], -pt[1]);
  });
  shape.closePath();

  if (holePoly && holePoly.length >= 3) {
    const holePath = new THREE.Path();
    holePoly.forEach((pt, idx) => {
      if (idx === 0) holePath.moveTo(pt[0], -pt[1]);
      else holePath.lineTo(pt[0], -pt[1]);
    });
    holePath.closePath();
    shape.holes.push(holePath);
  }

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
  });
  geom.rotateX(-Math.PI / 2);
  geom.computeVertexNormals();
  // Each 1024x1024 terrazzo texture has 2x2 tiles -> 1200mm = 600x600mm square terrazzo tiles matching Photo 3
  applyBoxUV(geom, 1200, 1200);

  const mesh = new THREE.Mesh(geom, material);
  mesh.receiveShadow = true;
  return mesh;
}

function getPolyBounds(poly) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  poly.forEach(([x, z]) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  });
  return {
    minX, maxX, minZ, maxZ,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    w: maxX - minX,
    d: maxZ - minZ,
  };
}

// ============================================================================
// PHOTO 3: INDUSTRIAL ROUND METAL BAR STOOL (Champagne-Silver Padded Seat + 4 Chrome Legs + Double Footrest Rings)
// ============================================================================
const stoolSeatVinylMat = new THREE.MeshPhysicalMaterial({
  color: 0xc9c0b3,
  roughness: 0.28,
  metalness: 0.22,
  clearcoat: 0.35,
  clearcoatRoughness: 0.2,
});

function createIndustrialMetalStool(x, z) {
  const g = new THREE.Group();

  // Contact shadow under stool
  const stoolShadow = new THREE.Mesh(new THREE.PlaneGeometry(380, 380), contactShadowMat);
  stoolShadow.rotation.x = -Math.PI / 2;
  stoolShadow.position.y = 2;
  g.add(stoolShadow);

  const seatH = 660;
  const seatR = 175;

  // Plump round padded champagne-silver vinyl seat cushion + dome top
  const cushionCyl = new THREE.Mesh(new THREE.CylinderGeometry(seatR, seatR - 6, 72, 28), stoolSeatVinylMat);
  cushionCyl.position.y = seatH - 36;
  cushionCyl.castShadow = true;
  g.add(cushionCyl);

  const domeCap = new THREE.Mesh(
    new THREE.SphereGeometry(seatR, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2.8),
    stoolSeatVinylMat
  );
  domeCap.scale.set(1, 0.24, 1);
  domeCap.position.y = seatH - 2;
  domeCap.castShadow = true;
  g.add(domeCap);

  // Under-seat metal apron ring
  const underPlate = new THREE.Mesh(new THREE.CylinderGeometry(140, 140, 14, 20), chromeTubularMat);
  underPlate.position.y = seatH - 78;
  g.add(underPlate);

  // 4 Slightly Splayed Tubular Chrome Steel Legs
  const legLen = seatH - 75;
  const topOffset = 115;
  const botOffset = 158;
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2 + Math.PI / 4;
    const tx = Math.cos(ang) * topOffset;
    const tz = Math.sin(ang) * topOffset;
    const bx = Math.cos(ang) * botOffset;
    const bz = Math.sin(ang) * botOffset;

    const legGeom = new THREE.CylinderGeometry(11, 10, legLen, 12);
    const leg = new THREE.Mesh(legGeom, chromeTubularMat);
    leg.position.set((tx + bx) / 2, legLen / 2, (tz + bz) / 2);
    // Tilt leg outward slightly
    const dx = bx - tx;
    const dz = bz - tz;
    leg.rotation.z = -dx / legLen;
    leg.rotation.x = dz / legLen;
    leg.castShadow = true;
    g.add(leg);

    // Rubber floor foot cap
    const footCap = new THREE.Mesh(new THREE.CylinderGeometry(12, 13, 18, 12), darkMetalMat);
    footCap.position.set(bx, 9, bz);
    g.add(footCap);
  }

  // Double Circular Tubular Footrest Rings (Characteristic of Photo 3 stools!)
  const upperRing = new THREE.Mesh(new THREE.TorusGeometry(138, 8, 10, 28), chromeTubularMat);
  upperRing.rotation.x = Math.PI / 2;
  upperRing.position.y = 275;
  const lowerRing = new THREE.Mesh(new THREE.TorusGeometry(146, 8, 10, 28), chromeTubularMat);
  lowerRing.rotation.x = Math.PI / 2;
  lowerRing.position.y = 185;
  g.add(upperRing, lowerRing);

  g.position.set(x, 0, z);
  return g;
}

// ============================================================================
// PHOTO 2: DINING CHAIR (Bentwood & Cane Webbing Backrest Chair seen at bottom of Photo 2)
// ============================================================================
const caneMeshMat = new THREE.MeshStandardMaterial({
  color: 0xc2a87e,
  roughness: 0.72,
});

function createCafeDiningChair(x, z, facingAngle = 0) {
  const g = new THREE.Group();
  const seatY = 450;

  const chairShadow = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), contactShadowMat);
  chairShadow.rotation.x = -Math.PI / 2;
  chairShadow.position.y = 2;
  g.add(chairShadow);

  // Dark wood frame seat + cane insert
  const seatFrame = new THREE.Mesh(new RoundedBoxGeometry(410, 32, 410, 2, 10), darkTableWoodMat);
  seatFrame.position.y = seatY;
  seatFrame.castShadow = true;
  const seatCane = new THREE.Mesh(new RoundedBoxGeometry(360, 8, 360, 1, 4), caneMeshMat);
  seatCane.position.y = seatY + 14;
  g.add(seatFrame, seatCane);

  // 4 Legs
  [
    [-175, -175],
    [175, -175],
    [-175, 175],
    [175, 175],
  ].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(14, 11, seatY, 12), darkMetalMat);
    leg.position.set(lx, seatY / 2, lz);
    leg.castShadow = true;
    g.add(leg);
  });

  // Curved Bentwood & Cane Backrest (at +Z rear of chair)
  const backFrame = new THREE.Mesh(new RoundedBoxGeometry(400, 250, 26, 2, 10), darkMetalMat);
  backFrame.position.set(0, seatY + 230, 185);
  const backCane = new THREE.Mesh(new RoundedBoxGeometry(350, 200, 12, 1, 4), caneMeshMat);
  backCane.position.set(0, seatY + 230, 185);
  const postL = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 240, 10), darkMetalMat);
  postL.position.set(-180, seatY + 120, 185);
  const postR = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 240, 10), darkMetalMat);
  postR.position.set(180, seatY + 120, 185);
  g.add(backFrame, backCane, postL, postR);

  g.position.set(x, 0, z);
  g.rotation.y = facingAngle;
  return g;
}

// ============================================================================
// PHOTO 2: ANTIQUE BRONZE BELL WALL SCONCE ON VERTICAL BLACK METAL POLE
// ============================================================================
function createIndustrialWallSconce(x, z, facingNormalZ = 1) {
  const g = new THREE.Group();
  // Vertical black metal pipe pole rising from floor (y=0 to y=1850)
  const poleH = 1850;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, poleH, 12), darkMetalMat);
  pole.position.set(0, poleH / 2, 24 * facingNormalZ);
  g.add(pole);

  // Wall mounting bracket clamps along the vertical pole (as seen in Photo 2!)
  [650, 1320, 1780].forEach((cy) => {
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(28, 24, 38), darkMetalMat);
    clamp.position.set(0, cy, 14 * facingNormalZ);
    g.add(clamp);
  });

  // Top U-shaped curved gooseneck arm extending forward
  const armTop = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 120, 12), darkMetalMat);
  armTop.rotation.x = Math.PI / 2;
  armTop.position.set(0, poleH, 75 * facingNormalZ);
  g.add(armTop);

  // Antique Brass/Bronze Bell Shade hanging down from arm
  const shadeZ = 130 * facingNormalZ;
  const bellCap = new THREE.Mesh(new THREE.SphereGeometry(68, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), antiqueBronzeMat);
  bellCap.position.set(0, poleH - 35, shadeZ);
  const bellBody = new THREE.Mesh(new THREE.CylinderGeometry(68, 76, 135, 24), antiqueBronzeMat);
  bellBody.position.set(0, poleH - 102, shadeZ);
  bellBody.castShadow = true;

  // Glowing warm bulb diffuser inside bottom of bell shade
  const bulbLens = new THREE.Mesh(new THREE.CylinderGeometry(66, 66, 8, 24), warmLampGlowMat);
  bulbLens.position.set(0, poleH - 168, shadeZ);
  g.add(bellCap, bellBody, bulbLens);

  // Subtle warm point light casting cone glow onto the raw concrete wall (just like Photo 2!)
  const sconceLight = new THREE.PointLight(0xffe0b2, 1.15, 2800);
  sconceLight.position.set(0, poleH - 210, (shadeZ + 40 * facingNormalZ));
  g.add(sconceLight);

  g.position.set(x, 0, z);
  return g;
}

// ============================================================================
// REALISTIC 3D ARCHITECTURAL FURNITURE & EQUIPMENT BUILDER
// ============================================================================
function buildDetailedFixtureModel(fx, fNum) {
  const b = getPolyBounds(fx.poly);
  const group = new THREE.Group();
  group.position.set(b.cx, 0, b.cz);

  const w = b.w;
  const d = b.d;
  const h = fx.h;

  // Skip raw blocks for 1F & 2F bar_top because buildInteriorSignatureDetails builds the exact 2-tier terracotta + white mosaic counters!
  if (fx.type === 'bar_top' || fx.id === 'f2_beer_bar_inner') {
    return group;
  }

  if (fx.type === 'table') {
    // Photo 2 Style: Dark Espresso Bistro/Dining Table with Stemmed Wine Glasses & Linen Napkin Plates
    const topGeom = new RoundedBoxGeometry(w, 42, d, 3, 12);
    applyBoxUV(topGeom, 1200, 1200);
    const topMesh = new THREE.Mesh(topGeom, darkTableWoodMat);
    topMesh.position.y = h - 21;
    topMesh.castShadow = true;
    topMesh.receiveShadow = true;
    group.add(topMesh);

    const tableShadow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.08, d * 1.08), contactShadowMat);
    tableShadow.rotation.x = -Math.PI / 2;
    tableShadow.position.y = 2;
    group.add(tableShadow);

    const legW = 46;
    const legH = h - 42;
    const insetX = Math.max(80, w / 2 - 140);
    const insetZ = Math.max(80, d / 2 - 140);
    [
      [-insetX, -insetZ],
      [insetX, -insetZ],
      [-insetX, insetZ],
      [insetX, insetZ],
    ].forEach(([lx, lz]) => {
      const legGeom = new RoundedBoxGeometry(legW, legH, legW, 2, 6);
      const leg = new THREE.Mesh(legGeom, darkMetalMat);
      leg.position.set(lx, legH / 2, lz);
      leg.castShadow = true;
      group.add(leg);
    });

    // Photo 2 Table Setting: White ceramic plates, rolled white linen napkins, and stemmed crystal wine glasses!
    const cols = w > 1000 ? 2 : 1;
    for (let c = 0; c < cols; c++) {
      const px = cols === 1 ? 0 : (c === 0 ? -w * 0.25 : w * 0.25);
      [-d * 0.26, d * 0.26].forEach((pz) => {
        // White ceramic plate
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(105, 85, 14, 24), whitePorcelainMat);
        plate.position.set(px, h + 7, pz);

        // Rolled white linen napkin on top of plate (as seen in Photo 2!)
        const napkin = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 130, 16), whitePorcelainMat);
        napkin.rotation.z = Math.PI / 2;
        napkin.rotation.y = 0.25;
        napkin.position.set(px, h + 26, pz);

        // Tall stemmed crystal wine glass (Photo 2)
        const baseGlass = new THREE.Mesh(new THREE.CylinderGeometry(32, 32, 4, 16), clearGlassMat);
        baseGlass.position.set(px + 95, h + 2, pz - 35);
        const stemGlass = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 90, 10), clearGlassMat);
        stemGlass.position.set(px + 95, h + 47, pz - 35);
        const bowlGlass = new THREE.Mesh(new THREE.CylinderGeometry(34, 22, 85, 16), clearGlassMat);
        bowlGlass.position.set(px + 95, h + 130, pz - 35);

        group.add(plate, napkin, baseGlass, stemGlass, bowlGlass);
      });
    }
  } else if (fx.type === 'sink' || fx.type === 'counter' || fx.type === 'equipment' || fx.type === 'stove') {
    // Photo 3: Commercial Stainless Steel Open Kitchen Under-Counter Equipment!
    const kick = new THREE.Mesh(new THREE.BoxGeometry(w - 40, 85, d - 50), darkMetalMat);
    kick.position.y = 42.5;
    group.add(kick);

    const bodyH = h - 125;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w - 10, bodyH, d - 20), stainlessMat);
    body.position.y = 85 + bodyH / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Recessed stainless steel cabinet doors & horizontal/vertical commercial pulls (Photo 3)
    const numDoors = Math.max(1, Math.round(w / 520));
    const doorW = (w - 30) / numDoors;
    for (let i = 0; i < numDoors; i++) {
      const dx = -w / 2 + 15 + (i + 0.5) * doorW;
      const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(doorW - 14, bodyH - 28, d - 10), stainlessMat);
      doorPanel.position.set(dx, 85 + bodyH / 2, 0);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(doorW * 0.65, 16, d + 6), darkMetalMat);
      handle.position.set(dx, 85 + bodyH - 45, 0);
      group.add(doorPanel, handle);
    }

    // Thick brushed stainless worktop + rear backsplash lip (Photo 3)
    const worktop = new THREE.Mesh(new THREE.BoxGeometry(w, 40, d), stainlessMat);
    worktop.position.y = h - 20;
    worktop.castShadow = true;
    worktop.receiveShadow = true;
    const backsplash = new THREE.Mesh(new THREE.BoxGeometry(w, 95, 22), stainlessMat);
    backsplash.position.set(0, h + 45, -d / 2 + 11);
    group.add(worktop, backsplash);

    if (fx.type === 'sink') {
      // Photo 3 right side: Recessed stainless sink basin + tall curved gooseneck chrome faucet + dark wine bottles!
      const basin = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w * 0.65, 580), 14, d * 0.58), darkMetalMat);
      basin.position.set(0, h + 2, 0);
      const faucetPipe = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 280, 12), chromeTubularMat);
      faucetPipe.position.set(0, h + 140, -d * 0.30);
      const faucetArch = new THREE.Mesh(new THREE.TorusGeometry(65, 12, 12, 20, Math.PI), chromeTubularMat);
      faucetArch.rotation.y = Math.PI / 2;
      faucetArch.position.set(0, h + 280, -d * 0.30 + 65);
      group.add(basin, faucetPipe, faucetArch);
    } else if (fx.type === 'stove') {
      const numBurners = w > 900 ? 4 : 2;
      for (let k = 0; k < numBurners; k++) {
        const bx = -w * 0.32 + (k / Math.max(1, numBurners - 1)) * (w * 0.64);
        const grate = new THREE.Mesh(new THREE.CylinderGeometry(110, 120, 22, 16), darkMetalMat);
        grate.position.set(bx, h + 11, 0);
        group.add(grate);
      }
      // Stainless stock pot on stove
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(115, 115, 145, 20), stainlessMat);
      pot.position.set(-w * 0.22, h + 85, 0);
      group.add(pot);
    } else if (fx.type === 'counter' || fx.type === 'equipment') {
      // Photo 3 Kitchen Counter Props: Stainless wine chiller bucket with dark wine bottles + utensil cylinders!
      if (w > 1000) {
        const chiller = new THREE.Mesh(new THREE.CylinderGeometry(105, 85, 210, 20), stainlessMat);
        chiller.position.set(-w * 0.24, h + 105, 0);
        [-32, 32].forEach((bx) => {
          const bBody = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 210, 14), greenGlassMat);
          bBody.position.set(-w * 0.24 + bx, h + 180, 0);
          const bNeck = new THREE.Mesh(new THREE.CylinderGeometry(11, 14, 85, 12), greenGlassMat);
          bNeck.position.set(-w * 0.24 + bx, h + 310, 0);
          group.add(bBody, bNeck);
        });
        const utensilHolder = new THREE.Mesh(new THREE.CylinderGeometry(62, 62, 145, 16), stainlessMat);
        utensilHolder.position.set(w * 0.22, h + 72, -40);
        group.add(chiller, utensilHolder);
      }
    }
  } else if (fx.type === 'fridge') {
    // Tall Commercial Stainless Steel Upright Refrigerator / Freezer (seen in middle of Photo 3!)
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stainlessMat);
    body.position.y = h / 2;
    body.castShadow = true;
    const upperDoor = new THREE.Mesh(new THREE.BoxGeometry(w - 28, h * 0.45, d + 12), stainlessMat);
    upperDoor.position.y = h * 0.72;
    const lowerDoor = new THREE.Mesh(new THREE.BoxGeometry(w - 28, h * 0.42, d + 12), stainlessMat);
    lowerDoor.position.y = h * 0.25;
    // Stack of stainless pots on top of upright fridge (just like Photo 3!)
    const topPot1 = new THREE.Mesh(new THREE.CylinderGeometry(110, 100, 95, 18), stainlessMat);
    topPot1.position.set(-110, h + 48, 0);
    const topPot2 = new THREE.Mesh(new THREE.CylinderGeometry(95, 85, 80, 18), stainlessMat);
    topPot2.position.set(110, h + 40, 0);
    group.add(body, upperDoor, lowerDoor, topPot1, topPot2);
  } else if (fx.type === 'dj') {
    // Industrial DJ Console matching the new terracotta + mosaic tile aesthetic
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h - 75, d), whiteMosaicTileMat);
    applyBoxUV(base.geometry, 480, 480);
    base.position.y = (h - 75) / 2;
    base.castShadow = true;
    const top = new THREE.Mesh(new RoundedBoxGeometry(w + 30, 75, d + 30, 3, 10), terracottaCounterMat);
    top.position.y = h - 37.5;
    group.add(base, top);

    [-165, 165].forEach((tx) => {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(240, 32, 320), darkMetalMat);
      deck.position.set(tx, h + 16, 0);
      const platter = new THREE.Mesh(new THREE.CylinderGeometry(95, 95, 12, 24), stainlessMat);
      platter.position.set(tx, h + 36, 0);
      group.add(deck, platter);
    });
    const mixer = new THREE.Mesh(new THREE.BoxGeometry(160, 36, 320), darkMetalMat);
    mixer.position.set(0, h + 18, 0);
    group.add(mixer);
  } else if (fx.type === 'shelf') {
    if (fx.id === 'f2_backgrounds') {
      // Photo 2 Fiddle-Leaf Fig Indoor Tropical Plants in Dark Planters
      const trough = new THREE.Mesh(new THREE.BoxGeometry(w, 520, d * 0.55), darkMetalMat);
      trough.position.y = 260;
      trough.castShadow = true;
      group.add(trough);

      const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1e3f20, roughness: 0.55 });
      for (let px = -w * 0.35; px <= w * 0.35; px += 440) {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(22, 34, 1100, 10), darkTableWoodMat);
        stem.position.set(px, 820, 0);
        const leaves = new THREE.Mesh(new THREE.DodecahedronGeometry(330, 1), foliageMat);
        leaves.position.set(px, 1480, 0);
        leaves.castShadow = true;
        group.add(stem, leaves);
      }
    } else {
      // Industrial Dark Steel & Wood Open Wine/Bottle Rack
      const postW = 34;
      [
        [-w / 2 + 25, -d / 2 + 25],
        [w / 2 - 25, -d / 2 + 25],
        [-w / 2 + 25, d / 2 - 25],
        [w / 2 - 25, d / 2 - 25],
      ].forEach(([px, pz]) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(postW, h, postW), darkMetalMat);
        post.position.set(px, h / 2, pz);
        post.castShadow = true;
        group.add(post);
      });

      const tiers = 4;
      const bottleMats = [greenGlassMat, amberGlassMat, clearGlassMat];
      for (let t = 0; t < tiers; t++) {
        const sy = 180 + (t / (tiers - 1)) * (h - 260);
        const board = new THREE.Mesh(new THREE.BoxGeometry(w - 20, 28, d - 20), stainlessMat);
        board.position.y = sy;
        board.castShadow = true;
        group.add(board);

        if (t < tiers - 1 && w > 600) {
          const numBottles = Math.min(8, Math.floor((w - 80) / 110));
          for (let bi = 0; bi < numBottles; bi++) {
            const bx = -w / 2 + 50 + (bi + 0.5) * ((w - 100) / numBottles);
            const bMat = bottleMats[(t + bi) % bottleMats.length];
            const bottleBody = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 125, 12), bMat);
            bottleBody.position.set(bx, sy + 76, 0);
            const bottleNeck = new THREE.Mesh(new THREE.CylinderGeometry(8, 12, 48, 10), bMat);
            bottleNeck.position.set(bx, sy + 152, 0);
            group.add(bottleBody, bottleNeck);
          }
        }
      }
    }
  } else if (fx.type === 'photobooth') {
    const frameThick = 60;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w, frameThick, d), darkMetalMat);
    roof.position.y = h - frameThick / 2;
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, frameThick), darkMetalMat);
    backWall.position.set(0, h / 2, -d / 2 + frameThick / 2);
    const leftSide = new THREE.Mesh(new THREE.BoxGeometry(frameThick, h, d), darkMetalMat);
    leftSide.position.set(-w / 2 + frameThick / 2, h / 2, 0);
    const ringLight = new THREE.Mesh(new THREE.TorusGeometry(220, 20, 16, 32), warmLampGlowMat);
    ringLight.position.set(0, 1450, -d / 2 + 120);
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(175, 175, 460, 24), chromeTubularMat);
    stool.position.set(0, 230, 180);
    group.add(roof, backWall, leftSide, ringLight, stool);
  } else if (fx.type === 'wc') {
    const vanity = new THREE.Mesh(new RoundedBoxGeometry(w, 160, d, 2, 8), speckledGraniteMat);
    vanity.position.y = h - 80;
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(190, 150, 130, 24), whitePorcelainMat);
    basin.position.y = h + 65;
    const faucet = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 160, 12), stainlessMat);
    faucet.position.set(0, h + 110, -140);
    const mirrorW = Math.min(w * 0.72, 600);
    const mirrorH = 750;
    const mirror = new THREE.Mesh(new RoundedBoxGeometry(mirrorW, mirrorH, 12, 2, 8), mirrorGlassMat);
    mirror.position.set(0, h + 480, -d / 2 + 10);
    group.add(vanity, basin, faucet, mirror);
  }

  return group;
}

// Helper: Build Architectural Door Frame + Open Wooden Door Leaf + Porcelain Toilets
function buildArchitecturalDoorsAndToilets(fNum) {
  const g = new THREE.Group();
  const doorWoodMat = new THREE.MeshPhysicalMaterial({
    map: PBR_TEX.timberTex,
    color: 0x4a2c1d,
    roughness: 0.38,
    clearcoat: 0.2,
  });

  function addToilet(x, z, rotY = 0) {
    const tg = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(190, 145, 410, 20), whitePorcelainMat);
    bowl.position.set(0, 205, 80);
    const tank = new THREE.Mesh(new RoundedBoxGeometry(360, 420, 170, 2, 12), whitePorcelainMat);
    tank.position.set(0, 610, -120);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(192, 192, 24, 20), whitePorcelainMat);
    lid.position.set(0, 420, 80);
    const toiletShadow = new THREE.Mesh(new THREE.PlaneGeometry(550, 650), contactShadowMat);
    toiletShadow.rotation.x = -Math.PI / 2;
    toiletShadow.position.set(0, 2, 20);
    tg.add(bowl, tank, lid, toiletShadow);
    tg.position.set(x, 0, z);
    tg.rotation.y = rotY;
    g.add(tg);
  }

  function addDoor(x, z, width, rotY = 0) {
    const dg = new THREE.Group();
    const frameThick = 45;
    const doorH = 2150;

    const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(frameThick, doorH, 120), darkMetalMat);
    leftJamb.position.set(-frameThick / 2, doorH / 2, 0);
    const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(frameThick, doorH, 120), darkMetalMat);
    rightJamb.position.set(width + frameThick / 2, doorH / 2, 0);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(width + frameThick * 2, frameThick, 120), darkMetalMat);
    lintel.position.set(width / 2, doorH + frameThick / 2, 0);
    dg.add(leftJamb, rightJamb, lintel);

    const leaf = new THREE.Mesh(new THREE.BoxGeometry(width, 2100, 45), doorWoodMat);
    leaf.position.set(width / 2, 1050, 0);
    leaf.castShadow = true;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(120, 22, 95), stainlessMat);
    handle.position.set(width - 90, 1000, 0);
    dg.add(leaf, handle);

    dg.position.set(x, 0, z);
    dg.rotation.y = rotY;
    g.add(dg);
  }

  if (fNum === 1) {
    addToilet(1720, 920, 0);
    addToilet(3920, 920, 0);
    addDoor(2050, 2650, 750, -0.9);
    addDoor(3050, 2750, 750, -0.8);
    addDoor(5380, 2820, 750, -1.2);
  } else if (fNum === 2) {
    addToilet(-1650, 520, 0);
    addDoor(-1150, 2380, 750, -0.8);
    addDoor(17550, 3050, 850, -1.1);
    addDoor(20300, 4200, 850, 0.8);
  } else if (fNum === 3) {
    addToilet(2280, 950, Math.PI / 2);
  }

  return g;
}

function buildStaircase(totalRise, isFloor3 = false) {
  const stairGroup = new THREE.Group();
  const stepMat = new THREE.MeshPhysicalMaterial({
    map: PBR_TEX.timberTex,
    color: 0x6e4730,
    roughness: 0.42,
    clearcoat: 0.2,
  });
  const stringerMat = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.35, metalness: 0.65 });
  const glassRailMat = new THREE.MeshPhysicalMaterial({
    color: 0xe2e8f0,
    transparent: true,
    opacity: 0.35,
    roughness: 0.1,
    transmission: 0.6,
  });

  const totalSteps = 17;

  const buildFlightSet = (baseY, riseHeight) => {
    const dY = riseHeight / totalSteps;
    const leftCount = 7;
    const zStart = 2640;
    const zEnd = 960;
    const treadD = (zStart - zEnd) / leftCount;

    for (let i = 0; i < leftCount; i++) {
      const zPos = zStart - (i + 0.5) * treadD;
      const xShift = ((2640 - zPos) / 2640) * 240;
      const geom = new THREE.BoxGeometry(900, dY * 0.92, treadD - 15);
      const step = new THREE.Mesh(geom, stepMat);
      step.position.set(95 + xShift, baseY + (i + 0.5) * dY, zPos);
      step.rotation.y = -0.09;
      step.castShadow = true;
      step.receiveShadow = true;
      stairGroup.add(step);
    }

    const winderCoords = [
      { x: 350, z: 680, w: 920, d: 520, rot: -0.09 },
      { x: 580, z: 420, w: 920, d: 520, rot: -0.09 },
      { x: 960, z: 380, w: 850, d: 540, rot: -0.09 },
      { x: 1320, z: 460, w: 880, d: 520, rot: -0.09 },
      { x: 1380, z: 740, w: 900, d: 480, rot: -0.09 },
    ];
    winderCoords.forEach((wc, idx) => {
      const sIdx = leftCount + idx;
      const geom = new THREE.BoxGeometry(wc.w, dY * 0.92, wc.d);
      const step = new THREE.Mesh(geom, stepMat);
      step.position.set(wc.x, baseY + (sIdx + 0.5) * dY, wc.z);
      step.rotation.y = wc.rot;
      step.castShadow = true;
      step.receiveShadow = true;
      stairGroup.add(step);
    });

    const rightCount = 5;
    const rZStart = 1020;
    const rZEnd = 2220;
    const rTreadD = (rZEnd - rZStart) / rightCount;

    for (let j = 0; j < rightCount; j++) {
      const sIdx = leftCount + winderCoords.length + j;
      const zPos = rZStart + (j + 0.5) * rTreadD;
      const xShift = ((2640 - zPos) / 2640) * 240;
      const geom = new THREE.BoxGeometry(900, dY * 0.92, rTreadD - 15);
      const step = new THREE.Mesh(geom, stepMat);
      step.position.set(1120 + xShift, baseY + (sIdx + 0.5) * dY, zPos);
      step.rotation.y = -0.09;
      step.castShadow = true;
      step.receiveShadow = true;
      stairGroup.add(step);
    }
  };

  if (isFloor3) {
    buildFlightSet(-totalRise, totalRise);
    buildFlightSet(0, totalRise);

    const centerRail = new THREE.Mesh(new THREE.BoxGeometry(80, 1000, 1850), glassRailMat);
    centerRail.position.set(740, 500, 1750);
    centerRail.rotation.y = -0.09;
    stairGroup.add(centerRail);

    const topBar = new THREE.Mesh(new THREE.BoxGeometry(100, 50, 1850), stringerMat);
    topBar.position.set(740, 1000, 1750);
    topBar.rotation.y = -0.09;
    stairGroup.add(topBar);
  } else {
    buildFlightSet(0, totalRise);
  }

  stairGroup.userData = { name: '중앙 계단실 (WC 좌측 U자형 계단)' };
  return stairGroup;
}

// ============================================================================
// PHOTO 3: SUSPENDED ILLUSTRATED LIGHT BOX CANOPY HOOD BUILDER
// ============================================================================
function createIllustratedLightBoxCanopy(xCenter, zCenter, width, depth, bottomY, height, ceilingY, rotY = 0) {
  const canopyGroup = new THREE.Group();
  canopyGroup.position.set(xCenter, 0, zCenter);
  canopyGroup.rotation.y = rotY;

  // 4 Vertical Illustrated Banner Sides + Dark Top Cap + Glowing Diffuser Bottom Panel
  // Material array for BoxGeometry: [+X right, -X left, +Y top, -Y bottom, +Z front, -Z back]
  const boxMats = [
    canopyArtSideMat,
    canopyArtSideMat,
    darkMetalMat,
    canopyDiffuserMat,
    canopyArtSideMat,
    canopyArtSideMat,
  ];
  const boxGeom = new THREE.BoxGeometry(width, height, depth);
  const canopyMesh = new THREE.Mesh(boxGeom, boxMats);
  canopyMesh.position.set(0, bottomY + height / 2, 0);
  canopyMesh.castShadow = true;
  canopyGroup.add(canopyMesh);

  // Subtle dark trim border around bottom diffuser edge (as seen in Photo 3!)
  const trimThick = 12;
  const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(width + 6, trimThick, trimThick), darkMetalMat);
  frontTrim.position.set(0, bottomY + trimThick / 2, depth / 2);
  const backTrim = new THREE.Mesh(new THREE.BoxGeometry(width + 6, trimThick, trimThick), darkMetalMat);
  backTrim.position.set(0, bottomY + trimThick / 2, -depth / 2);
  const leftTrim = new THREE.Mesh(new THREE.BoxGeometry(trimThick, trimThick, depth + 6), darkMetalMat);
  leftTrim.position.set(-width / 2, bottomY + trimThick / 2, 0);
  const rightTrim = new THREE.Mesh(new THREE.BoxGeometry(trimThick, trimThick, depth + 6), darkMetalMat);
  rightTrim.position.set(width / 2, bottomY + trimThick / 2, 0);
  canopyGroup.add(frontTrim, backTrim, leftTrim, rightTrim);

  // Black vertical suspension rods hanging from ceiling to top of light box (Photo 3!)
  const rodH = Math.max(200, ceilingY - (bottomY + height));
  const rodY = bottomY + height + rodH / 2;
  const rodOffsets = [
    [-width * 0.42, -depth * 0.38],
    [width * 0.42, -depth * 0.38],
    [-width * 0.42, depth * 0.38],
    [width * 0.42, depth * 0.38],
    [0, depth * 0.38],
  ];
  rodOffsets.forEach(([rx, rz]) => {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, rodH, 10), darkMetalMat);
    rod.position.set(rx, rodY, rz);
    canopyGroup.add(rod);
  });

  // Warm downward illumination from the light box onto the burgundy bar counter & open kitchen
  const lightLeft = new THREE.PointLight(0xffcf78, 2.4, 4600, 1.45);
  lightLeft.position.set(-width * 0.25, bottomY - 50, 0);
  const lightRight = new THREE.PointLight(0xffcf78, 2.4, 4600, 1.45);
  lightRight.position.set(width * 0.25, bottomY - 50, 0);
  canopyGroup.add(lightLeft, lightRight);

  return canopyGroup;
}

// ============================================================================
// PHOTO 2 & PHOTO 3: 1F OPEN KITCHEN & 2F BAR ARCHITECTURAL DETAILS
// ============================================================================
function buildInteriorSignatureDetails(fNum, floorHeight) {
  const dGroup = new THREE.Group();

  if (fNum === 1) {
    // ------------------------------------------------------------------------
    // 1) PHOTO 3: OPEN KITCHEN BACK WALL (LOWER WHITE MOSAIC TILE + UPPER CREAM PAINT)
    // ------------------------------------------------------------------------
    // Lower section (y: 0 ~ 2040mm, up to the red line just above the shelf bowls): White square mosaic tile
    const tileWallH = 2040;
    const kitchenTileWall = new THREE.Mesh(new THREE.BoxGeometry(9250, tileWallH, 28), whiteMosaicTileMat);
    applyBoxUV(kitchenTileWall.geometry, 480, 480);
    kitchenTileWall.position.set(13600, tileWallH / 2, 550);
    kitchenTileWall.receiveShadow = true;
    dGroup.add(kitchenTileWall);

    // Upper section (y: 2040mm ~ ceiling): Smooth warm cream paint (as seen above the tile line in Photo 3!)
    const creamWallH = Math.max(200, floorHeight - 60 - tileWallH);
    const creamPaintMat = new THREE.MeshStandardMaterial({
      color: 0xede4d0,
      roughness: 0.88,
      metalness: 0.01,
    });
    const kitchenCreamUpperWall = new THREE.Mesh(new THREE.BoxGeometry(9250, creamWallH, 28), creamPaintMat);
    kitchenCreamUpperWall.position.set(13600, tileWallH + creamWallH / 2, 550);
    kitchenCreamUpperWall.receiveShadow = true;
    dGroup.add(kitchenCreamUpperWall);

    // ------------------------------------------------------------------------
    // 2) PHOTO 3: WALL-MOUNTED STAINLESS STEEL OPEN SHELVES + STACKED CERAMIC BOWLS, PLATES & POTS
    // ------------------------------------------------------------------------
    // Left Kitchen Stainless Exhaust Hood & Shelf Zone (x: 9200 ~ 12100)
    const exhaustHood = new THREE.Mesh(new THREE.BoxGeometry(2850, 520, 680), stainlessMat);
    exhaustHood.position.set(10650, 2260, 860);
    exhaustHood.castShadow = true;
    dGroup.add(exhaustHood);

    // Warm under-hood task light illuminating the cooking line (Photo 3 left background)
    const hoodLight = new THREE.PointLight(0xffe0a3, 1.4, 3200, 1.5);
    hoodLight.position.set(10650, 1920, 950);
    dGroup.add(hoodLight);

    // Right Open Kitchen Stainless Steel Wall Shelves (x: 13600 ~ 18000, matching Photo 3 right side!)
    const shelfSections = [
      { cx: 14750, w: 2050, y: 1780 },
      { cx: 16950, w: 2150, y: 1780 },
    ];
    shelfSections.forEach((sc) => {
      const shelfBoard = new THREE.Mesh(new THREE.BoxGeometry(sc.w, 24, 310), stainlessMat);
      shelfBoard.position.set(sc.cx, sc.y, 710);
      shelfBoard.castShadow = true;
      dGroup.add(shelfBoard);

      // Triangular stainless wall brackets underneath shelf (Photo 3!)
      [-sc.w * 0.38, sc.w * 0.38].forEach((bx) => {
        const bracketV = new THREE.Mesh(new THREE.BoxGeometry(18, 190, 24), stainlessMat);
        bracketV.position.set(sc.cx + bx, sc.y - 95, 575);
        const bracketDiag = new THREE.Mesh(new THREE.BoxGeometry(16, 240, 16), stainlessMat);
        bracketDiag.rotation.x = 0.72;
        bracketDiag.position.set(sc.cx + bx, sc.y - 85, 665);
        dGroup.add(bracketV, bracketDiag);
      });

      // Stacked White Ceramic Bowls, Plates & Stainless Pots on the Shelf (Photo 3!)
      for (let i = 0; i < 5; i++) {
        const px = sc.cx - sc.w * 0.36 + i * (sc.w * 0.18);
        if (i % 3 === 2) {
          // Stainless steel prep pot / teapot on shelf
          const pot = new THREE.Mesh(new THREE.CylinderGeometry(68, 62, 135, 18), stainlessMat);
          pot.position.set(px, sc.y + 80, 710);
          dGroup.add(pot);
        } else {
          // Tall neat stack of white ceramic bowls/plates (Photo 3!)
          const stackH = 110 + (i % 2) * 35;
          const bowlStack = new THREE.Mesh(new THREE.CylinderGeometry(82, 68, stackH, 20), whitePorcelainMat);
          bowlStack.position.set(px, sc.y + 12 + stackH / 2, 710);
          bowlStack.castShadow = true;
          dGroup.add(bowlStack);
        }
      }
    });

    // ------------------------------------------------------------------------
    // 3) PHOTO 3: TWO SUSPENDED ILLUSTRATED LIGHT BOX CANOPY HOODS (50% SLIMMER & ALIGNED DIRECTLY OVER BAR TABLE)
    // ------------------------------------------------------------------------
    // Rear-left canopy: directly centered above Left Bar Table (x: 9190 ~ 14350, zCenter: 2885, depth: 460mm = 50% reduced, height: 260mm)
    const canopyLeft = createIllustratedLightBoxCanopy(11770, 2885, 5200, 460, 2160, 260, floorHeight - 150, 0);
    // Front-right canopy: directly centered above Right Bar Table (x: 15330 ~ 18140, zCenter: 2885, depth: 460mm = 50% reduced, height: 260mm)
    const canopyRight = createIllustratedLightBoxCanopy(16735, 2885, 2810, 460, 2160, 260, floorHeight - 150, 0);
    dGroup.add(canopyLeft, canopyRight);

    // ------------------------------------------------------------------------
    // 4) PHOTO 3: 2-TIER TERRACOTTA / BURNT-SIENNA BAR COUNTER + WHITE MOSAIC TILE BASE
    // ------------------------------------------------------------------------
    // Contact AO Shadows along bar base
    const barShadowL = new THREE.Mesh(new THREE.PlaneGeometry(5300, 580), contactShadowMat);
    barShadowL.rotation.x = -Math.PI / 2;
    barShadowL.position.set(11770, 2, 2850);
    const barShadowR = new THREE.Mesh(new THREE.PlaneGeometry(2900, 580), contactShadowMat);
    barShadowR.rotation.x = -Math.PI / 2;
    barShadowR.position.set(16705, 2, 2850);
    dGroup.add(barShadowL, barShadowR);

    // 4-A) Left Bar Section (x: 9190 ~ 14350, z: 2850)
    const mosaicBaseL = new THREE.Mesh(new THREE.BoxGeometry(5160, 880, 420), whiteMosaicTileMat);
    applyBoxUV(mosaicBaseL.geometry, 480, 480);
    mosaicBaseL.position.set(11770, 440, 2850);
    mosaicBaseL.castShadow = true;
    mosaicBaseL.receiveShadow = true;

    // Lower Terracotta Dining Countertop (overhanging toward stools with thick 85mm fascia)
    const terraTopL = new THREE.Mesh(new RoundedBoxGeometry(5240, 85, 580, 2, 6), terracottaCounterMat);
    terraTopL.position.set(11770, 912, 2920);
    terraTopL.castShadow = true;
    terraTopL.receiveShadow = true;

    // Upper Terracotta Raised Service Step/Riser (Photo 3 2-tier terracotta counter!)
    const terraRiserL = new THREE.Mesh(new RoundedBoxGeometry(5240, 165, 250, 2, 6), terracottaCounterMat);
    terraRiserL.position.set(11770, 1030, 2705);
    terraRiserL.castShadow = true;
    terraRiserL.receiveShadow = true;
    dGroup.add(mosaicBaseL, terraTopL, terraRiserL);

    // 4-B) Right Bar Section (x: 15330 ~ 18080, z: 2850) + L-Corner Turn (x: 17880, z: 550 ~ 2910)
    const mosaicBaseR = new THREE.Mesh(new THREE.BoxGeometry(2750, 880, 420), whiteMosaicTileMat);
    applyBoxUV(mosaicBaseR.geometry, 480, 480);
    mosaicBaseR.position.set(16705, 440, 2850);
    mosaicBaseR.castShadow = true;
    mosaicBaseR.receiveShadow = true;

    const terraTopR = new THREE.Mesh(new RoundedBoxGeometry(2840, 85, 580, 2, 6), terracottaCounterMat);
    terraTopR.position.set(16705, 912, 2920);
    terraTopR.castShadow = true;
    terraTopR.receiveShadow = true;

    const terraRiserR = new THREE.Mesh(new RoundedBoxGeometry(2840, 165, 250, 2, 6), terracottaCounterMat);
    terraRiserR.position.set(16705, 1030, 2705);
    terraRiserR.castShadow = true;
    terraRiserR.receiveShadow = true;
    dGroup.add(mosaicBaseR, terraTopR, terraRiserR);

    // Side L-Return Section (x: 17880, z: 550 ~ 2910)
    const mosaicBaseSide = new THREE.Mesh(new THREE.BoxGeometry(380, 880, 2360), whiteMosaicTileMat);
    applyBoxUV(mosaicBaseSide.geometry, 480, 480);
    mosaicBaseSide.position.set(17880, 440, 1730);
    mosaicBaseSide.castShadow = true;
    mosaicBaseSide.receiveShadow = true;

    const terraTopSide = new THREE.Mesh(new RoundedBoxGeometry(540, 85, 2500, 2, 6), terracottaCounterMat);
    terraTopSide.position.set(17950, 912, 1780);
    terraTopSide.castShadow = true;
    terraTopSide.receiveShadow = true;

    const terraRiserSide = new THREE.Mesh(new RoundedBoxGeometry(250, 165, 2400, 2, 6), terracottaCounterMat);
    terraRiserSide.position.set(17805, 1030, 1730);
    terraRiserSide.castShadow = true;
    terraRiserSide.receiveShadow = true;
    dGroup.add(mosaicBaseSide, terraTopSide, terraRiserSide);
  } else if (fNum === 2) {
    // ------------------------------------------------------------------------
    // 2F SEMI-CIRCULAR CRAFT BEER BAR (QUẦY LẤY BIA) IN MATCHING WHITE MOSAIC + TERRACOTTA STYLE
    // ------------------------------------------------------------------------
    const circleBarShadow = new THREE.Mesh(new THREE.RingGeometry(1000, 1920, 36, 1, 0, Math.PI), contactShadowMat);
    circleBarShadow.rotation.x = -Math.PI / 2;
    circleBarShadow.position.set(12850, 2, 520);
    dGroup.add(circleBarShadow);

    const arcShape = new THREE.Shape();
    arcShape.absarc(0, 0, 1840, 0, Math.PI, false);
    arcShape.absarc(0, 0, 1120, Math.PI, 0, true);
    arcShape.closePath();

    // White Mosaic Tile Curved Base Drum
    const baseExtrude = new THREE.ExtrudeGeometry(arcShape, { depth: 880, bevelEnabled: false });
    baseExtrude.rotateX(Math.PI / 2);
    applyCylindricalUV(baseExtrude, 1840, 880, 480);
    const barMosaicBase = new THREE.Mesh(baseExtrude, whiteMosaicTileMat);
    barMosaicBase.position.set(12850, 880, 520);
    barMosaicBase.castShadow = true;

    // Lower Terracotta Dining Countertop Arc
    const topShape = new THREE.Shape();
    topShape.absarc(0, 0, 1920, 0, Math.PI, false);
    topShape.absarc(0, 0, 1080, Math.PI, 0, true);
    topShape.closePath();
    const topExtrude = new THREE.ExtrudeGeometry(topShape, { depth: 80, bevelEnabled: false });
    topExtrude.rotateX(Math.PI / 2);
    const barTerraTop = new THREE.Mesh(topExtrude, terracottaCounterMat);
    barTerraTop.position.set(12850, 955, 520);
    barTerraTop.castShadow = true;

    // Upper Terracotta Raised Service Step Arc
    const riserShape = new THREE.Shape();
    riserShape.absarc(0, 0, 1520, 0, Math.PI, false);
    riserShape.absarc(0, 0, 1080, Math.PI, 0, true);
    riserShape.closePath();
    const riserExtrude = new THREE.ExtrudeGeometry(riserShape, { depth: 155, bevelEnabled: false });
    riserExtrude.rotateX(Math.PI / 2);
    const barTerraRiser = new THREE.Mesh(riserExtrude, terracottaCounterMat);
    barTerraRiser.position.set(12850, 1110, 520);
    barTerraRiser.castShadow = true;

    // Chrome Draft Beer Tap Tower
    const tapBridge = new THREE.Mesh(new RoundedBoxGeometry(950, 420, 120, 3, 14), stainlessMat);
    tapBridge.position.set(12850, 1150, 1050);
    dGroup.add(barMosaicBase, barTerraTop, barTerraRiser, tapBridge);
  }

  return dGroup;
}

// ============================================================================
// BUILD ALL FLOORS FROM CAD_DATA (Keeping 100% of CAD Positions & Sizes)
// ============================================================================
function buildModel() {
  Object.keys(CAD).forEach((floorKey) => {
    const fNum = parseInt(floorKey, 10);
    const fData = CAD[floorKey];
    const fGroup = new THREE.Group();
    fGroup.position.y = fData.elevation;
    fGroup.userData = { floor: fNum, baseElevation: fData.elevation };
    scene.add(fGroup);
    floorGroups[fNum] = fGroup;

    // 1. Structural Slab with Photo 1 White/Cream Terrazzo Tile Texture
    const slabMat = new THREE.MeshStandardMaterial({
      map: PBR_TEX.floorTerrazzoTex,
      bumpMap: PBR_TEX.floorTerrazzoTex,
      bumpScale: 0.5,
      color: 0xfaf7f2,
      roughness: 0.36,
      metalness: 0.04,
    });
    const slabMesh = createSlabMesh(fData.slab_polygon, fData.slab_hole, 150, slabMat);
    slabMesh.position.y = -150;
    slabMesh.userData = { isSlab: true, floor: fNum };
    fGroup.add(slabMesh);

    // 1-B. Interior Ceiling Slab (Dark matte ceiling positioned at height - 155 so upper floor terrazzo never shows on ceiling)
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x1c1917,
      roughness: 0.92,
      side: THREE.DoubleSide,
    });
    const ceilingMesh = createSlabMesh(fData.slab_polygon, fData.slab_hole, 30, ceilingMat);
    ceilingMesh.position.y = fData.height - 155;
    ceilingMesh.visible = false;
    fGroup.add(ceilingMesh);
    ceilingMeshes.push(ceilingMesh);
    if (fNum > 1) {
      // Underside cap of upper floor slab so even in 'all' view looking up shows a dark ceiling instead of terrazzo
      const underCap = createSlabMesh(fData.slab_polygon, fData.slab_hole, 8, ceilingMat);
      underCap.position.y = -156;
      fGroup.add(underCap);
    }

    // 2. CAD Floor Plan Image Overlay (Hidden by default)
    const b = fData.texture_bounds_mm;
    const planeW = b.x1 - b.x0;
    const planeD = b.z1 - b.z0;
    const tex = textureLoader.load(fData.plan_texture);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const planeGeom = new THREE.PlaneGeometry(planeW, planeD);
    planeGeom.rotateX(-Math.PI / 2);
    const planeMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const cadPlane = new THREE.Mesh(planeGeom, planeMat);
    cadPlane.position.set((b.x0 + b.x1) / 2, 6, (b.z0 + b.z1) / 2);
    cadPlane.visible = false;
    fGroup.add(cadPlane);
    cadPlaneMeshes.push(cadPlane);

    // 3. Outer Structural Walls (Photo 2: Raw Weathered Industrial Concrete Wall Texture)
    const wallContainer = new THREE.Group();
    fGroup.add(wallContainer);

    fData.outer_walls.forEach((w) => {
      const isGlass = !!w.glass;
      const mat = isGlass
        ? new THREE.MeshPhysicalMaterial({
            color: 0xe2e8f0,
            roughness: 0.1,
            transmission: 0.78,
            transparent: true,
            opacity: 0.42,
          })
        : new THREE.MeshStandardMaterial({
            map: PBR_TEX.wallConcreteTex,
            bumpMap: PBR_TEX.wallConcreteTex,
            bumpScale: 1.4,
            color: 0xd8d5d0,
            roughness: 0.84,
            metalness: 0.04,
          });
      const mesh = createCleanWallMesh(w.poly, w.h, mat, !isGlass);
      mesh.userData = {
        name: `TẦNG ${fNum} 외벽/구조체 (${w.id})`,
        height: w.h,
        isOuterWall: !isGlass,
        isGlass,
      };
      wallContainer.add(mesh);
      if (!isGlass) outerWallMeshes.push(mesh);
      interactiveMeshes.push(mesh);
    });

    // 4. Inner Partition Walls (Photo 2 Raw Concrete & Framed Glass VIP Partitions)
    fData.inner_walls.forEach((w) => {
      const isGlass = !!w.glass;
      const mat = isGlass
        ? new THREE.MeshPhysicalMaterial({
            color: 0xf1f5f9,
            roughness: 0.12,
            transmission: 0.74,
            transparent: true,
            opacity: 0.44,
          })
        : new THREE.MeshStandardMaterial({
            map: PBR_TEX.wallConcreteTex,
            bumpMap: PBR_TEX.wallConcreteTex,
            bumpScale: 1.2,
            color: 0xdedbd6,
            roughness: 0.82,
            metalness: 0.04,
          });
      const mesh = createCleanWallMesh(w.poly, w.h, mat, !isGlass);
      mesh.userData = {
        name: `TẦNG ${fNum} 내부 칸막이벽 (${w.id})`,
        height: w.h,
        isInnerWall: true,
        isGlass,
      };
      wallContainer.add(mesh);
      innerWallMeshes.push(mesh);
      interactiveMeshes.push(mesh);
    });

    // 5. Detailed 3D Furniture, Open Kitchen Appliances, Terracotta Bar, Tables, Stools, Doors, Toilets
    const fixGroup = new THREE.Group();
    fGroup.add(fixGroup);
    fixtureGroups.push(fixGroup);

    fData.fixtures.forEach((fx) => {
      const detailedModel = buildDetailedFixtureModel(fx, fNum);
      detailedModel.userData = {
        name: `[${fNum}층] ${fx.name} (높이: ${fx.h}mm)`,
        fixtureType: fx.type,
      };
      fixGroup.add(detailedModel);
    });

    // Photo 3 Industrial Round Metal Bar Stools at exact CAD stool coordinates
    fData.stools.forEach((pt) => {
      const stool = createIndustrialMetalStool(pt[0], pt[1]);
      fixGroup.add(stool);
    });

    // Photo 2 Bentwood & Cane Dining Chairs at exact CAD chair coordinates
    fData.chairs.forEach((pt) => {
      const isTopRow = (fNum === 1 && pt[1] < 1650) || (fNum === 2 && (pt[1] < 1400 || (pt[0] > 20000 && pt[1] < 1900)));
      const rot = isTopRow ? Math.PI : 0;
      const chair = createCafeDiningChair(pt[0], pt[1], rot);
      fixGroup.add(chair);
    });

    // Add Architectural Doors & Porcelain Toilets
    fixGroup.add(buildArchitecturalDoorsAndToilets(fNum));

    // Add Staircases
    const stairs = buildStaircase(fData.height, fNum === 3);
    fixGroup.add(stairs);

    // Add Photo 2 & Photo 3 Open Kitchen / Bar / Wall Sconce Signature Details
    const interiorDetails = buildInteriorSignatureDetails(fNum, fData.height);
    fixGroup.add(interiorDetails);

    if (fNum === 3) {
      const rightStairGroup = new THREE.Group();
      const sMat = new THREE.MeshStandardMaterial({ map: PBR_TEX.timberTex, color: 0x6e4730, roughness: 0.5 });
      for (let k = 0; k < 7; k++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(660, 180, 250), sMat);
        step.position.set(10370, (k + 0.5) * 180, 1550 + k * 250);
        rightStairGroup.add(step);
      }
      fixGroup.add(rightStairGroup);
    }

    fData.labels.forEach((lbl) => {
      const el = document.createElement('div');
      el.className = 'room-label';
      el.textContent = `${fNum}F · ${lbl.text}`;
      document.body.appendChild(el);
      htmlLabels.push({
        el,
        floor: fNum,
        localPos: new THREE.Vector3(lbl.pos[0], fData.height * 0.48, lbl.pos[1]),
      });
    });
  });

  // Warm ambient interior lighting across 1F & 2F halls
  const warmHallLights = [
    { f: 1, x: 19800, y: 2650, z: 2300 },
    { f: 2, x: 12850, y: 2550, z: 1500 },
    { f: 2, x: 18200, y: 2550, z: 1900 },
    { f: 2, x: 21900, y: 2550, z: 2100 },
    { f: 2, x: 6400, y: 2550, z: 2400 },
  ];
  warmHallLights.forEach((lp) => {
    const pl = new THREE.PointLight(0xffdca8, 1.6, 7500);
    pl.position.set(lp.x, lp.y, lp.z);
    floorGroups[lp.f].add(pl);
  });
}

buildModel();

// UI Controls: Floor View Modes
let activeFloorMode = 'all';

function updateFloorMode(mode) {
  activeFloorMode = mode;
  document.querySelectorAll('#floor-tabs .tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  Object.keys(floorGroups).forEach((k) => {
    const fNum = parseInt(k, 10);
    const grp = floorGroups[fNum];
    const baseElev = grp.userData.baseElevation;

    if (mode === 'all') {
      grp.visible = true;
      grp.position.y = baseElev;
    } else if (mode === 'exploded') {
      grp.visible = true;
      grp.position.y = baseElev + (fNum - 1) * 3200;
    } else {
      const targetFloor = parseInt(mode, 10);
      grp.visible = fNum === targetFloor;
      grp.position.y = 0;
    }
  });
}

document.querySelectorAll('#floor-tabs .tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => updateFloorMode(btn.dataset.mode));
});

function setCeilingVisibility(visible) {
  ceilingMeshes.forEach((cm) => (cm.visible = visible));
  const toggleEl = document.getElementById('toggle-ceiling');
  if (toggleEl) toggleEl.checked = visible;
}

// UI Controls: Camera Presets
document.querySelectorAll('.cam-btn').forEach((btn) => {
  const preset = btn.dataset.cam;
  if (!preset) return;
  btn.addEventListener('click', () => {
    if (preset === 'iso') {
      eyeLevelMode = false;
      document.getElementById('toggle-eye-level').checked = false;
      setCeilingVisibility(false);
      updateFloorMode('all');
      camera.position.set(11000, 15500, 18500);
      controls.target.set(11500, 2200, 2200);
      banner.textContent = '3D 전체 완공 조감도 시점: 화이트 테라조 타일 바닥 + 노출 콘크리트 벽 + 1층 오픈키친';
    } else if (preset === 'f1_walk') {
      eyeLevelMode = true;
      document.getElementById('toggle-eye-level').checked = true;
      setCeilingVisibility(true);
      updateFloorMode('1');
      // Perspective matching Photo 3 (looking along the L-shaped terracotta bar & illustrated canopy!)
      camera.position.set(18750, 1620, 3550);
      controls.target.set(11800, 1500, 2150);
      banner.textContent = '🍷 1F 오픈키친 바 시점: 천장 일러스트 라이트박스 후드 + 2단 테라코타 & 화이트 모자이크 카운터 + 원형 메탈 스툴';
    } else if (preset === 'f1_dj') {
      eyeLevelMode = true;
      document.getElementById('toggle-eye-level').checked = true;
      setCeilingVisibility(true);
      updateFloorMode('1');
      camera.position.set(10200, 1650, 3400);
      controls.target.set(16800, 1550, 2200);
      banner.textContent = '🎧 1F DJ 부스 & 다이닝 홀 시점: 노출 콘크리트 빈티지 벽 + 앤티크 브론즈 벨 벽등 + 화이트 테라조 바닥';
    } else if (preset === 'f2_beer') {
      eyeLevelMode = true;
      document.getElementById('toggle-eye-level').checked = true;
      setCeilingVisibility(true);
      updateFloorMode('2');
      camera.position.set(9200, 1650, 3300);
      controls.target.set(13200, 1550, 1200);
      banner.textContent = '🍺 2F 반원형 맥주 바(QUẦY LẤY BIA) 내부 시점';
    } else if (preset === 'f2_vip') {
      eyeLevelMode = true;
      document.getElementById('toggle-eye-level').checked = true;
      setCeilingVisibility(true);
      updateFloorMode('2');
      camera.position.set(16900, 1650, 3400);
      controls.target.set(19200, 1550, 1600);
      banner.textContent = '🥂 2F VIP 01·02 프라이빗 룸 내부 시점';
    }
    controls.update();
  });
});

// Toggles & Sliders
document.getElementById('toggle-ceiling').addEventListener('change', (e) => {
  ceilingMeshes.forEach((m) => (m.visible = e.target.checked));
});

document.getElementById('slider-bloom').addEventListener('input', (e) => {
  renderer.toneMappingExposure = parseFloat(e.target.value);
});

document.getElementById('toggle-cad-overlay').addEventListener('change', (e) => {
  cadPlaneMeshes.forEach((m) => (m.visible = e.target.checked));
});

document.getElementById('slider-cad-opacity').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  cadPlaneMeshes.forEach((m) => (m.material.opacity = val));
});

document.getElementById('toggle-xray-walls').addEventListener('change', (e) => {
  const xray = e.target.checked;
  outerWallMeshes.forEach((m) => {
    m.material.transparent = xray;
    m.material.opacity = xray ? 0.25 : 1.0;
    m.material.needsUpdate = true;
  });
});

document.getElementById('slider-wall-height').addEventListener('input', (e) => {
  const scale = parseFloat(e.target.value) / 100.0;
  outerWallMeshes.forEach((m) => (m.scale.y = scale));
  innerWallMeshes.forEach((m) => (m.scale.y = scale));
});

let showLabels = false;
document.getElementById('toggle-labels').addEventListener('change', (e) => {
  showLabels = e.target.checked;
});

document.getElementById('toggle-fixtures').addEventListener('change', (e) => {
  fixtureGroups.forEach((g) => (g.visible = e.target.checked));
});

// Raycasting & Double-click floor teleportation
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const slabMeshes = [];
scene.traverse((obj) => {
  if (obj.userData && obj.userData.isSlab) slabMeshes.push(obj);
});

const markerGeom = new THREE.RingGeometry(160, 220, 32);
markerGeom.rotateX(-Math.PI / 2);
const markerMat = new THREE.MeshBasicMaterial({ color: 0xd97706, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
const targetMarker = new THREE.Mesh(markerGeom, markerMat);
targetMarker.position.set(11500, 15, 2200);
scene.add(targetMarker);

let clickMoveEnabled = true;
let eyeLevelMode = false;

document.getElementById('toggle-click-move').addEventListener('change', (e) => {
  clickMoveEnabled = e.target.checked;
});

document.getElementById('toggle-eye-level').addEventListener('change', (e) => {
  eyeLevelMode = e.target.checked;
  setCeilingVisibility(eyeLevelMode);
  if (eyeLevelMode) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(1, 0, 0);
    forward.normalize();

    const eyeY = controls.target.y > 3000 && activeFloorMode === 'all' ? controls.target.y : 1650;
    camera.position.set(controls.target.x, eyeY, controls.target.z);
    controls.target.copy(camera.position).addScaledVector(forward, 1500);
    controls.update();
    banner.textContent = '1인칭 현장 눈높이 모드 활성화: WASD/방향키 또는 바닥 더블클릭으로 완공된 매장 내부를 걸어보세요';
  } else {
    camera.position.y += 6500;
    camera.position.z += 5500;
    controls.update();
    banner.textContent = '3D 조감 뷰 모드 복귀';
  }
});

window.addEventListener('dblclick', (e) => {
  if (!clickMoveEnabled || e.target !== renderer.domElement) return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const targets = [...slabMeshes, ...cadPlaneMeshes, ...interactiveMeshes];
  const hits = raycaster.intersectObjects(targets, false);
  if (hits.length > 0) {
    const pt = hits[0].point;
    const offset = camera.position.clone().sub(controls.target);

    if (eyeLevelMode) {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      camera.position.set(pt.x, pt.y + 1650, pt.z);
      controls.target.copy(camera.position).addScaledVector(forward, 1500);
    } else {
      controls.target.set(pt.x, pt.y + 500, pt.z);
      camera.position.copy(controls.target).add(offset);
    }

    targetMarker.position.set(pt.x, pt.y + 18, pt.z);
    controls.update();
    banner.textContent = `시점 위치 이동 완료: X=${Math.round(pt.x)}mm, Z=${Math.round(pt.z)}mm`;
  }
});

const keysPressed = {};
window.addEventListener('keydown', (e) => {
  keysPressed[e.code] = true;
});
window.addEventListener('keyup', (e) => {
  keysPressed[e.code] = false;
});

let activePadMove = null;
document.querySelectorAll('.nav-btn').forEach((btn) => {
  const dir = btn.dataset.move;
  if (dir === 'reset') {
    btn.addEventListener('click', () => {
      eyeLevelMode = false;
      document.getElementById('toggle-eye-level').checked = false;
      setCeilingVisibility(false);
      camera.position.set(11000, 15500, 18500);
      controls.target.set(11500, 2200, 2200);
      controls.update();
    });
    return;
  }
  btn.addEventListener('pointerdown', () => (activePadMove = dir));
  btn.addEventListener('pointerup', () => (activePadMove = null));
  btn.addEventListener('pointerleave', () => (activePadMove = null));
});

function applyCameraTranslation() {
  const speed = eyeLevelMode ? 110 : 220;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
  forward.normalize();

  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const moveDelta = new THREE.Vector3();

  if (keysPressed['KeyW'] || keysPressed['ArrowUp'] || activePadMove === 'forward') {
    moveDelta.addScaledVector(forward, speed);
  }
  if (keysPressed['KeyS'] || keysPressed['ArrowDown'] || activePadMove === 'backward') {
    moveDelta.addScaledVector(forward, -speed);
  }
  if (keysPressed['KeyA'] || keysPressed['ArrowLeft'] || activePadMove === 'left') {
    moveDelta.addScaledVector(right, -speed);
  }
  if (keysPressed['KeyD'] || keysPressed['ArrowRight'] || activePadMove === 'right') {
    moveDelta.addScaledVector(right, speed);
  }
  if (keysPressed['KeyQ'] || activePadMove === 'up') {
    moveDelta.y += speed * 0.8;
  }
  if (keysPressed['KeyE'] || activePadMove === 'down') {
    moveDelta.y -= speed * 0.8;
  }

  if (moveDelta.lengthSq() > 0) {
    camera.position.add(moveDelta);
    controls.target.add(moveDelta);
    targetMarker.position.x = controls.target.x;
    targetMarker.position.z = controls.target.z;
  }
}

function animate() {
  requestAnimationFrame(animate);
  applyCameraTranslation();
  controls.update();
  renderer.render(scene, camera);

  htmlLabels.forEach((item) => {
    const fGrp = floorGroups[item.floor];
    if (!showLabels || !fGrp.visible) {
      item.el.style.display = 'none';
      return;
    }
    const worldPos = item.localPos.clone().add(fGrp.position);
    worldPos.project(camera);
    if (worldPos.z > 1) {
      item.el.style.display = 'none';
      return;
    }
    const x = (worldPos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-(worldPos.y * 0.5) + 0.5) * window.innerHeight;
    item.el.style.display = 'block';
    item.el.style.left = `${x}px`;
    item.el.style.top = `${y}px`;
  });
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================================
// MOBILE & FULLSCREEN UI VISIBILITY CONTROLLER
// ============================================================================
const controlPanelEl = document.getElementById('control-panel');
const btnHeaderPanel = document.getElementById('btn-header-panel');
const btnClosePanel = document.getElementById('btn-close-panel');
const drawerBackdrop = document.getElementById('drawer-backdrop');
const floatingToggle = document.getElementById('floating-ui-toggle');
const floatingText = document.getElementById('floating-toggle-text');
const btnHeaderHideUi = document.getElementById('btn-header-hide-ui');

let isUiHidden = false;

function openDrawer() {
  if (controlPanelEl) {
    controlPanelEl.classList.remove('panel-hidden');
    controlPanelEl.classList.add('mobile-open');
  }
  if (drawerBackdrop) drawerBackdrop.classList.add('active');
}

function closeDrawer() {
  if (controlPanelEl) {
    controlPanelEl.classList.remove('mobile-open');
  }
  if (drawerBackdrop) drawerBackdrop.classList.remove('active');
}

function setUiVisibility(hidden) {
  isUiHidden = hidden;
  document.body.classList.toggle('ui-hidden', isUiHidden);
  closeDrawer();
  if (floatingText) {
    floatingText.textContent = isUiHidden ? '메뉴 보기' : 'UI 숨기기';
  }
}

if (floatingToggle) {
  floatingToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setUiVisibility(!isUiHidden);
  });
}

if (btnHeaderHideUi) {
  btnHeaderHideUi.addEventListener('click', (e) => {
    e.stopPropagation();
    setUiVisibility(true);
  });
}

if (btnHeaderPanel) {
  btnHeaderPanel.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!controlPanelEl) return;
    if (window.innerWidth <= 768) {
      if (controlPanelEl.classList.contains('mobile-open')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    } else {
      controlPanelEl.classList.toggle('panel-hidden');
    }
  });
}

if (btnClosePanel) {
  btnClosePanel.addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.innerWidth <= 768) {
      closeDrawer();
    } else if (controlPanelEl) {
      controlPanelEl.classList.add('panel-hidden');
    }
  });
}

if (drawerBackdrop) {
  drawerBackdrop.addEventListener('click', closeDrawer);
}
