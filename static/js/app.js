import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const CAD = window.CAD_DATA;
const container = document.getElementById('canvas-container');
const banner = document.getElementById('selection-banner');

// Scene, Camera, Renderer (Direct hardware MSAA + ACESFilmicToneMapping for crisp, glare-free interior rendering)
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x110c0a);
scene.fog = new THREE.FogExp2(0x110c0a, 0.000012);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 60, 150000);
camera.position.set(11000, 15500, 18500);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;
container.appendChild(renderer.domElement);

// Realistic Image-Based Lighting (IBL) Environment (Gives real ambient reflections to metals, granite, glass & wood)
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
const roomEnv = new RoomEnvironment();
scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(11500, 2200, 2200);
controls.maxDistance = 65000;
controls.minDistance = 200;

const textureLoader = new THREE.TextureLoader();

// ============================================================================
// HIGH-RESOLUTION ARCHITECTURAL PBR TEXTURES (Kumori Handroll Bar Materials)
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

  // Real 1024x1024 High-Res Seamless PBR Textures
  const floorTileTex = loadPbr('./static/textures/floor_dark_terrazzo.jpg', 1, 1);
  const plasterTex = loadPbr('./static/textures/wall_warm_plaster.jpg', 1, 1);
  const timberTex = loadPbr('./static/textures/wood_walnut_grain.jpg', 1, 1);
  const flutedOakTex = loadPbr('./static/textures/wood_fluted_oak.jpg', 1, 1);
  const graniteTex = loadPbr('./static/textures/stone_speckled_granite.jpg', 1, 1);
  const boucleTex = loadPbr('./static/textures/fabric_boucle.jpg', 2, 2);

  // Sheer White Hanging Curtain Fabric Texture (Smooth translucent gradient)
  const fbCanvas = document.createElement('canvas');
  fbCanvas.width = 512;
  fbCanvas.height = 512;
  const fbCtx = fbCanvas.getContext('2d');
  const grad = fbCtx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, 'rgba(255, 240, 230, 0.96)');
  grad.addColorStop(0.4, 'rgba(255, 250, 248, 0.88)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.72)');
  fbCtx.fillStyle = grad;
  fbCtx.fillRect(0, 0, 512, 512);
  const sheerFabricTex = new THREE.CanvasTexture(fbCanvas);
  sheerFabricTex.colorSpace = THREE.SRGBColorSpace;

  // Soft Radial Contact Shadow Texture
  const shCanvas = document.createElement('canvas');
  shCanvas.width = 128;
  shCanvas.height = 128;
  const shCtx = shCanvas.getContext('2d');
  const shGrad = shCtx.createRadialGradient(64, 64, 8, 64, 64, 64);
  shGrad.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
  shGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.18)');
  shGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shCtx.fillStyle = shGrad;
  shCtx.fillRect(0, 0, 128, 128);
  const shadowTex = new THREE.CanvasTexture(shCanvas);

  return { floorTileTex, plasterTex, timberTex, flutedOakTex, graniteTex, boucleTex, sheerFabricTex, shadowTex };
}

const PBR_TEX = loadArchitecturalTextures();

// World-Space Triplanar/Box UV Mapping Helper (Guarantees zero stretching on architectural meshes)
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
      // Horizontal face: XZ plane (floor, ceiling, tops of counters)
      u = px / scaleX;
      v = pz / scaleY;
    } else if (nx >= ny && nx >= nz) {
      // Vertical face facing X: YZ plane
      u = pz / scaleX;
      v = py / scaleY;
    } else {
      // Vertical face facing Z: XY plane
      u = px / scaleX;
      v = py / scaleY;
    }
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

// Cylindrical UV Mapping Helper for Curved Bar Fronts
function applyCylindricalUV(geometry, radius, height, scaleX = 850) {
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
    const v = (py + height) / height;
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

// Physical 3D Vertical Fluted Louver Slat Array (Straight)
function createPhysicalFlutedLouverWall(width, height, slatPitch = 34, slatRadius = 14) {
  const group = new THREE.Group();
  const count = Math.max(1, Math.floor(width / slatPitch));
  const slatGeom = new THREE.CylinderGeometry(slatRadius, slatRadius, height - 12, 12);
  slatGeom.scale(1, 1, 0.45);
  const mesh = new THREE.InstancedMesh(slatGeom, flutedOakMat, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const startX = -width / 2 + slatPitch / 2;
  for (let i = 0; i < count; i++) {
    dummy.position.set(startX + i * slatPitch, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return group;
}

// Physical 3D Vertical Fluted Louver Slat Array (Curved Semi-Circle)
function createCurvedFlutedLouverWall(radius, height, angleStart = 0, angleEnd = Math.PI, pitch = 34, slatRadius = 14) {
  const group = new THREE.Group();
  const arcLength = (angleEnd - angleStart) * radius;
  const count = Math.max(1, Math.floor(arcLength / pitch));
  const slatGeom = new THREE.CylinderGeometry(slatRadius, slatRadius, height - 12, 12);
  slatGeom.scale(1, 1, 0.45);
  const mesh = new THREE.InstancedMesh(slatGeom, flutedOakMat, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const theta = angleStart + (i / count) * (angleEnd - angleStart);
    dummy.position.set(Math.cos(theta) * (radius + 4), 0, Math.sin(theta) * (radius + 4));
    dummy.rotation.y = -theta + Math.PI / 2;
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return group;
}

// Shared Materials for Kumori Soho
const stainlessMat = new THREE.MeshPhysicalMaterial({
  color: 0xd1d5db,
  roughness: 0.22,
  metalness: 0.88,
  clearcoat: 0.25,
});

const darkMetalMat = new THREE.MeshStandardMaterial({
  color: 0x222428,
  roughness: 0.32,
  metalness: 0.75,
});

const flutedOakMat = new THREE.MeshPhysicalMaterial({
  map: PBR_TEX.flutedOakTex,
  bumpMap: PBR_TEX.flutedOakTex,
  bumpScale: 1.8,
  roughness: 0.42,
  metalness: 0.04,
  clearcoat: 0.22,
  clearcoatRoughness: 0.15,
});

const timberCounterMat = new THREE.MeshPhysicalMaterial({
  map: PBR_TEX.timberTex,
  bumpMap: PBR_TEX.timberTex,
  bumpScale: 1.0,
  roughness: 0.32,
  clearcoat: 0.38,
  clearcoatRoughness: 0.2,
});

const speckledGraniteMat = new THREE.MeshPhysicalMaterial({
  map: PBR_TEX.graniteTex,
  bumpMap: PBR_TEX.graniteTex,
  bumpScale: 1.8,
  roughness: 0.22,
  metalness: 0.12,
  clearcoat: 0.38,
});

const whitePorcelainMat = new THREE.MeshPhysicalMaterial({
  color: 0xf8fafc,
  roughness: 0.12,
  clearcoat: 0.85,
});

const dynamicWallGlowMat = new THREE.MeshStandardMaterial({
  color: 0xffd8be,
  emissive: 0xff5500,
  emissiveIntensity: 0.68,
  roughness: 0.35,
  transparent: true,
  opacity: 0.94,
});

const dynamicTopTrackLedMat = new THREE.MeshStandardMaterial({
  color: 0xff9e00,
  emissive: 0xff4800,
  emissiveIntensity: 1.05,
});

const sheerCurtainMat = new THREE.MeshPhysicalMaterial({
  map: PBR_TEX.sheerFabricTex,
  color: 0xfaf6f2,
  emissive: 0xff6b2b,
  emissiveIntensity: 0.16,
  roughness: 0.65,
  transmission: 0.35,
  thickness: 8,
  transparent: true,
  opacity: 0.82,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const underCounterLedMat = new THREE.MeshStandardMaterial({
  color: 0xffea9f,
  emissive: 0xffb703,
  emissiveIntensity: 0.95,
});

// Realistic Material Set for Authentic Props
const amberGlassMat = new THREE.MeshPhysicalMaterial({
  color: 0xb45309,
  roughness: 0.12,
  transmission: 0.78,
  transparent: true,
  opacity: 0.85,
});

const greenGlassMat = new THREE.MeshPhysicalMaterial({
  color: 0x065f46,
  roughness: 0.12,
  transmission: 0.78,
  transparent: true,
  opacity: 0.85,
});

const clearGlassMat = new THREE.MeshPhysicalMaterial({
  color: 0xf8fafc,
  roughness: 0.06,
  transmission: 0.92,
  transparent: true,
  opacity: 0.88,
});

const brassLampMat = new THREE.MeshStandardMaterial({
  color: 0xd97706,
  roughness: 0.28,
  metalness: 0.82,
});

const warmLampGlowMat = new THREE.MeshStandardMaterial({
  color: 0xffedd5,
  emissive: 0xf59e0b,
  emissiveIntensity: 1.45,
});

const mirrorGlassMat = new THREE.MeshStandardMaterial({
  color: 0xdbeafe,
  roughness: 0.05,
  metalness: 0.95,
});

const contactShadowMat = new THREE.MeshBasicMaterial({
  map: PBR_TEX.shadowTex,
  transparent: true,
  opacity: 0.42,
  depthWrite: false,
});

// Balanced Architectural Lighting with Soft Shadows
const ambientLight = new THREE.AmbientLight(0xffe8d6, 0.38);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfffaf0, 0.58);
dirLight.position.set(18000, 28000, 20000);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 4096;
dirLight.shadow.mapSize.height = 4096;
dirLight.shadow.camera.near = 1000;
dirLight.shadow.camera.far = 65000;
const d = 22000;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
dirLight.shadow.bias = -0.0003;
dirLight.shadow.normalBias = 0.035;
dirLight.shadow.radius = 3.2;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xff9e66, 0.25);
fillLight.position.set(-12000, 15000, -14000);
scene.add(fillLight);

// Ground Reference Grid
const gridHelper = new THREE.GridHelper(48000, 48, 0x2b231d, 0x181310);
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
const neonLights = [];

// Helper: Extrude a 2D polygon [[x, z], ...] vertically along +Y by height `h` (NO ugly wireframe lines!)
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
  applyBoxUV(geom, 2200, 2200);

  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Add realistic dark architectural baseboard trim (걸레받이, height 85mm)
  if (addBaseboard) {
    const baseGeom = new THREE.ExtrudeGeometry(shape, {
      depth: 85,
      bevelEnabled: true,
      bevelThickness: 4,
      bevelSize: 4,
      bevelSegments: 1,
    });
    baseGeom.rotateX(-Math.PI / 2);
    applyBoxUV(baseGeom, 1000, 85);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x26221e, roughness: 0.5 });
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
  applyBoxUV(geom, 2200, 2200);

  const mesh = new THREE.Mesh(geom, material);
  mesh.receiveShadow = true;
  return mesh;
}

// Helper: Compute bounding box of a 2D polygon [[x, z], ...]
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
// REALISTIC 3D ARCHITECTURAL FURNITURE & EQUIPMENT BUILDER (No Crude Blocks!)
// ============================================================================
function buildDetailedFixtureModel(fx, fNum) {
  const b = getPolyBounds(fx.poly);
  const group = new THREE.Group();
  group.position.set(b.cx, 0, b.cz);

  const w = b.w;
  const d = b.d;
  const h = fx.h;

  // Skip raw blocks for 1F & 2F bar_top because buildKumoriSignatureDetails builds the exact 2-tier wood + granite + LED counters!
  if (fx.type === 'bar_top' || fx.id === 'f2_beer_bar_inner') {
    return group;
  }

  if (fx.type === 'table') {
    // Realistic Handcrafted Timber Dining Table with Rounded Beveled Edges
    const topGeom = new RoundedBoxGeometry(w, 48, d, 3, 14);
    applyBoxUV(topGeom, 1200, 1200);
    const topMesh = new THREE.Mesh(topGeom, timberCounterMat);
    topMesh.position.y = h - 24;
    topMesh.castShadow = true;
    topMesh.receiveShadow = true;
    group.add(topMesh);

    // Soft contact shadow under the table
    const tableShadow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.08, d * 1.08), contactShadowMat);
    tableShadow.rotation.x = -Math.PI / 2;
    tableShadow.position.y = 2;
    group.add(tableShadow);

    // Table apron & 4 rounded legs
    const legW = 52;
    const legH = h - 48;
    const insetX = Math.max(80, w / 2 - 140);
    const insetZ = Math.max(80, d / 2 - 140);
    [
      [-insetX, -insetZ],
      [insetX, -insetZ],
      [-insetX, insetZ],
      [insetX, insetZ],
    ].forEach(([lx, lz]) => {
      const legGeom = new RoundedBoxGeometry(legW, legH, legW, 2, 8);
      const leg = new THREE.Mesh(legGeom, darkMetalMat);
      leg.position.set(lx, legH / 2, lz);
      leg.castShadow = true;
      group.add(leg);
    });

    // Designer Cordless Rechargeable Mushroom Table Lamp (Ambientec Turn style) in table center
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(26, 32, 45, 16), brassLampMat);
    lampBase.position.set(0, h + 22, 0);
    const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 120, 16), brassLampMat);
    lampStem.position.set(0, h + 80, 0);
    const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(80, 28, 45, 24), brassLampMat);
    lampShade.position.set(0, h + 150, 0);
    const lampGlow = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 6, 24), warmLampGlowMat);
    lampGlow.position.set(0, h + 138, 0);
    group.add(lampBase, lampStem, lampShade, lampGlow);

    // Fine Dining Place Settings: Stoneware ceramic plates, wooden chopstick rests, soy dip dishes, water glasses
    const plateMat = new THREE.MeshPhysicalMaterial({ color: 0xdedbd6, roughness: 0.22, clearcoat: 0.45 });
    const cols = w > 1000 ? 2 : 1;
    for (let c = 0; c < cols; c++) {
      const px = cols === 1 ? 0 : (c === 0 ? -w * 0.25 : w * 0.25);
      [-d * 0.28, d * 0.28].forEach((pz) => {
        // Ceramic dinner plate
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(105, 85, 16, 24), plateMat);
        plate.position.set(px, h + 8, pz);

        // Small ceramic soy dip bowl
        const dip = new THREE.Mesh(new THREE.CylinderGeometry(36, 26, 16, 16), plateMat);
        dip.position.set(px + 90, h + 8, pz + 70);

        // Dark wooden chopstick rest & chopsticks
        const rest = new THREE.Mesh(new THREE.BoxGeometry(45, 10, 16), darkMetalMat);
        rest.position.set(px - 90, h + 5, pz + 40);
        const stick = new THREE.Mesh(new THREE.BoxGeometry(180, 5, 8), timberCounterMat);
        stick.position.set(px - 90, h + 12, pz + 40);
        stick.rotation.y = 0.1;

        // Water tumbler glass
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(34, 28, 88, 16), clearGlassMat);
        glass.position.set(px + 90, h + 44, pz - 45);

        group.add(plate, dip, rest, stick, glass);
      });
    }
  } else if (fx.type === 'sink' || fx.type === 'counter' || fx.type === 'equipment' || fx.type === 'stove') {
    // Detailed Commercial Stainless Steel Kitchen / Bar Unit (Photo 2 & 3!)
    // 1) Recessed dark kickplate (걸레받이)
    const kick = new THREE.Mesh(new THREE.BoxGeometry(w - 40, 90, d - 50), darkMetalMat);
    kick.position.y = 45;
    group.add(kick);

    // 2) Main brushed stainless cabinet body
    const bodyH = h - 130;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w - 10, bodyH, d - 20), stainlessMat);
    body.position.y = 90 + bodyH / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // 3) Stainless steel door panels & vertical handles on front/back
    const numDoors = Math.max(1, Math.round(w / 550));
    const doorW = (w - 30) / numDoors;
    for (let i = 0; i < numDoors; i++) {
      const dx = -w / 2 + 15 + (i + 0.5) * doorW;
      const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(doorW - 12, bodyH - 30, d - 12), stainlessMat);
      doorPanel.position.set(dx, 90 + bodyH / 2, 0);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(14, 140, d + 4), darkMetalMat);
      handle.position.set(dx + doorW * 0.32, 90 + bodyH * 0.65, 0);
      group.add(doorPanel, handle);
    }

    // 4) Thick overhanging stainless worktop (40mm) + rear backsplash lip
    const worktop = new THREE.Mesh(new THREE.BoxGeometry(w, 40, d), stainlessMat);
    worktop.position.y = h - 20;
    worktop.castShadow = true;
    worktop.receiveShadow = true;
    group.add(worktop);

    if (fx.type === 'sink') {
      // Recessed dark basin + curved chrome gooseneck faucet!
      const basin = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w * 0.65, 580), 12, d * 0.58), darkMetalMat);
      basin.position.set(0, h + 2, 0);
      const faucetPipe = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 240, 12), stainlessMat);
      faucetPipe.position.set(0, h + 120, -d * 0.32);
      const faucetSpout = new THREE.Mesh(new THREE.BoxGeometry(24, 24, 160), stainlessMat);
      faucetSpout.position.set(0, h + 230, -d * 0.32 + 70);
      group.add(basin, faucetPipe, faucetSpout);
    } else if (fx.type === 'stove') {
      // Cast-iron burner grates / charcoal grill grates on top
      const numBurners = w > 900 ? 4 : 2;
      for (let k = 0; k < numBurners; k++) {
        const bx = -w * 0.32 + (k / Math.max(1, numBurners - 1)) * (w * 0.64);
        const grate = new THREE.Mesh(new THREE.CylinderGeometry(110, 120, 24, 16), darkMetalMat);
        grate.position.set(bx, h + 12, 0);
        group.add(grate);
      }
    } else if (fx.id === 'f1_pos') {
      // Dual POS Touch Screen Terminal on stand
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(35, 65, 180, 16), darkMetalMat);
      stand.position.set(0, h + 90, 0);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(360, 240, 25), darkMetalMat);
      screen.position.set(0, h + 220, 0);
      screen.rotation.x = -0.35;
      group.add(stand, screen);
    } else if (fx.type === 'counter' || fx.type === 'equipment') {
      // Professional barware props: Chrome cocktail shaker + jigger + stack of artisan prep bowls
      if (w > 1200) {
        const shaker = new THREE.Mesh(new THREE.CylinderGeometry(35, 26, 170, 16), stainlessMat);
        shaker.position.set(-w * 0.28, h + 85, 0);
        const jigger = new THREE.Mesh(new THREE.CylinderGeometry(24, 18, 65, 14), stainlessMat);
        jigger.position.set(-w * 0.28 + 90, h + 32, 0);
        const bowls = new THREE.Mesh(new THREE.CylinderGeometry(65, 45, 65, 16), whitePorcelainMat);
        bowls.position.set(w * 0.28, h + 32, 0);
        group.add(shaker, jigger, bowls);
      }
    }
  } else if (fx.type === 'fridge') {
    // Tall Commercial Glass-Door Chiller / Stainless Refrigerator
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stainlessMat);
    body.position.y = h / 2;
    body.castShadow = true;
    const doorTrim = new THREE.Mesh(new THREE.BoxGeometry(w - 40, h - 120, d + 12), darkMetalMat);
    doorTrim.position.y = h / 2;
    group.add(body, doorTrim);
  } else if (fx.type === 'dj') {
    // Custom Kumori Timber & Granite DJ Console with 2 Technics Turntables + Rotary Mixer + Laptop
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h - 80, d), timberCounterMat);
    base.position.y = (h - 80) / 2;
    base.castShadow = true;
    const stoneTop = new THREE.Mesh(new THREE.BoxGeometry(w + 20, 80, d + 20), speckledGraniteMat);
    stoneTop.position.y = h - 40;
    group.add(base, stoneTop);

    // 2 Turntables + Center Mixer
    [-165, 165].forEach((tx) => {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(240, 32, 320), darkMetalMat);
      deck.position.set(tx, h + 16, 0);
      const platter = new THREE.Mesh(new THREE.CylinderGeometry(95, 95, 12, 24), stainlessMat);
      platter.position.set(tx, h + 36, 0);
      const record = new THREE.Mesh(new THREE.CylinderGeometry(88, 88, 6, 24), darkMetalMat);
      record.position.set(tx, h + 42, 0);
      group.add(deck, platter, record);
    });
    const mixer = new THREE.Mesh(new THREE.BoxGeometry(160, 36, 320), darkMetalMat);
    mixer.position.set(0, h + 18, 0);
    group.add(mixer);
  } else if (fx.type === 'shelf') {
    if (fx.id === 'f2_backgrounds') {
      // Planter trough + tropical indoor trees (Photo Backdrop Zone)
      const trough = new THREE.Mesh(new THREE.BoxGeometry(w, 550, d * 0.55), timberCounterMat);
      trough.position.y = 275;
      trough.castShadow = true;
      group.add(trough);

      const foliageMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.65 });
      for (let px = -w * 0.35; px <= w * 0.35; px += 420) {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(28, 42, 1150, 12), timberCounterMat);
        stem.position.set(px, 850, 0);
        const leaves = new THREE.Mesh(new THREE.DodecahedronGeometry(340, 1), foliageMat);
        leaves.position.set(px, 1550, 0);
        leaves.castShadow = true;
        group.add(stem, leaves);
      }
    } else {
      // Open Architectural Timber & Dark Steel Multi-Tier Display Rack (KỆ TRƯNG BÀY / TỦ DECOR)
      const postW = 36;
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
      const bottleMats = [amberGlassMat, greenGlassMat, clearGlassMat];
      for (let t = 0; t < tiers; t++) {
        const sy = 180 + (t / (tiers - 1)) * (h - 260);
        const board = new THREE.Mesh(new THREE.BoxGeometry(w - 20, 32, d - 20), timberCounterMat);
        board.position.y = sy;
        board.castShadow = true;
        board.receiveShadow = true;
        group.add(board);

        // Warm LED strip on shelf underside
        const shelfLed = new THREE.Mesh(new THREE.BoxGeometry(w - 28, 8, 14), underCounterLedMat);
        shelfLed.position.set(0, sy - 18, 0);
        group.add(shelfLed);

        // Illuminated Liquor & Wine Bottles on each tier!
        if (t < tiers - 1 && w > 600) {
          const numBottles = Math.min(8, Math.floor((w - 80) / 110));
          for (let bi = 0; bi < numBottles; bi++) {
            const bx = -w / 2 + 50 + (bi + 0.5) * ((w - 100) / numBottles);
            const bMat = bottleMats[(t + bi) % bottleMats.length];
            const bottleBody = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 120, 12), bMat);
            bottleBody.position.set(bx, sy + 76, 0);
            const bottleNeck = new THREE.Mesh(new THREE.CylinderGeometry(8, 12, 45, 10), bMat);
            bottleNeck.position.set(bx, sy + 150, 0);
            group.add(bottleBody, bottleNeck);
          }
        }
      }
    }
  } else if (fx.type === 'photobooth') {
    // Open Arch / Frame Photobooth Studio Cabin (not a solid block!)
    const frameThick = 65;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w, frameThick, d), timberCounterMat);
    roof.position.y = h - frameThick / 2;
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, frameThick), timberCounterMat);
    backWall.position.set(0, h / 2, -d / 2 + frameThick / 2);
    const leftSide = new THREE.Mesh(new THREE.BoxGeometry(frameThick, h, d), timberCounterMat);
    leftSide.position.set(-w / 2 + frameThick / 2, h / 2, 0);
    // Glowing softbox light panel & camera kiosk inside photobooth
    const ringLight = new THREE.Mesh(new THREE.TorusGeometry(220, 24, 16, 32), underCounterLedMat);
    ringLight.position.set(0, 1450, -d / 2 + 120);
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(180, 180, 460, 24), darkMetalMat);
    stool.position.set(0, 230, 180);
    group.add(roof, backWall, leftSide, ringLight, stool);
  } else if (fx.type === 'wc') {
    // Floating Stone Vanity Counter + Porcelain Vessel Basin + Backlit Capsule Vanity Mirror + Soap Dispenser
    const vanity = new THREE.Mesh(new RoundedBoxGeometry(w, 160, d, 2, 8), speckledGraniteMat);
    vanity.position.y = h - 80;
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(190, 150, 130, 24), whitePorcelainMat);
    basin.position.y = h + 65;
    const faucet = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 160, 12), stainlessMat);
    faucet.position.set(0, h + 110, -140);

    // Chrome liquid soap dispenser bottle
    const soapDispenser = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 85, 12), stainlessMat);
    soapDispenser.position.set(220, h + 42, -120);

    // Backlit pill / capsule illuminated mirror
    const mirrorW = Math.min(w * 0.72, 600);
    const mirrorH = 750;
    const mirror = new THREE.Mesh(new RoundedBoxGeometry(mirrorW, mirrorH, 12, 2, 8), mirrorGlassMat);
    mirror.position.set(0, h + 480, -d / 2 + 10);
    const mirrorBackGlow = new THREE.Mesh(new RoundedBoxGeometry(mirrorW + 24, mirrorH + 24, 4, 2, 8), warmLampGlowMat);
    mirrorBackGlow.position.set(0, h + 480, -d / 2 + 4);

    group.add(vanity, basin, faucet, soapDispenser, mirror, mirrorBackGlow);
  }

  return group;
}

// Helper: Build Architectural Door Frame + Open Wooden Door Leaf + Porcelain Toilets
function buildArchitecturalDoorsAndToilets(fNum) {
  const g = new THREE.Group();
  const doorWoodMat = new THREE.MeshPhysicalMaterial({
    map: PBR_TEX.timberTex,
    color: 0x6b341a,
    roughness: 0.35,
    clearcoat: 0.25,
  });

  // Helper to add a modern porcelain toilet at [x, z]
  function addToilet(x, z, rotY = 0) {
    const tg = new THREE.Group();
    const tShadow = new THREE.Mesh(new THREE.PlaneGeometry(420, 520), contactShadowMat);
    tShadow.rotation.x = -Math.PI / 2;
    tShadow.position.set(0, 2, 40);
    tg.add(tShadow);

    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(190, 145, 410, 20), whitePorcelainMat);
    bowl.position.set(0, 205, 80);
    const tank = new THREE.Mesh(new RoundedBoxGeometry(360, 420, 170, 2, 12), whitePorcelainMat);
    tank.position.set(0, 610, -120);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(192, 192, 24, 20), whitePorcelainMat);
    lid.position.set(0, 420, 80);
    // Contact shadow under toilet
    const toiletShadow = new THREE.Mesh(new THREE.PlaneGeometry(550, 650), contactShadowMat);
    toiletShadow.rotation.x = -Math.PI / 2;
    toiletShadow.position.set(0, 2, 20);
    tg.add(bowl, tank, lid, toiletShadow);
    tg.position.set(x, 0, z);
    tg.rotation.y = rotY;
    g.add(tg);
  }

  // Helper to add an architectural door frame (jambs + lintel) + open wooden door leaf + handle
  function addDoor(x, z, width, rotY = 0) {
    const dg = new THREE.Group();
    const frameThick = 45;
    const doorH = 2150;

    // Dark bronze / black door frame jambs and lintel (문틀)
    const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(frameThick, doorH, 120), darkMetalMat);
    leftJamb.position.set(-frameThick / 2, doorH / 2, 0);
    const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(frameThick, doorH, 120), darkMetalMat);
    rightJamb.position.set(width + frameThick / 2, doorH / 2, 0);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(width + frameThick * 2, frameThick, 120), darkMetalMat);
    lintel.position.set(width / 2, doorH + frameThick / 2, 0);
    dg.add(leftJamb, rightJamb, lintel);

    // Open wooden door leaf
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
    // 1F WC NAM & WC NỮ Porcelain Toilets (matching CAD coordinates)
    addToilet(1720, 920, 0);   // WC NAM toilet
    addToilet(3920, 920, 0);   // WC NỮ toilet
    // Doors for WC NAM, WC NỮ, Dishwashing Room
    addDoor(2050, 2650, 750, -0.9);
    addDoor(3050, 2750, 750, -0.8);
    addDoor(5380, 2820, 750, -1.2);
  } else if (fNum === 2) {
    // 2F WC NAM/NỮ Toilet
    addToilet(-1650, 520, 0);
    addDoor(-1150, 2380, 750, -0.8);
    // VIP 02 and VIP 01 Glass/Bronze Doors
    addDoor(17550, 3050, 850, -1.1);
    addDoor(20300, 4200, 850, 0.8);
  } else if (fNum === 3) {
    // 3F WC HIỆN TRẠNG Toilet
    addToilet(2280, 950, Math.PI / 2);
  }

  return g;
}

// Smooth Continuous Sine-Wave Draped Cloth Mesh (Sheer White Hanging Curtain Veil)
function createSmoothClothVeilMesh(xStart, xEnd, zBase, topY, bottomY) {
  const group = new THREE.Group();
  const width = xEnd - xStart;
  const height = topY - bottomY;
  const geom = new THREE.PlaneGeometry(width, height, 140, 24);
  const pos = geom.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const v = pos.getY(i);
    const foldAmp = 28 + ((height / 2 - v) / height) * 22;
    const zOffset = Math.sin(u * 0.012) * foldAmp + Math.cos(u * 0.027) * 12;
    pos.setZ(i, zOffset);
  }
  geom.computeVertexNormals();

  const clothMesh = new THREE.Mesh(geom, sheerCurtainMat);
  clothMesh.position.set((xStart + xEnd) / 2, bottomY + height / 2, zBase);
  group.add(clothMesh);

  const whiteFrameMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
  const trackBar = new THREE.Mesh(new THREE.BoxGeometry(width, 36, 36), whiteFrameMat);
  trackBar.position.set((xStart + xEnd) / 2, topY - 18, zBase);
  const topLed = new THREE.Mesh(new THREE.BoxGeometry(width, 20, 24), dynamicTopTrackLedMat);
  topLed.position.set((xStart + xEnd) / 2, topY - 40, zBase + 14);
  group.add(trackBar, topLed);

  return group;
}

function buildStaircase(totalRise, isFloor3 = false) {
  const stairGroup = new THREE.Group();
  const stepMat = new THREE.MeshPhysicalMaterial({
    map: PBR_TEX.timberTex,
    color: 0x9c5230,
    roughness: 0.38,
    clearcoat: 0.25,
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

// Exact Kumori Soho Stool (Plump oatmeal bouclé crowned cushion + rounded timber block leg + brushed steel backrest plate + AO shadow)
function createKumoriStool(x, z, facingAngle = 0) {
  const g = new THREE.Group();

  // Contact AO shadow directly under stool
  const stoolShadow = new THREE.Mesh(new THREE.PlaneGeometry(380, 380), contactShadowMat);
  stoolShadow.rotation.x = -Math.PI / 2;
  stoolShadow.position.y = 2;
  g.add(stoolShadow);

  const woodLegMat = new THREE.MeshPhysicalMaterial({
    map: PBR_TEX.timberTex,
    color: 0x7c3f23,
    roughness: 0.36,
    clearcoat: 0.25,
  });
  const legGeom = new RoundedBoxGeometry(230, 520, 230, 3, 16);
  applyBoxUV(legGeom, 500, 520);
  const leg = new THREE.Mesh(legGeom, woodLegMat);
  leg.position.y = 260;
  leg.castShadow = true;

  const cushionMat = new THREE.MeshStandardMaterial({
    map: PBR_TEX.boucleTex,
    bumpMap: PBR_TEX.boucleTex,
    bumpScale: 3.5,
    color: 0xd6d1c7,
    roughness: 0.92,
    metalness: 0.02,
  });

  // Plump tailored bouclé cushion (Cylinder body + crowned soft dome cap + piping welt)
  const cushionGroup = new THREE.Group();
  const mainCushion = new THREE.Mesh(new THREE.CylinderGeometry(215, 215, 155, 32), cushionMat);
  mainCushion.position.y = 598;
  mainCushion.castShadow = true;

  const crown = new THREE.Mesh(new THREE.SphereGeometry(215, 32, 16, 0, Math.PI * 2, 0, Math.PI / 3), cushionMat);
  crown.scale.set(1, 0.26, 1);
  crown.position.y = 675;
  crown.castShadow = true;

  const welt = new THREE.Mesh(new THREE.TorusGeometry(215, 6, 12, 36), cushionMat);
  welt.rotation.x = Math.PI / 2;
  welt.position.y = 675;
  cushionGroup.add(mainCushion, crown, welt);

  const steelPlateMat = new THREE.MeshPhysicalMaterial({
    color: 0xd1d5db,
    metalness: 0.92,
    roughness: 0.16,
    clearcoat: 0.35,
  });
  const backPlateGeom = new RoundedBoxGeometry(250, 420, 10, 3, 12);
  const backPlate = new THREE.Mesh(backPlateGeom, steelPlateMat);
  backPlate.position.set(0, 720, 218);
  backPlate.castShadow = true;

  const bracketGeom = new RoundedBoxGeometry(250, 12, 90, 2, 6);
  const bracket = new THREE.Mesh(bracketGeom, steelPlateMat);
  bracket.position.set(0, 515, 178);

  g.add(leg, cushionGroup, backPlate, bracket);
  g.position.set(x, 0, z);
  g.rotation.y = facingAngle;
  return g;
}

// Build Exact Kumori Soho Signature Details (1F & 2F)
function buildKumoriSignatureDetails(fNum, floorHeight) {
  const kGroup = new THREE.Group();

  const whiteFrameMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.45,
    metalness: 0.2,
  });

  const speakerBoxMat = new THREE.MeshStandardMaterial({
    color: 0xbec5cc,
    roughness: 0.32,
    metalness: 0.35,
  });

  const speakerDriverMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.3,
    metalness: 0.4,
  });

  const woodHornMat = new THREE.MeshPhysicalMaterial({
    map: PBR_TEX.timberTex,
    color: 0x9c4a1a,
    roughness: 0.28,
    clearcoat: 0.35,
  });

  const menuPaperMat = new THREE.MeshBasicMaterial({ color: 0xfafaf9 });
  const plateCeramicMat = new THREE.MeshPhysicalMaterial({ color: 0xd6d3d1, roughness: 0.15, clearcoat: 0.6 });

  function createKumoriWallSpeaker(x, y, z) {
    const spkGroup = new THREE.Group();
    const box = new THREE.Mesh(new RoundedBoxGeometry(520, 380, 320, 2, 12), speakerBoxMat);
    box.rotation.x = 0.16;
    const woofer = new THREE.Mesh(new THREE.CylinderGeometry(115, 115, 20, 24), speakerDriverMat);
    woofer.rotation.x = Math.PI / 2 + 0.16;
    woofer.position.set(-40, 0, 158);
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(135, 38, 180, 24), woodHornMat);
    horn.rotation.x = Math.PI / 2 + 0.12;
    horn.position.set(-20, -290, 90);
    const wire1 = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 950, 6), stainlessMat);
    wire1.position.set(-200, 480, 0);
    const wire2 = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 950, 6), stainlessMat);
    wire2.position.set(200, 480, 0);

    spkGroup.add(box, woofer, horn, wire1, wire2);
    spkGroup.position.set(x, y, z);
    return spkGroup;
  }

  if (fNum === 1) {
    // 1) Smooth Continuous Sine-Wave Sheer White Hanging Curtain Veil over 1F Bar
    const mainVeil = createSmoothClothVeilMesh(9150, 18100, 2720, floorHeight - 60, 1920);
    kGroup.add(mainVeil);

    // 2) Color-Changing Translucent Back Wall Panels with vertical mullions
    const wallPanel = new THREE.Mesh(new THREE.BoxGeometry(9250, 1650, 35), dynamicWallGlowMat);
    wallPanel.position.set(13600, 2380, 560);
    kGroup.add(wallPanel);

    for (let mx = 9100; mx <= 18100; mx += 1125) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(38, 1680, 55), whiteFrameMat);
      mullion.position.set(mx, 2380, 570);
      kGroup.add(mullion);
    }
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(9250, 45, 60), whiteFrameMat);
    topRail.position.set(13600, 3200, 570);
    const midRail = new THREE.Mesh(new THREE.BoxGeometry(9250, 35, 70), dynamicTopTrackLedMat);
    midRail.position.set(13600, 1540, 575);
    kGroup.add(topRail, midRail);

    // 3) Vinyl Record Album Sleeves along back kitchen wall shelf
    const backShelf = new THREE.Mesh(new THREE.BoxGeometry(9200, 25, 220), whiteFrameMat);
    backShelf.position.set(13600, 1280, 640);
    kGroup.add(backShelf);

    const vinylPalette = [0xf97316, 0x38bdf8, 0xfacc15, 0xec4899, 0x22c55e, 0xe11d48, 0xa855f7, 0xf8fafc];
    let vCount = 0;
    for (let vx = 9500; vx <= 17700; vx += 620) {
      const vMat = new THREE.MeshStandardMaterial({
        color: vinylPalette[vCount % vinylPalette.length],
        roughness: 0.35,
      });
      const album = new THREE.Mesh(new RoundedBoxGeometry(310, 310, 18, 2, 4), vMat);
      album.position.set(vx, 1445, 610);
      album.rotation.x = -0.12;
      kGroup.add(album);
      vCount++;
    }

    // 4) Wall-Mounted Grey Box Speakers with Wooden Horn Underneath
    kGroup.add(createKumoriWallSpeaker(10800, 2180, 740));
    kGroup.add(createKumoriWallSpeaker(16200, 2180, 740));

    // 5) Two-Tier Handroll Bar Counter (Fluted oak vertical apron + Walnut dining surface + Granite ledge + Hidden LED)
    // Contact AO Shadows along bar base
    const barShadowL = new THREE.Mesh(new THREE.PlaneGeometry(5300, 560), contactShadowMat);
    barShadowL.rotation.x = -Math.PI / 2;
    barShadowL.position.set(11770, 2, 2850);
    const barShadowR = new THREE.Mesh(new THREE.PlaneGeometry(2890, 560), contactShadowMat);
    barShadowR.rotation.x = -Math.PI / 2;
    barShadowR.position.set(16705, 2, 2850);
    kGroup.add(barShadowL, barShadowR);

    const woodBaseL = new THREE.Mesh(new THREE.BoxGeometry(5160, 880, 420), flutedOakMat);
    applyBoxUV(woodBaseL.geometry, 850, 880);
    woodBaseL.position.set(11770, 440, 2850);
    woodBaseL.castShadow = true;

    // Physical 3D Louver Slats along front of left bar
    const louverL = createPhysicalFlutedLouverWall(5160, 880);
    louverL.position.set(11770, 440, 2850 + 210 + 6);
    kGroup.add(louverL);

    const woodTopL = new THREE.Mesh(new RoundedBoxGeometry(5220, 65, 540, 3, 16), timberCounterMat);
    applyBoxUV(woodTopL.geometry, 1500, 540);
    woodTopL.position.set(11770, 912, 2910);
    woodTopL.castShadow = true;
    const graniteRiserL = new THREE.Mesh(new RoundedBoxGeometry(5220, 155, 260, 3, 10), speckledGraniteMat);
    applyBoxUV(graniteRiserL.geometry, 1200, 260);
    graniteRiserL.position.set(11770, 1022, 2710);
    graniteRiserL.castShadow = true;
    const underLedL = new THREE.Mesh(new THREE.BoxGeometry(5180, 24, 30), underCounterLedMat);
    underLedL.position.set(11770, 952, 2845);
    kGroup.add(woodBaseL, woodTopL, graniteRiserL, underLedL);

    // 5-B) Refrigerated Glass Sushi Showcase (스시 네타 쇼케이스) on Granite Bar Riser
    const sushiCaseW = 2100;
    const caseBase = new THREE.Mesh(new THREE.BoxGeometry(sushiCaseW, 25, 220), stainlessMat);
    caseBase.position.set(12800, 1112, 2710);
    const caseGlass = new THREE.Mesh(new THREE.BoxGeometry(sushiCaseW - 10, 130, 210), clearGlassMat);
    caseGlass.position.set(12800, 1180, 2710);
    const caseBamboo = new THREE.Mesh(new THREE.BoxGeometry(sushiCaseW - 30, 6, 190), timberCounterMat);
    caseBamboo.position.set(12800, 1128, 2710);
    const caseLed = new THREE.Mesh(new THREE.BoxGeometry(sushiCaseW - 20, 6, 10), warmLampGlowMat);
    caseLed.position.set(12800, 1240, 2700);

    // Fresh Sashimi Ingredients inside showcase (Salmon, Maguro Tuna, Whitefish)
    const salmonMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.35 });
    const tunaMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.35 });
    const whiteFishMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });
    const sashimiBlocks = [salmonMat, tunaMat, whiteFishMat, salmonMat, tunaMat];
    sashimiBlocks.forEach((sMat, sIdx) => {
      const sMesh = new THREE.Mesh(new THREE.BoxGeometry(150, 32, 70), sMat);
      sMesh.position.set(12000 + sIdx * 380, 1146, 2710);
      kGroup.add(sMesh);
    });
    kGroup.add(caseBase, caseGlass, caseBamboo, caseLed);

    const woodBaseR = new THREE.Mesh(new THREE.BoxGeometry(2750, 880, 420), flutedOakMat);
    applyBoxUV(woodBaseR.geometry, 850, 880);
    woodBaseR.position.set(16705, 440, 2850);
    woodBaseR.castShadow = true;

    // Physical 3D Louver Slats along front of right bar
    const louverR = createPhysicalFlutedLouverWall(2750, 880);
    louverR.position.set(16705, 440, 2850 + 210 + 6);
    kGroup.add(louverR);

    const woodTopR = new THREE.Mesh(new RoundedBoxGeometry(2820, 65, 540, 3, 16), timberCounterMat);
    applyBoxUV(woodTopR.geometry, 1500, 540);
    woodTopR.position.set(16705, 912, 2910);
    woodTopR.castShadow = true;
    const graniteRiserR = new THREE.Mesh(new RoundedBoxGeometry(2820, 155, 260, 3, 10), speckledGraniteMat);
    applyBoxUV(graniteRiserR.geometry, 1200, 260);
    graniteRiserR.position.set(16705, 1022, 2710);
    graniteRiserR.castShadow = true;
    const underLedR = new THREE.Mesh(new THREE.BoxGeometry(2780, 24, 30), underCounterLedMat);
    underLedR.position.set(16705, 952, 2845);
    kGroup.add(woodBaseR, woodTopR, graniteRiserR, underLedR);

    const woodBaseSide = new THREE.Mesh(new THREE.BoxGeometry(380, 880, 2360), flutedOakMat);
    applyBoxUV(woodBaseSide.geometry, 850, 880);
    woodBaseSide.position.set(17880, 440, 1730);

    // Physical 3D Louver Slats along side counter
    const louverSide = createPhysicalFlutedLouverWall(2360, 880);
    louverSide.rotation.y = Math.PI / 2;
    louverSide.position.set(17880 + 190 + 6, 440, 1730);
    kGroup.add(louverSide);

    const woodTopSide = new THREE.Mesh(new RoundedBoxGeometry(480, 65, 2420, 3, 16), timberCounterMat);
    applyBoxUV(woodTopSide.geometry, 480, 1500);
    woodTopSide.position.set(17950, 912, 1730);
    const graniteSide = new THREE.Mesh(new RoundedBoxGeometry(240, 155, 2420, 3, 10), speckledGraniteMat);
    applyBoxUV(graniteSide.geometry, 240, 1200);
    graniteSide.position.set(17810, 1022, 1730);
    const underLedSide = new THREE.Mesh(new THREE.BoxGeometry(30, 24, 2380), underCounterLedMat);
    underLedSide.position.set(17935, 952, 1730);
    kGroup.add(woodBaseSide, woodTopSide, graniteSide, underLedSide);

    // 5-C) Professional Barware on Counter: Cocktail shaker, jigger, water carafes
    const barShaker = new THREE.Mesh(new THREE.CylinderGeometry(36, 28, 175, 16), stainlessMat);
    barShaker.position.set(17880, 1000, 2200);
    const barJigger = new THREE.Mesh(new THREE.CylinderGeometry(24, 18, 65, 14), stainlessMat);
    barJigger.position.set(17880, 945, 2320);
    kGroup.add(barShaker, barJigger);

    // 6) Place Settings (KUMORI menus, ceramic plates, chopsticks, water glasses)
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.85, roughness: 0.05, transparent: true });
    const settingXs = [9590, 10300, 11015, 11710, 12445, 13155, 13920, 15770, 16390, 17055, 17720];
    settingXs.forEach((sx) => {
      const menu = new THREE.Mesh(new THREE.BoxGeometry(280, 3, 200), menuPaperMat);
      menu.position.set(sx, 947, 3010);
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(95, 75, 18, 24), plateCeramicMat);
      plate.position.set(sx, 955, 2920);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(36, 32, 95, 16), glassMat);
      cup.position.set(sx + 135, 992, 2890);
      const stick = new THREE.Mesh(new THREE.BoxGeometry(170, 5, 8), darkMetalMat);
      stick.position.set(sx - 130, 950, 2920);
      kGroup.add(menu, plate, cup, stick);
    });

    // 7) White Exposed Ceiling Cable Trays
    const tray1 = new THREE.Mesh(new THREE.BoxGeometry(14500, 55, 320), whiteFrameMat);
    tray1.position.set(15500, floorHeight - 220, 1550);
    const tray2 = new THREE.Mesh(new THREE.BoxGeometry(14500, 55, 260), whiteFrameMat);
    tray2.position.set(15500, floorHeight - 220, 3350);
    kGroup.add(tray1, tray2);
  } else if (fNum === 2) {
    // 1) Detailed Semi-Circular 2-Tier Craft Beer Bar Counter (QUẦY LẤY BIA: center = [12850, 800], outer R = 1820, inner R = 1050)
    // Contact AO Shadow under 2F circular bar
    const circleBarShadow = new THREE.Mesh(new THREE.RingGeometry(1000, 1920, 36, 1, 0, Math.PI), contactShadowMat);
    circleBarShadow.rotation.x = -Math.PI / 2;
    circleBarShadow.position.set(12850, 2, 520);
    kGroup.add(circleBarShadow);

    const arcShape = new THREE.Shape();
    arcShape.absarc(0, 0, 1840, 0, Math.PI, false);
    arcShape.absarc(0, 0, 1120, Math.PI, 0, true);
    arcShape.closePath();

    // Wooden base drum with vertical fluted oak slats + overhanging wooden dining counter
    const baseExtrude = new THREE.ExtrudeGeometry(arcShape, { depth: 880, bevelEnabled: false });
    baseExtrude.rotateX(Math.PI / 2);
    applyCylindricalUV(baseExtrude, 1840, 880, 850);
    const barWoodBase = new THREE.Mesh(baseExtrude, flutedOakMat);
    barWoodBase.position.set(12850, 880, 520);
    barWoodBase.castShadow = true;

    // Physical 3D Louvers along 2F semi-circular curve
    const curvedLouvers = createCurvedFlutedLouverWall(1840, 880);
    curvedLouvers.position.set(12850, 440, 520);
    kGroup.add(curvedLouvers);

    const topShape = new THREE.Shape();
    topShape.absarc(0, 0, 1920, 0, Math.PI, false);
    topShape.absarc(0, 0, 1080, Math.PI, 0, true);
    topShape.closePath();
    const topExtrude = new THREE.ExtrudeGeometry(topShape, { depth: 65, bevelEnabled: false });
    topExtrude.rotateX(Math.PI / 2);
    applyBoxUV(topExtrude, 1400, 1400);
    const barWoodTop = new THREE.Mesh(topExtrude, timberCounterMat);
    barWoodTop.position.set(12850, 945, 520);
    barWoodTop.castShadow = true;

    // Raised Speckled Grey Granite inner arc ledge
    const granShape = new THREE.Shape();
    granShape.absarc(0, 0, 1520, 0, Math.PI, false);
    granShape.absarc(0, 0, 1080, Math.PI, 0, true);
    granShape.closePath();
    const granExtrude = new THREE.ExtrudeGeometry(granShape, { depth: 155, bevelEnabled: false });
    granExtrude.rotateX(Math.PI / 2);
    applyBoxUV(granExtrude, 1200, 1200);
    const barGraniteTop = new THREE.Mesh(granExtrude, speckledGraniteMat);
    barGraniteTop.position.set(12850, 1100, 520);
    barGraniteTop.castShadow = true;

    // Central Draft Beer Tap Bridge (6 Chrome Taps) with Rounded Chamfers
    const tapBridge = new THREE.Mesh(new RoundedBoxGeometry(950, 420, 120, 3, 14), stainlessMat);
    tapBridge.position.set(12850, 1150, 1050);
    kGroup.add(barWoodBase, barWoodTop, barGraniteTop, tapBridge);

    // 2) Smooth Continuous Curved Sheer White Curtain Cylinder over 2F Circular Bar
    const radius = 1760;
    const hVeil = 1150;
    const cylGeom = new THREE.CylinderGeometry(radius, radius, hVeil, 96, 16, true, 0, Math.PI);
    const cPos = cylGeom.attributes.position;
    for (let i = 0; i < cPos.count; i++) {
      const x = cPos.getX(i);
      const z = cPos.getZ(i);
      const ang = Math.atan2(z, x);
      const rWave = radius + Math.sin(ang * 28) * 24;
      cPos.setX(i, Math.cos(ang) * rWave);
      cPos.setZ(i, Math.sin(ang) * rWave);
    }
    cylGeom.computeVertexNormals();
    const curvedVeil = new THREE.Mesh(cylGeom, sheerCurtainMat);
    curvedVeil.rotation.y = -Math.PI / 2;
    curvedVeil.position.set(12850, floorHeight - 60 - hVeil / 2, 520);
    kGroup.add(curvedVeil);

    const topArcLed = new THREE.Mesh(new THREE.TorusGeometry(radius, 22, 12, 48, Math.PI), dynamicTopTrackLedMat);
    topArcLed.rotation.x = Math.PI / 2;
    topArcLed.position.set(12850, floorHeight - 85, 520);
    kGroup.add(topArcLed);

    const barArcLed = new THREE.Mesh(new THREE.TorusGeometry(1535, 20, 12, 48, Math.PI), underCounterLedMat);
    barArcLed.rotation.x = Math.PI / 2;
    barArcLed.position.set(12850, 955, 520);
    kGroup.add(barArcLed);

    const beerBackWall = new THREE.Mesh(new THREE.BoxGeometry(4200, 1450, 35), dynamicWallGlowMat);
    beerBackWall.position.set(12850, 2100, 500);
    const vip2Wall = new THREE.Mesh(new THREE.BoxGeometry(2800, 1450, 35), dynamicWallGlowMat);
    vip2Wall.position.set(18200, 2100, 500);
    const vip1Wall = new THREE.Mesh(new THREE.BoxGeometry(2800, 1450, 35), dynamicWallGlowMat);
    vip1Wall.position.set(21900, 2100, 500);
    const exhibWall = new THREE.Mesh(new THREE.BoxGeometry(3900, 1450, 35), dynamicWallGlowMat);
    exhibWall.position.set(6400, 2100, 4120);
    kGroup.add(beerBackWall, vip2Wall, vip1Wall, exhibWall);

    kGroup.add(createSmoothClothVeilMesh(17100, 19400, 1730, floorHeight - 60, 2050));
    kGroup.add(createSmoothClothVeilMesh(20800, 23100, 2210, floorHeight - 60, 2050));

    kGroup.add(createKumoriWallSpeaker(10600, 2100, 680));
    kGroup.add(createKumoriWallSpeaker(15100, 2100, 680));
  }

  return kGroup;
}

// Build All Floors from CAD_DATA
function buildModel() {
  Object.keys(CAD).forEach((floorKey) => {
    const fNum = parseInt(floorKey, 10);
    const fData = CAD[floorKey];
    const fGroup = new THREE.Group();
    fGroup.position.y = fData.elevation;
    fGroup.userData = { floor: fNum, baseElevation: fData.elevation };
    scene.add(fGroup);
    floorGroups[fNum] = fGroup;

    // 1. Structural Slab with Dark Charcoal Matte Tile Texture
    const slabMat = new THREE.MeshStandardMaterial({
      map: PBR_TEX.floorTileTex,
      color: 0x999490,
      roughness: 0.72,
      metalness: 0.06,
    });
    const slabMesh = createSlabMesh(fData.slab_polygon, fData.slab_hole, 150, slabMat);
    slabMesh.position.y = -150;
    slabMesh.userData = { isSlab: true, floor: fNum };
    fGroup.add(slabMesh);

    // 1-B. White Exposed Interior Ceiling Slab
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0xd6d3d0,
      roughness: 0.82,
      side: THREE.DoubleSide,
    });
    const ceilingMesh = createSlabMesh(fData.slab_polygon, fData.slab_hole, 60, ceilingMat);
    ceilingMesh.position.y = fData.height - 60;
    ceilingMesh.visible = false;
    fGroup.add(ceilingMesh);
    ceilingMeshes.push(ceilingMesh);

    // 2. CAD Floor Plan Image Overlay (Hidden by default so finished dark tile floor looks clean!)
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
    cadPlane.visible = false; // Default OFF for clean completed interior look
    fGroup.add(cadPlane);
    cadPlaneMeshes.push(cadPlane);

    // 3. Outer Structural Walls (Warm tactile lime plaster + dark baseboard trim)
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
            map: PBR_TEX.plasterTex,
            bumpMap: PBR_TEX.plasterTex,
            bumpScale: 1.2,
            color: 0xc8beb3,
            roughness: 0.85,
            metalness: 0.02,
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

    // 4. Inner Partition Walls (Matte tactile plaster & framed fluted glass VIP partitions)
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
            map: PBR_TEX.plasterTex,
            bumpMap: PBR_TEX.plasterTex,
            bumpScale: 1.0,
            color: 0xd0c6bc,
            roughness: 0.82,
            metalness: 0.02,
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

    // 4-B. Architectural Ceiling Track Lighting with Directional Spotlight Cans
    const trackRail = new THREE.Mesh(new THREE.BoxGeometry(15000, 24, 30), darkMetalMat);
    trackRail.position.set(13500, fData.height - 140, 2350);
    fGroup.add(trackRail);
    for (let tx = 8000; tx <= 19500; tx += 1800) {
      const spotCan = new THREE.Mesh(new THREE.CylinderGeometry(24, 28, 55, 16), darkMetalMat);
      spotCan.rotation.z = 0.22;
      spotCan.position.set(tx, fData.height - 180, 2350);
      const spotLens = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 6, 16), warmLampGlowMat);
      spotLens.rotation.z = 0.22;
      spotLens.position.set(tx + 6, fData.height - 206, 2350);
      fGroup.add(spotCan, spotLens);
    }

    // 5. Detailed 3D Furniture, Kitchen Appliances, Two-Tier Bar, Tables, Stools, Doors, Toilets
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

    fData.stools.forEach((pt) => {
      let angle = 0;
      if (fNum === 1 && pt[0] > 18000) {
        angle = Math.PI / 2;
      } else if (fNum === 2) {
        angle = Math.atan2(pt[0] - 12850, pt[1] - 520);
      }
      const stool = createKumoriStool(pt[0], pt[1], angle);
      fixGroup.add(stool);
    });

    fData.chairs.forEach((pt, idx) => {
      // Face chairs toward their table!
      const isTopRow = (fNum === 1 && pt[1] < 1650) || (fNum === 2 && (pt[1] < 1400 || (pt[0] > 20000 && pt[1] < 1900)));
      const rot = isTopRow ? Math.PI : 0;
      const chair = createKumoriStool(pt[0], pt[1], rot);
      chair.scale.set(0.95, 0.82, 0.95);
      fixGroup.add(chair);
    });

    // Add Architectural Doors & Porcelain Toilets
    fixGroup.add(buildArchitecturalDoorsAndToilets(fNum));

    // Add Staircases
    const stairs = buildStaircase(fData.height, fNum === 3);
    fixGroup.add(stairs);

    // Add Kumori Soho Signature Details
    const kumoriDetails = buildKumoriSignatureDetails(fNum, fData.height);
    fixGroup.add(kumoriDetails);

    if (fNum === 3) {
      const rightStairGroup = new THREE.Group();
      const sMat = new THREE.MeshStandardMaterial({ map: PBR_TEX.timberTex, color: 0x8a4221, roughness: 0.5 });
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

  const lightPositions = [
    { f: 1, x: 11800, y: 2750, z: 1800 },
    { f: 1, x: 16200, y: 2750, z: 1800 },
    { f: 1, x: 19800, y: 2750, z: 2300 },
    { f: 2, x: 12850, y: 2550, z: 1500 },
    { f: 2, x: 18200, y: 2550, z: 1900 },
    { f: 2, x: 21900, y: 2550, z: 2100 },
    { f: 2, x: 6400, y: 2550, z: 2400 },
  ];
  lightPositions.forEach((lp) => {
    const pl = new THREE.PointLight(0xff5500, 2.5, 7500);
    pl.position.set(lp.x, lp.y, lp.z);
    floorGroups[lp.f].add(pl);
    neonLights.push(pl);
  });
}

buildModel();

// KUMORI SOHO TIME-OF-DAY COLOR SHIFT SYSTEM
const KUMORI_MOODS = {
  sunset: {
    wallEmissive: new THREE.Color(0xff4d00),
    wallColor: new THREE.Color(0xffd8be),
    trackEmissive: new THREE.Color(0xff6000),
    curtainEmissive: new THREE.Color(0xff7b3a),
    lightColor: new THREE.Color(0xff5500),
    fillColor: new THREE.Color(0xff9e66),
    ambientColor: new THREE.Color(0xffe8d6),
    ambientIntensity: 0.44,
  },
  magenta: {
    wallEmissive: new THREE.Color(0xd900ff),
    wallColor: new THREE.Color(0xf5d0fe),
    trackEmissive: new THREE.Color(0xff00aa),
    curtainEmissive: new THREE.Color(0xc026d3),
    lightColor: new THREE.Color(0xd946ef),
    fillColor: new THREE.Color(0x8b5cf6),
    ambientColor: new THREE.Color(0xf3e8ff),
    ambientIntensity: 0.38,
  },
  crimson: {
    wallEmissive: new THREE.Color(0xff0044),
    wallColor: new THREE.Color(0xfecdd3),
    trackEmissive: new THREE.Color(0xff0055),
    curtainEmissive: new THREE.Color(0x6366f1),
    lightColor: new THREE.Color(0xf43f5e),
    fillColor: new THREE.Color(0x3b82f6),
    ambientColor: new THREE.Color(0xe0e7ff),
    ambientIntensity: 0.36,
  },
  daylight: {
    wallEmissive: new THREE.Color(0xff8833),
    wallColor: new THREE.Color(0xfff5eb),
    trackEmissive: new THREE.Color(0xff7700),
    curtainEmissive: new THREE.Color(0xffdec2),
    lightColor: new THREE.Color(0xff9e5e),
    fillColor: new THREE.Color(0xffffff),
    ambientColor: new THREE.Color(0xffffff),
    ambientIntensity: 0.56,
  },
};

let autoLightCycle = true;
let activeMoodKey = 'sunset';
const moodSequence = ['sunset', 'magenta', 'crimson', 'daylight'];

function applyStaticMood(moodKey) {
  activeMoodKey = moodKey;
  const m = KUMORI_MOODS[moodKey];
  if (!m) return;

  dynamicWallGlowMat.emissive.copy(m.wallEmissive);
  dynamicWallGlowMat.color.copy(m.wallColor);
  dynamicTopTrackLedMat.emissive.copy(m.trackEmissive);
  sheerCurtainMat.emissive.copy(m.curtainEmissive);
  fillLight.color.copy(m.fillColor);
  ambientLight.color.copy(m.ambientColor);
  ambientLight.intensity = m.ambientIntensity;
  neonLights.forEach((nl) => nl.color.copy(m.lightColor));
}

document.getElementById('toggle-auto-light').addEventListener('change', (e) => {
  autoLightCycle = e.target.checked;
  if (!autoLightCycle) applyStaticMood(activeMoodKey);
});

document.querySelectorAll('#kumori-mood-btns .mood-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    autoLightCycle = false;
    document.getElementById('toggle-auto-light').checked = false;
    document.querySelectorAll('#kumori-mood-btns .mood-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    applyStaticMood(btn.dataset.mood);
  });
});

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
  document.getElementById('toggle-ceiling').checked = visible;
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
      banner.textContent = '3D 전체 완공 조감도 시점';
    } else if (preset === 'f1_walk') {
      eyeLevelMode = true;
      document.getElementById('toggle-eye-level').checked = true;
      setCeilingVisibility(true);
      updateFloorMode('1');
      camera.position.set(18600, 1650, 3450);
      controls.target.set(11800, 1550, 2350);
      banner.textContent = '🔥 1F 핸드롤/칵테일 바 완공 내부 시점: 천장 하얀 시어 베일 + 2단 화강암/우드 카운터 + 스틸 등받이 부클레 스툴';
    } else if (preset === 'f1_dj') {
      eyeLevelMode = true;
      document.getElementById('toggle-eye-level').checked = true;
      setCeilingVisibility(true);
      updateFloorMode('1');
      camera.position.set(10200, 1650, 3400);
      controls.target.set(16800, 1550, 2200);
      banner.textContent = '🎧 1F DJ 부스 & 홀 완공 내부 시점';
    } else if (preset === 'f2_beer') {
      eyeLevelMode = true;
      document.getElementById('toggle-eye-level').checked = true;
      setCeilingVisibility(true);
      updateFloorMode('2');
      camera.position.set(9200, 1650, 3300);
      controls.target.set(13200, 1550, 1200);
      banner.textContent = '🍺 2F 반원형 맥주 바(QUẦY LẤY BIA) & 곡면 하얀 천막 베일 내부 시점';
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

let showLabels = false; // Default OFF so finished interior looks clean without floating boxes
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
const markerMat = new THREE.MeshBasicMaterial({ color: 0xf472b6, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
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

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  applyCameraTranslation();

  if (autoLightCycle) {
    const elapsed = clock.getElapsedTime() * 0.18;
    const idx = Math.floor(elapsed) % moodSequence.length;
    const nextIdx = (idx + 1) % moodSequence.length;
    const alpha = elapsed - Math.floor(elapsed);

    const mA = KUMORI_MOODS[moodSequence[idx]];
    const mB = KUMORI_MOODS[moodSequence[nextIdx]];

    dynamicWallGlowMat.emissive.lerpColors(mA.wallEmissive, mB.wallEmissive, alpha);
    dynamicWallGlowMat.color.lerpColors(mA.wallColor, mB.wallColor, alpha);
    dynamicTopTrackLedMat.emissive.lerpColors(mA.trackEmissive, mB.trackEmissive, alpha);
    sheerCurtainMat.emissive.lerpColors(mA.curtainEmissive, mB.curtainEmissive, alpha);
    fillLight.color.lerpColors(mA.fillColor, mB.fillColor, alpha);
    ambientLight.color.lerpColors(mA.ambientColor, mB.ambientColor, alpha);
    ambientLight.intensity = THREE.MathUtils.lerp(mA.ambientIntensity, mB.ambientIntensity, alpha);

    neonLights.forEach((nl) => {
      nl.color.lerpColors(mA.lightColor, mB.lightColor, alpha);
    });

    document.querySelectorAll('#kumori-mood-btns .mood-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.mood === moodSequence[idx]);
    });
  }

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
const floatingToggle = document.getElementById('floating-ui-toggle');
const floatingText = document.getElementById('floating-toggle-text');
const btnHeaderHideUi = document.getElementById('btn-header-hide-ui');

let isUiHidden = false;

function setUiVisibility(hidden) {
  isUiHidden = hidden;
  document.body.classList.toggle('ui-hidden', isUiHidden);
  if (floatingText) {
    floatingText.textContent = isUiHidden ? '메뉴 보기' : 'UI 숨기기';
  }
}

if (floatingToggle) {
  floatingToggle.addEventListener('click', () => {
    setUiVisibility(!isUiHidden);
  });
}

if (btnHeaderHideUi) {
  btnHeaderHideUi.addEventListener('click', () => {
    setUiVisibility(true);
  });
}

if (btnHeaderPanel && controlPanelEl) {
  btnHeaderPanel.addEventListener('click', () => {
    controlPanelEl.classList.toggle('mobile-open');
  });
}

if (btnClosePanel && controlPanelEl) {
  btnClosePanel.addEventListener('click', () => {
    controlPanelEl.classList.remove('mobile-open');
  });
}


