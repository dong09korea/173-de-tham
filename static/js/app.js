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

  // Photo 4: 1F Storefront Exterior Exposed Concrete Facade Texture
  const facadeConcreteTex = loadPbr('./static/textures/facade_exposed_concrete.jpg', 1, 1);

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
    facadeConcreteTex,
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
// SOFT BASE AMBIENT + INSTALLED FIXTURE LIGHTS
// ============================================================================
const ambientLight = new THREE.AmbientLight(0xfff2e2, 0.22);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xfff5e6, 0x26211d, 0.18);
hemiLight.position.set(14000, 12000, 2200);
scene.add(hemiLight);

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
// 4-LEGGED TUBULAR CHROME & COGNAC-BROWN LEATHER ROUND CHAIR (Matching Reference Photo)
// ============================================================================
const cognacLeatherMat = new THREE.MeshPhysicalMaterial({
  color: 0x7b4324,
  roughness: 0.34,
  metalness: 0.04,
  clearcoat: 0.24,
  clearcoatRoughness: 0.32,
});

function createChromeLeatherRoundChair(x, z, facingAngle = 0, seatY = 460) {
  const g = new THREE.Group();

  const chairShadow = new THREE.Mesh(new THREE.PlaneGeometry(430, 430), contactShadowMat);
  chairShadow.rotation.x = -Math.PI / 2;
  chairShadow.position.y = 2;
  g.add(chairShadow);

  const seatR = 184;
  const ringR = 198;
  const tubeR = 11.5;
  const hoopY = seatY + 235;

  // 1) Plump Round Cognac-Brown Leather Seat Cushion nestled inside the chrome ring
  const cushionBase = new THREE.Mesh(new THREE.CylinderGeometry(seatR, seatR - 6, 52, 36), cognacLeatherMat);
  cushionBase.position.y = seatY - 6;
  cushionBase.castShadow = true;
  cushionBase.receiveShadow = true;
  g.add(cushionBase);

  const cushionDome = new THREE.Mesh(
    new THREE.SphereGeometry(seatR, 36, 16, 0, Math.PI * 2, 0, Math.PI / 2.5),
    cognacLeatherMat
  );
  cushionDome.scale.set(1, 0.24, 1);
  cushionDome.position.y = seatY + 18;
  cushionDome.castShadow = true;
  cushionDome.receiveShadow = true;
  g.add(cushionDome);

  const seatUnderPan = new THREE.Mesh(new THREE.CylinderGeometry(seatR - 10, seatR - 16, 12, 28), darkMetalMat);
  seatUnderPan.position.y = seatY - 34;
  g.add(seatUnderPan);

  // 2) Circular Polished Chrome Seat Frame Ring encircling the round leather seat
  const seatRing = new THREE.Mesh(new THREE.TorusGeometry(ringR, tubeR, 16, 44), chromeTubularMat);
  seatRing.rotation.x = Math.PI / 2;
  seatRing.position.y = seatY - 8;
  seatRing.castShadow = true;
  g.add(seatRing);

  // 3) Continuous Polished Chrome Tubular Frame:
  //    Front-left vertical leg -> 90° top elbow -> circular backrest hoop around +Z -> 90° top elbow -> Front-right vertical leg
  const startAng = -0.46; // ~26° ahead of side axis on the circle of radius ringR
  const endAng = Math.PI + 0.46;
  const elbowR = 38;
  const fxL = -ringR * Math.cos(startAng);
  const fzL = ringR * Math.sin(startAng);
  const fxR = ringR * Math.cos(startAng);
  const fzR = ringR * Math.sin(startAng);

  // Tangent unit vector at startAng along the circle
  const tanAngL = startAng + 0.18;
  const arcStartL = new THREE.Vector3(-ringR * Math.cos(tanAngL), hoopY, ringR * Math.sin(tanAngL));
  const arcEndR = new THREE.Vector3(ringR * Math.cos(tanAngL), hoopY, ringR * Math.sin(tanAngL));

  const hoopCurve = new THREE.CurvePath();
  // Left front leg rising from floor to elbow
  hoopCurve.add(
    new THREE.LineCurve3(new THREE.Vector3(fxL, 10, fzL), new THREE.Vector3(fxL, hoopY - elbowR, fzL))
  );
  // Left 90-degree smooth elbow bend into circular hoop
  hoopCurve.add(
    new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(fxL, hoopY - elbowR, fzL),
      new THREE.Vector3(fxL, hoopY, fzL),
      arcStartL
    )
  );
  // Circular backrest hoop wrapping around the rear (+Z)
  const arcSegments = 20;
  for (let i = 0; i < arcSegments; i++) {
    const a0 = tanAngL + (i / arcSegments) * (Math.PI - 2 * tanAngL);
    const a1 = tanAngL + ((i + 1) / arcSegments) * (Math.PI - 2 * tanAngL);
    hoopCurve.add(
      new THREE.LineCurve3(
        new THREE.Vector3(-ringR * Math.cos(a0), hoopY, ringR * Math.sin(a0)),
        new THREE.Vector3(-ringR * Math.cos(a1), hoopY, ringR * Math.sin(a1))
      )
    );
  }
  // Right 90-degree smooth elbow bend down into right front leg
  hoopCurve.add(
    new THREE.QuadraticBezierCurve3(
      arcEndR,
      new THREE.Vector3(fxR, hoopY, fzR),
      new THREE.Vector3(fxR, hoopY - elbowR, fzR)
    )
  );
  // Right front leg descending to floor
  hoopCurve.add(
    new THREE.LineCurve3(new THREE.Vector3(fxR, hoopY - elbowR, fzR), new THREE.Vector3(fxR, 10, fzR))
  );

  const hoopGeom = new THREE.TubeGeometry(hoopCurve, 72, tubeR, 16, false);
  const hoopMesh = new THREE.Mesh(hoopGeom, chromeTubularMat);
  hoopMesh.castShadow = true;
  g.add(hoopMesh);

  // 4) 2 Rear Vertical Chrome Legs rising from floor through the circular seat ring up to the rear backrest hoop
  const rearAngles = [0.88, Math.PI - 0.88];
  rearAngles.forEach((ra) => {
    const rx = -ringR * Math.cos(ra);
    const rz = ringR * Math.sin(ra);
    const rearLegH = hoopY - 10;
    const rearLeg = new THREE.Mesh(new THREE.CylinderGeometry(tubeR, tubeR, rearLegH, 16), chromeTubularMat);
    rearLeg.position.set(rx, 10 + rearLegH / 2, rz);
    rearLeg.castShadow = true;
    g.add(rearLeg);
  });

  // White/Silver Floor Glides on all 4 legs
  [
    [fxL, fzL],
    [fxR, fzR],
    [-ringR * Math.cos(rearAngles[0]), ringR * Math.sin(rearAngles[0])],
    [-ringR * Math.cos(rearAngles[1]), ringR * Math.sin(rearAngles[1])],
  ].forEach(([gx, gz]) => {
    const glide = new THREE.Mesh(new THREE.CylinderGeometry(tubeR - 0.5, tubeR - 1.5, 10, 14), whitePorcelainMat);
    glide.position.set(gx, 5, gz);
    g.add(glide);
  });

  // 5) Curved Cognac-Brown Leather Padded Backrest Bolster + Rear Chrome Backing Strap & Studs
  const padStart = 0.36;
  const padEnd = Math.PI - 0.36;
  const padShape = new THREE.Shape();
  padShape.absarc(0, 0, ringR - 3, padStart, padEnd, false);
  padShape.absarc(0, 0, ringR - 31, padEnd, padStart, true);
  padShape.closePath();

  const padH = 82;
  const padGeom = new THREE.ExtrudeGeometry(padShape, {
    depth: padH,
    bevelEnabled: true,
    bevelThickness: 10,
    bevelSize: 7,
    bevelSegments: 4,
  });
  padGeom.rotateX(Math.PI / 2);
  const padMesh = new THREE.Mesh(padGeom, cognacLeatherMat);
  padMesh.position.y = hoopY + padH / 2 + 4;
  padMesh.castShadow = true;
  padMesh.receiveShadow = true;
  g.add(padMesh);

  // Curved Chrome Backing Plate on the outside (+Z) of the backrest
  const plateStart = 0.44;
  const plateEnd = Math.PI - 0.44;
  const plateShape = new THREE.Shape();
  plateShape.absarc(0, 0, ringR + 13, plateStart, plateEnd, false);
  plateShape.absarc(0, 0, ringR + 4, plateEnd, plateStart, true);
  plateShape.closePath();

  const plateH = 48;
  const plateGeom = new THREE.ExtrudeGeometry(plateShape, {
    depth: plateH,
    bevelEnabled: true,
    bevelThickness: 3,
    bevelSize: 2,
    bevelSegments: 2,
  });
  plateGeom.rotateX(Math.PI / 2);
  const plateMesh = new THREE.Mesh(plateGeom, chromeTubularMat);
  plateMesh.position.y = hoopY + plateH / 2 + 6;
  g.add(plateMesh);

  // Subtle circular chrome footrest ring for taller bar-height chairs
  if (seatY > 520) {
    const footRing = new THREE.Mesh(new THREE.TorusGeometry(ringR, 8, 12, 36), chromeTubularMat);
    footRing.rotation.x = Math.PI / 2;
    footRing.position.y = 210;
    g.add(footRing);
  }

  g.position.set(x, 0, z);
  g.rotation.y = facingAngle;
  return g;
}

function createIndustrialMetalStool(x, z, facingAngle = 0) {
  return createChromeLeatherRoundChair(x, z, facingAngle, 610);
}

function createCafeDiningChair(x, z, facingAngle = 0) {
  return createChromeLeatherRoundChair(x, z, facingAngle, 460);
}

// ============================================================================
// FLUTED ROUND WARM WALL SCONCE (Horizontally Ribbed Golden Diffuser Lens + Warm Halo)
// ============================================================================
const flutedSconceTextures = (() => {
  // 1) Fluted front lens texture (warm golden core + horizontal ribbed shading)
  const lCanvas = document.createElement('canvas');
  lCanvas.width = 256;
  lCanvas.height = 256;
  const lCtx = lCanvas.getContext('2d');

  const radGrad = lCtx.createRadialGradient(128, 128, 12, 128, 128, 128);
  radGrad.addColorStop(0, '#fffdf5');
  radGrad.addColorStop(0.45, '#ffd27d');
  radGrad.addColorStop(0.82, '#d98a2b');
  radGrad.addColorStop(1, '#7a4312');
  lCtx.fillStyle = radGrad;
  lCtx.fillRect(0, 0, 256, 256);

  // Horizontal wave ribs across the circular face
  const numRibs = 15;
  const ribH = 256 / numRibs;
  for (let i = 0; i < numRibs; i++) {
    const y0 = i * ribH;
    const g = lCtx.createLinearGradient(0, y0, 0, y0 + ribH);
    g.addColorStop(0.0, 'rgba(55, 25, 5, 0.55)');
    g.addColorStop(0.28, 'rgba(255, 240, 200, 0.35)');
    g.addColorStop(0.5, 'rgba(255, 250, 230, 0.55)');
    g.addColorStop(0.75, 'rgba(180, 105, 25, 0.25)');
    g.addColorStop(1.0, 'rgba(55, 25, 5, 0.55)');
    lCtx.fillStyle = g;
    lCtx.fillRect(0, y0, 256, ribH);
  }
  const lensTex = new THREE.CanvasTexture(lCanvas);
  lensTex.colorSpace = THREE.SRGBColorSpace;

  // 2) Soft warm wall halo glow texture around the sconce base
  const hCanvas = document.createElement('canvas');
  hCanvas.width = 256;
  hCanvas.height = 256;
  const hCtx = hCanvas.getContext('2d');
  const hGrad = hCtx.createRadialGradient(128, 128, 28, 128, 128, 128);
  hGrad.addColorStop(0, 'rgba(255, 195, 95, 0.65)');
  hGrad.addColorStop(0.4, 'rgba(255, 165, 60, 0.28)');
  hGrad.addColorStop(0.75, 'rgba(255, 140, 40, 0.08)');
  hGrad.addColorStop(1, 'rgba(255, 130, 30, 0)');
  hCtx.fillStyle = hGrad;
  hCtx.fillRect(0, 0, 256, 256);
  const haloTex = new THREE.CanvasTexture(hCanvas);
  haloTex.colorSpace = THREE.SRGBColorSpace;

  return { lensTex, haloTex };
})();

const sconceBodyBrassMat = new THREE.MeshPhysicalMaterial({
  color: 0xd8b57c,
  emissive: 0x4a2e0b,
  emissiveIntensity: 0.35,
  roughness: 0.28,
  metalness: 0.72,
  clearcoat: 0.3,
});

const sconceFlutedLensMat = new THREE.MeshStandardMaterial({
  map: flutedSconceTextures.lensTex,
  emissiveMap: flutedSconceTextures.lensTex,
  emissive: 0xffb84d,
  emissiveIntensity: 1.55,
  roughness: 0.18,
  metalness: 0.1,
});

const sconceRibGlassMat = new THREE.MeshPhysicalMaterial({
  color: 0xffdfa8,
  emissive: 0xffa733,
  emissiveIntensity: 0.85,
  roughness: 0.15,
  metalness: 0.15,
  transmission: 0.55,
  transparent: true,
  opacity: 0.92,
  clearcoat: 0.85,
});

const sconceWallHaloMat = new THREE.MeshBasicMaterial({
  map: flutedSconceTextures.haloTex,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

function createFlutedRoundWallSconce(x, y, z, rotY = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const radius = 135;
  const depth = 105;

  // Soft warm halo glow projected onto the wall right behind the fixture
  const haloPlane = new THREE.Mesh(new THREE.PlaneGeometry(620, 620), sconceWallHaloMat);
  haloPlane.position.set(0, 0, -6);
  haloPlane.rotation.y = Math.PI;
  g.add(haloPlane);

  // Dark bronze rear mounting ring flush with the wall
  const backRing = new THREE.Mesh(new THREE.CylinderGeometry(radius + 8, radius + 8, 14, 36), antiqueBronzeMat);
  backRing.rotation.x = Math.PI / 2;
  backRing.position.set(0, 0, -7);
  g.add(backRing);

  // Warm satin brass cylindrical side housing
  const bodyCyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 4, depth, 40), sconceBodyBrassMat);
  bodyCyl.rotation.x = Math.PI / 2;
  bodyCyl.position.set(0, 0, -depth / 2);
  bodyCyl.castShadow = true;
  g.add(bodyCyl);

  // Glowing inner diffuser disc at the front face
  const lensR = radius - 7;
  const frontDisc = new THREE.Mesh(new THREE.CylinderGeometry(lensR, lensR, 10, 40), sconceFlutedLensMat);
  frontDisc.rotation.x = Math.PI / 2;
  frontDisc.position.set(0, 0, -depth - 2);
  g.add(frontDisc);

  // 3D Horizontal Fluted / Ribbed Glass Waves across the circular front face (matching photo!)
  const numRibs = 15;
  const stepY = (lensR * 2) / numRibs;
  const ribRadius = stepY * 0.52;
  for (let i = 0; i < numRibs; i++) {
    const dy = -lensR + (i + 0.5) * stepY;
    const halfChord = Math.sqrt(Math.max(0, lensR * lensR - dy * dy));
    if (halfChord < 12) continue;
    const ribGeom = new THREE.CylinderGeometry(ribRadius, ribRadius, halfChord * 2, 16);
    ribGeom.rotateZ(Math.PI / 2);
    const ribMesh = new THREE.Mesh(ribGeom, sconceRibGlassMat);
    ribMesh.position.set(0, dy, -depth - 4);
    g.add(ribMesh);
  }

  // Warm golden point light illuminating the wall & corridor floor
  const sconceLight = new THREE.PointLight(0xffbe5c, 0.75, 4200, 0);
  sconceLight.position.set(0, 0, -depth - 140);
  g.add(sconceLight);

  return g;
}

// ============================================================================
// TILTED WIDE WOODEN-FRAMED WALL MIRROR (Mounted Right Above Left Wall Sconces)
// ============================================================================
const mirrorEnvMap = (() => {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.025).texture;
  pmrem.dispose();
  return envTex;
})();

const mirrorFrameWoodMat = new THREE.MeshPhysicalMaterial({
  map: PBR_TEX.timberTex,
  color: 0x9c6f44,
  roughness: 0.42,
  metalness: 0.04,
  clearcoat: 0.22,
});

const angledWallMirrorGlassMat = new THREE.MeshStandardMaterial({
  color: 0xeef3f8,
  emissive: 0x2a241e,
  emissiveIntensity: 0.28,
  roughness: 0.03,
  metalness: 0.96,
  envMap: mirrorEnvMap,
  envMapIntensity: 1.35,
});

function createTiltedWideWallMirror(x, y, z, rotY = 0, width = 3100, height = 680) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;

  const topDepth = 175; // Top edge projects further out from wall (tilted downward like reference photo)
  const botDepth = 36;  // Bottom edge sits close to wall
  const frameT = 32;
  const halfW = width / 2;
  const halfH = height / 2;

  // 1) Left & Right Wedge-Shaped Wooden Side Panels (Trapezoid profile flush against wall at z=0)
  const sideShape = new THREE.Shape();
  sideShape.moveTo(0, -halfH);
  sideShape.lineTo(-botDepth, -halfH);
  sideShape.lineTo(-topDepth, halfH);
  sideShape.lineTo(0, halfH);
  sideShape.closePath();

  const sideExtrude = new THREE.ExtrudeGeometry(sideShape, { depth: frameT, bevelEnabled: false });
  // Rotate so 2D X -> 3D Z (outward along -Z), 2D Y -> 3D Y, and extrude depth -> 3D X
  sideExtrude.rotateY(-Math.PI / 2);
  applyBoxUV(sideExtrude, 600, 600);

  const leftSideMesh = new THREE.Mesh(sideExtrude, mirrorFrameWoodMat);
  leftSideMesh.position.set(-halfW + frameT, 0, 0);
  leftSideMesh.castShadow = true;

  const rightSideMesh = new THREE.Mesh(sideExtrude, mirrorFrameWoodMat);
  rightSideMesh.position.set(halfW, 0, 0);
  rightSideMesh.castShadow = true;
  g.add(leftSideMesh, rightSideMesh);

  // 2) Top & Bottom Wooden Wedge Hood / Sill Boards connecting wall to front tilted bezel
  const topBoardGeom = new THREE.BoxGeometry(width, frameT, topDepth);
  applyBoxUV(topBoardGeom, 1200, 300);
  const topBoard = new THREE.Mesh(topBoardGeom, mirrorFrameWoodMat);
  topBoard.position.set(0, halfH - frameT / 2, -topDepth / 2);
  topBoard.castShadow = true;

  const botBoardGeom = new THREE.BoxGeometry(width, frameT, botDepth);
  applyBoxUV(botBoardGeom, 1200, 300);
  const botBoard = new THREE.Mesh(botBoardGeom, mirrorFrameWoodMat);
  botBoard.position.set(0, -halfH + frameT / 2, -botDepth / 2);
  botBoard.castShadow = true;
  g.add(topBoard, botBoard);

  // 3) Tilted Front Plane (Bezel Frame + Reflective Mirror Glass tilted downward into the room)
  const dz = topDepth - botDepth;
  const slantH = Math.sqrt(height * height + dz * dz);
  const tiltAngle = Math.atan2(dz, height); // ~11.3 degrees downward tilt

  const tiltedFace = new THREE.Group();
  tiltedFace.position.set(0, 0, -(topDepth + botDepth) / 2);
  tiltedFace.rotation.x = -tiltAngle;

  // Reflective Mirror Glass Pane
  const glassW = width - frameT * 2;
  const glassH = slantH - frameT * 2;
  const mirrorPane = new THREE.Mesh(new THREE.BoxGeometry(glassW, glassH, 10), angledWallMirrorGlassMat);
  mirrorPane.position.set(0, 0, 6);
  tiltedFace.add(mirrorPane);

  // Front Wooden Bezel Frame Trim (Top, Bottom, Left, Right rails)
  const bezelDepth = 22;
  const fTop = new THREE.Mesh(new THREE.BoxGeometry(width, frameT, bezelDepth), mirrorFrameWoodMat);
  fTop.position.set(0, slantH / 2 - frameT / 2, 0);
  const fBot = new THREE.Mesh(new THREE.BoxGeometry(width, frameT, bezelDepth), mirrorFrameWoodMat);
  fBot.position.set(0, -slantH / 2 + frameT / 2, 0);
  const fLeft = new THREE.Mesh(new THREE.BoxGeometry(frameT, slantH - frameT * 2, bezelDepth), mirrorFrameWoodMat);
  fLeft.position.set(-halfW + frameT / 2, 0, 0);
  const fRight = new THREE.Mesh(new THREE.BoxGeometry(frameT, slantH - frameT * 2, bezelDepth), mirrorFrameWoodMat);
  fRight.position.set(halfW - frameT / 2, 0, 0);
  tiltedFace.add(fTop, fBot, fLeft, fRight);

  g.add(tiltedFace);
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
    // 3층은 최상층이므로 위로 올라가는 계단(y > 0)은 없고, 2층에서 3층 바닥으로 올라오는 계단과 난간만 존재
    buildFlightSet(-totalRise, totalRise);

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

  // Warm downward illumination from the light box onto the burgundy bar counter, stools, kitchen & floor
  // Note: decay = 0 is required because scene coordinates are in millimeters (1000mm = 1m)
  const lightLeft = new THREE.PointLight(0xffe2a8, 1.4, 7500, 0);
  lightLeft.position.set(-width * 0.25, bottomY - 60, 0);
  const lightRight = new THREE.PointLight(0xffe2a8, 1.4, 7500, 0);
  lightRight.position.set(width * 0.25, bottomY - 60, 0);
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
    const hoodLight = new THREE.PointLight(0xffe4ad, 1.1, 5200, 0);
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
    // 3) PHOTO 3: SUSPENDED ILLUSTRATED LIGHT BOX CANOPY HOODS (50% SLIMMER & L-SHAPED OVER BAR TABLE)
    // ------------------------------------------------------------------------
    // Rear-left canopy: directly centered above Left Bar Table (x: 9190 ~ 14350, zCenter: 2885, depth: 460mm = 50% reduced, height: 260mm)
    const canopyLeft = createIllustratedLightBoxCanopy(11770, 2885, 5200, 460, 2160, 260, floorHeight - 150, 0);
    // Front-right canopy: directly centered above Right Front Bar Table (x: 15330 ~ 18140, zCenter: 2885, depth: 460mm, height: 260mm)
    const canopyRight = createIllustratedLightBoxCanopy(16735, 2885, 2810, 460, 2160, 260, floorHeight - 150, 0);
    // L-bent side canopy: directly centered above the L-bent Side Bar Table (xCenter: 17910, z: 550 ~ 2655, depth: 460mm, height: 260mm)
    const canopySide = createIllustratedLightBoxCanopy(17910, 1602, 2105, 460, 2160, 260, floorHeight - 150, Math.PI / 2);
    dGroup.add(canopyLeft, canopyRight, canopySide);

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

    // ------------------------------------------------------------------------
    // 5) PHOTO 4: 1F FRONT ENTRANCE EXTERIOR FACADE (EXPOSED CONCRETE + BLACK SASH & GLASS)
    //    - Left (from outside looking in, +Z: z=2842.8~4005.5): Full-height Entrance Glass Door
    //    - Right Bottom (-Z: z=691.0~2842.8, y=140~1520): Fixed Glass Panels with Horizontal Sash Bar
    //    - Right Top (-Z: z=691.0~2842.8, y=1520~2426): Outward Push-Out Awning Glass Window
    // ------------------------------------------------------------------------
    const facadeGroup = new THREE.Group();

    const facadeConcreteMat = new THREE.MeshStandardMaterial({
      map: PBR_TEX.facadeConcreteTex,
      bumpMap: PBR_TEX.facadeConcreteTex,
      bumpScale: 1.8,
      color: 0xd8d6d2,
      roughness: 0.80,
      metalness: 0.05,
    });

    const sashFrameMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c1f,
      roughness: 0.28,
      metalness: 0.78,
    });

    const thresholdStoneMat = new THREE.MeshStandardMaterial({
      map: PBR_TEX.graniteTex,
      bumpMap: PBR_TEX.graniteTex,
      bumpScale: 1.2,
      color: 0x26292c,
      roughness: 0.42,
      metalness: 0.1,
    });

    const storefrontGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xeef4f8,
      roughness: 0.05,
      transmission: 0.86,
      transparent: true,
      opacity: 0.28,
      reflectivity: 0.65,
      clearcoat: 0.9,
    });

    // 5-A) Bottom Dark Stone Threshold Curb (z: 314.5 ~ 4444.1, y: 0 ~ 140)
    const curbGeom = new THREE.BoxGeometry(555, 140, 4130);
    applyBoxUV(curbGeom, 1000, 300);
    const curbMesh = new THREE.Mesh(curbGeom, thresholdStoneMat);
    curbMesh.position.set(22795, 70, 2379.3);
    curbMesh.receiveShadow = true;
    facadeGroup.add(curbMesh);

    // 5-B) Top Exposed Concrete Header Beam (z: 314.5 ~ 4444.1, y: 2480 ~ floorHeight)
    const headerH = floorHeight - 2480;
    const headerY = 2480 + headerH / 2;
    const headerGeom = new THREE.BoxGeometry(535, headerH, 4130);
    applyBoxUV(headerGeom, 2065, headerH);
    const headerMesh = new THREE.Mesh(headerGeom, facadeConcreteMat);
    headerMesh.position.set(22790, headerY, 2379.3);
    headerMesh.castShadow = true;
    headerMesh.receiveShadow = true;
    facadeGroup.add(headerMesh);

    // Subtle vertical joint seam in the center of the top concrete header (matching Photo 4!)
    const headerSeam = new THREE.Mesh(new THREE.BoxGeometry(542, headerH, 12), sashFrameMat);
    headerSeam.position.set(22790, headerY, 2379.3);
    facadeGroup.add(headerSeam);

    // 5-C) Left & Right Exposed Concrete Side Pillars (y: 140 ~ 2480)
    // Left Pillar (when looking from outside toward -X, left is +Z: z = 4005.5 ~ 4444.1)
    const leftPillarGeom = new THREE.BoxGeometry(535, 2340, 438.6);
    applyBoxUV(leftPillarGeom, 1200, 1200);
    const leftPillar = new THREE.Mesh(leftPillarGeom, facadeConcreteMat);
    leftPillar.position.set(22790, 1310, 4224.8);
    leftPillar.castShadow = true;
    leftPillar.receiveShadow = true;

    // Right Pillar (when looking from outside toward -X, right is -Z: z = 314.5 ~ 691.0)
    const rightPillarGeom = new THREE.BoxGeometry(535, 2340, 376.5);
    applyBoxUV(rightPillarGeom, 1200, 1200);
    const rightPillar = new THREE.Mesh(rightPillarGeom, facadeConcreteMat);
    rightPillar.position.set(22790, 1310, 502.75);
    rightPillar.castShadow = true;
    rightPillar.receiveShadow = true;
    facadeGroup.add(leftPillar, rightPillar);

    // 5-D) Black Metal Storefront Outer Sash Frame & Center Vertical Mullion (at x = 22950)
    const sashX = 22950;
    const sashDepth = 88;
    const outerTopRail = new THREE.Mesh(new THREE.BoxGeometry(sashDepth, 54, 3314.5), sashFrameMat);
    outerTopRail.position.set(sashX, 2453, 2348.25);
    const outerBotSill = new THREE.Mesh(new THREE.BoxGeometry(sashDepth, 54, 3314.5), sashFrameMat);
    outerBotSill.position.set(sashX, 167, 2348.25);
    const outerLeftJamb = new THREE.Mesh(new THREE.BoxGeometry(sashDepth, 2340, 54), sashFrameMat);
    outerLeftJamb.position.set(sashX, 1310, 3978.5);
    const outerRightJamb = new THREE.Mesh(new THREE.BoxGeometry(sashDepth, 2340, 54), sashFrameMat);
    outerRightJamb.position.set(sashX, 1310, 718.0);
    // Main Vertical Mullion at z = 2842.8 separating Left Door & Right Window
    const centerMullion = new THREE.Mesh(new THREE.BoxGeometry(sashDepth + 8, 2340, 65), sashFrameMat);
    centerMullion.position.set(sashX, 1310, 2842.8);
    facadeGroup.add(outerTopRail, outerBotSill, outerLeftJamb, outerRightJamb, centerMullion);

    // 5-E) LEFT SIDE (+Z: z = 2875.3 ~ 3951.5, width = 1076.2mm): ENTRANCE DOOR ("왼쪽이 출입구 문")
    const doorZCenter = 3413.4;
    const doorW = 1076.2;
    const doorStile = 46;
    const doorTopRail = new THREE.Mesh(new THREE.BoxGeometry(64, doorStile, doorW), sashFrameMat);
    doorTopRail.position.set(sashX, 2403, doorZCenter);
    const doorBotRail = new THREE.Mesh(new THREE.BoxGeometry(64, doorStile + 10, doorW), sashFrameMat);
    doorBotRail.position.set(sashX, 222, doorZCenter);
    const doorLeftStile = new THREE.Mesh(new THREE.BoxGeometry(64, 2232, doorStile), sashFrameMat);
    doorLeftStile.position.set(sashX, 1310, 3928.5);
    const doorRightStile = new THREE.Mesh(new THREE.BoxGeometry(64, 2232, doorStile), sashFrameMat);
    doorRightStile.position.set(sashX, 1310, 2898.3);
    const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(14, 2130, doorW - doorStile * 2), storefrontGlassMat);
    doorGlass.position.set(sashX, 1312, doorZCenter);
    facadeGroup.add(doorTopRail, doorBotRail, doorLeftStile, doorRightStile, doorGlass);

    // Vertical Black Metal Pull Handle on Left Entrance Door (near center mullion at z = 2955)
    [-46, 46].forEach((hxOffset) => {
      const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 520, 14), sashFrameMat);
      handleBar.position.set(sashX + hxOffset, 1210, 2955);
      const standTop = new THREE.Mesh(new THREE.BoxGeometry(46, 18, 18), sashFrameMat);
      standTop.position.set(sashX + hxOffset * 0.5, 1430, 2955);
      const standBot = new THREE.Mesh(new THREE.BoxGeometry(46, 18, 18), sashFrameMat);
      standBot.position.set(sashX + hxOffset * 0.5, 990, 2955);
      facadeGroup.add(handleBar, standTop, standBot);
    });

    // 5-F) RIGHT SIDE (-Z: z = 745.0 ~ 2810.3, width = 2065.3mm):
    //      - Lower Fixed Glass Panels ("오른쪽 아래는 고정", y = 194 ~ 1520)
    //      - Upper Push-Out Awning Window ("위에는 밀어서 열리는 문", y = 1520 ~ 2426)
    const rightZCenter = 1777.65;
    const rightW = 2065.3;

    // Horizontal Intermediate Mullion Bar at y = 1000mm (aligned with bar counter top!)
    const lowerHorizBar = new THREE.Mesh(new THREE.BoxGeometry(72, 46, rightW), sashFrameMat);
    lowerHorizBar.position.set(sashX, 1000, rightZCenter);

    // Main Horizontal Transom Bar at y = 1520mm (separating fixed lower glass & upper awning window!)
    const midTransomBar = new THREE.Mesh(new THREE.BoxGeometry(88, 56, rightW), sashFrameMat);
    midTransomBar.position.set(sashX, 1520, rightZCenter);

    // Lower Fixed Glass Pane 1 (Bottom: y = 194 ~ 977)
    const fixedGlassBot = new THREE.Mesh(new THREE.BoxGeometry(14, 783, rightW), storefrontGlassMat);
    fixedGlassBot.position.set(sashX, 585.5, rightZCenter);

    // Lower Fixed Glass Pane 2 (Middle: y = 1023 ~ 1492)
    const fixedGlassMid = new THREE.Mesh(new THREE.BoxGeometry(14, 469, rightW), storefrontGlassMat);
    fixedGlassMid.position.set(sashX, 1257.5, rightZCenter);
    facadeGroup.add(lowerHorizBar, midTransomBar, fixedGlassBot, fixedGlassMid);

    // Upper Push-Out Awning Window Group (Top-hinged at x = sashX + 35, y = 2426, pushed ALL THE WAY OUTWARD toward +X!)
    const awningH = 878;
    const awningPivot = new THREE.Group();
    awningPivot.position.set(sashX + 35, 2426, rightZCenter);
    // Positive rotation.z swings negative-Y points (+y * sin(theta)) OUTWARD toward +X (street side) by ~77 degrees!
    awningPivot.rotation.z = 1.35;

    const awFrameThick = 46;
    const awTopRail = new THREE.Mesh(new THREE.BoxGeometry(58, awFrameThick, rightW - 8), sashFrameMat);
    awTopRail.position.set(0, -awFrameThick / 2, 0);
    const awBotRail = new THREE.Mesh(new THREE.BoxGeometry(58, awFrameThick, rightW - 8), sashFrameMat);
    awBotRail.position.set(0, -awningH + awFrameThick / 2, 0);
    const awLeftStile = new THREE.Mesh(new THREE.BoxGeometry(58, awningH, awFrameThick), sashFrameMat);
    awLeftStile.position.set(0, -awningH / 2, (rightW - 8) / 2 - awFrameThick / 2);
    const awRightStile = new THREE.Mesh(new THREE.BoxGeometry(58, awningH, awFrameThick), sashFrameMat);
    awRightStile.position.set(0, -awningH / 2, -(rightW - 8) / 2 + awFrameThick / 2);
    const awGlass = new THREE.Mesh(
      new THREE.BoxGeometry(14, awningH - awFrameThick * 2, rightW - awFrameThick * 2 - 8),
      storefrontGlassMat
    );
    awGlass.position.set(0, -awningH / 2, 0);
    awningPivot.add(awTopRail, awBotRail, awLeftStile, awRightStile, awGlass);
    facadeGroup.add(awningPivot);

    // Black Metal Friction Stay Support Arms holding the fully-open push-out awning window on both sides
    [775, 2780].forEach((armZ) => {
      const stayArm = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 680, 10), sashFrameMat);
      stayArm.position.set(sashX + 285, 2045, armZ);
      stayArm.rotation.z = -0.76;
      facadeGroup.add(stayArm);
    });

    // Subtle exterior storefront street illumination so the exposed concrete & black sash look crisp from outside
    const facadeStreetLight = new THREE.PointLight(0xfff5e8, 0.95, 5200, 0);
    facadeStreetLight.position.set(24500, 2500, 2380);
    facadeGroup.add(facadeStreetLight);

    dGroup.add(facadeGroup);

    // ------------------------------------------------------------------------
    // 6) 7 FLUTED ROUND WALL SCONCES ON LEFT WALL (60% HEIGHT, FROM ENTRANCE TO END OF BUILDING)
    // ------------------------------------------------------------------------
    const sconceY = floorHeight * 0.60; // 60% height from bottom (2100mm)
    const leftWallSconceX = [20400, 17200, 14000, 10800, 7600, 4400, 1200];
    const slopeAngle = -Math.atan2(4241.4 - 3707.6, 9558.6 - -339.3);

    leftWallSconceX.forEach((sx) => {
      let sz = 4241.4;
      let sRotY = 0;
      if (sx < 9558.6) {
        const t = (sx - -339.3) / (9558.6 - -339.3);
        sz = 3707.6 + t * (4241.4 - 3707.6);
        sRotY = slopeAngle;
      }
      dGroup.add(createFlutedRoundWallSconce(sx, sconceY, sz, sRotY));
    });

    // ------------------------------------------------------------------------
    // 7) 4 TILTED WIDE WOODEN-FRAMED MIRRORS RIGHT ABOVE LEFT WALL SCONCES
    // ------------------------------------------------------------------------
    const mirrorY = sconceY + 620; // Centered at 2840mm (spanning 2500mm ~ 3180mm, directly above the 2220mm wall sconces)
    const leftWallMirrorX = [19600, 14000, 7600, 2000];

    leftWallMirrorX.forEach((mx) => {
      let mz = 4241.4;
      let mRotY = 0;
      if (mx < 9558.6) {
        const t = (mx - -339.3) / (9558.6 - -339.3);
        mz = 3707.6 + t * (4241.4 - 3707.6);
        mRotY = slopeAngle;
      }
      dGroup.add(createTiltedWideWallMirror(mx, mirrorY, mz, mRotY, 3100, 680));
    });
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

    // ------------------------------------------------------------------------
    // 2F FRONT FULL GLASS WINDOW (50% TOP / 50% BOTTOM SPLIT — TOP PUSHED OUTWARD OPEN)
    // Exact CAD f2_east_window opening: x = 23726.9 ~ 23929.7, z = 1270.3 ~ 4096.6 (width = 2826.3mm)
    // ------------------------------------------------------------------------
    const f2WinGroup = new THREE.Group();
    const f2SashMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c1f,
      roughness: 0.28,
      metalness: 0.78,
    });
    const f2GlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xeef4f8,
      roughness: 0.05,
      transmission: 0.86,
      transparent: true,
      opacity: 0.28,
      reflectivity: 0.65,
      clearcoat: 0.9,
    });

    const f2WinX = 23840;
    const f2ZMin = 1270.3;
    const f2ZMax = 4096.6;
    const f2ZCenter = (f2ZMin + f2ZMax) / 2; // 2683.45
    const f2TotalW = f2ZMax - f2ZMin; // 2826.3
    const f2TotalH = floorHeight - 155; // 2845mm (reaching cleanly to 2F ceiling)
    const f2MidY = f2TotalH * 0.5; // Exact 50% vertical split (1422.5mm)
    const f2FrameT = 54;
    const f2Depth = 92;

    // Outer perimeter black metal sash frame
    const f2TopRail = new THREE.Mesh(new THREE.BoxGeometry(f2Depth, f2FrameT, f2TotalW), f2SashMat);
    f2TopRail.position.set(f2WinX, f2TotalH - f2FrameT / 2, f2ZCenter);
    const f2BotSill = new THREE.Mesh(new THREE.BoxGeometry(f2Depth, f2FrameT, f2TotalW), f2SashMat);
    f2BotSill.position.set(f2WinX, f2FrameT / 2, f2ZCenter);
    const f2LeftJamb = new THREE.Mesh(new THREE.BoxGeometry(f2Depth, f2TotalH, f2FrameT), f2SashMat);
    f2LeftJamb.position.set(f2WinX, f2TotalH / 2, f2ZMax - f2FrameT / 2);
    const f2RightJamb = new THREE.Mesh(new THREE.BoxGeometry(f2Depth, f2TotalH, f2FrameT), f2SashMat);
    f2RightJamb.position.set(f2WinX, f2TotalH / 2, f2ZMin + f2FrameT / 2);

    // 50% Horizontal Center Transom Bar (dividing top 50% & bottom 50%)
    const f2MidTransom = new THREE.Mesh(new THREE.BoxGeometry(f2Depth + 6, 58, f2TotalW), f2SashMat);
    f2MidTransom.position.set(f2WinX, f2MidY, f2ZCenter);
    f2WinGroup.add(f2TopRail, f2BotSill, f2LeftJamb, f2RightJamb, f2MidTransom);

    // Bottom 50% Fixed Clear Glass Window (y: f2FrameT ~ f2MidY - 29)
    const f2BotGlassH = f2MidY - 29 - f2FrameT;
    const f2InnerW = f2TotalW - f2FrameT * 2;
    const f2FixedBotGlass = new THREE.Mesh(new THREE.BoxGeometry(16, f2BotGlassH, f2InnerW), f2GlassMat);
    f2FixedBotGlass.position.set(f2WinX, f2FrameT + f2BotGlassH / 2, f2ZCenter);
    f2WinGroup.add(f2FixedBotGlass);

    // Top 50% Outward Push-Open Awning Window (y: f2MidY + 29 ~ f2TotalH - f2FrameT)
    const f2TopAwningH = f2TotalH - f2FrameT - (f2MidY + 29);
    const f2AwningPivot = new THREE.Group();
    f2AwningPivot.position.set(f2WinX + 36, f2TotalH - f2FrameT, f2ZCenter);
    // Pushed all the way outward toward +X street side (~77 degrees open!)
    f2AwningPivot.rotation.z = 1.35;

    const f2SashT = 48;
    const f2AwTop = new THREE.Mesh(new THREE.BoxGeometry(60, f2SashT, f2InnerW - 8), f2SashMat);
    f2AwTop.position.set(0, -f2SashT / 2, 0);
    const f2AwBot = new THREE.Mesh(new THREE.BoxGeometry(60, f2SashT, f2InnerW - 8), f2SashMat);
    f2AwBot.position.set(0, -f2TopAwningH + f2SashT / 2, 0);
    const f2AwLeft = new THREE.Mesh(new THREE.BoxGeometry(60, f2TopAwningH, f2SashT), f2SashMat);
    f2AwLeft.position.set(0, -f2TopAwningH / 2, (f2InnerW - 8) / 2 - f2SashT / 2);
    const f2AwRight = new THREE.Mesh(new THREE.BoxGeometry(60, f2TopAwningH, f2SashT), f2SashMat);
    f2AwRight.position.set(0, -f2TopAwningH / 2, -(f2InnerW - 8) / 2 + f2SashT / 2);
    const f2AwGlass = new THREE.Mesh(
      new THREE.BoxGeometry(16, f2TopAwningH - f2SashT * 2, f2InnerW - f2SashT * 2 - 8),
      f2GlassMat
    );
    f2AwGlass.position.set(0, -f2TopAwningH / 2, 0);
    f2AwningPivot.add(f2AwTop, f2AwBot, f2AwLeft, f2AwRight, f2AwGlass);
    f2WinGroup.add(f2AwningPivot);

    // Left & Right Black Metal Stay Arms holding the 2F top 50% awning window wide open outward
    [f2ZMin + 90, f2ZMax - 90].forEach((armZ) => {
      const stayArm = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 860, 10), f2SashMat);
      stayArm.position.set(f2WinX + 360, f2TotalH - f2FrameT - 480, armZ);
      stayArm.rotation.z = -0.76;
      f2WinGroup.add(stayArm);
    });

    // Subtle exterior facade light for 2F window frame visibility
    const f2ExteriorLight = new THREE.PointLight(0xfff5e8, 0.85, 5200, 0);
    f2ExteriorLight.position.set(25200, 2200, f2ZCenter);
    f2WinGroup.add(f2ExteriorLight);

    dGroup.add(f2WinGroup);
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
      if (w.id === 'f2_east_window') return; // Replaced by 2F 50/50 Push-Out Front Glass Window
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
      if (w.id === 'f1_front_glass') return; // Replaced by 1F Storefront Exterior Facade (Photo 4)
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

    // 4-Legged Tubular Chrome & Cognac-Brown Leather Bar Chairs (pulled outside bar wall & countertop overhang)
    fData.stools.forEach((pt) => {
      let sx = pt[0];
      let sz = pt[1];
      let sRot = 0;
      if (fNum === 1) {
        if (pt[0] > 18000) {
          sx = 18520; // Outside side mosaic wall (x=18070) & countertop overhang (x=18220)
          sRot = Math.PI / 2; // Side L-bar seats face -X toward the side bar counter
        } else {
          sz = 3520; // Outside front mosaic wall (z=3060) & countertop overhang (z=3210)
          sRot = 0; // Front bar seats face -Z toward the front bar counter
        }
      } else if (fNum === 2) {
        sRot = Math.atan2(-(12850 - pt[0]), -(520 - pt[1])); // Face center of 2F semi-circular beer bar
      }
      const stool = createIndustrialMetalStool(sx, sz, sRot);
      fixGroup.add(stool);
    });

    // 4-Legged Tubular Chrome & Cognac-Brown Leather Dining Chairs at exact CAD chair coordinates
    const floorTables = fData.fixtures
      .filter((fx) => fx.type === 'table')
      .map((fx) => getPolyBounds(fx.poly));

    fData.chairs.forEach((pt) => {
      let rot = 0;
      if (floorTables.length > 0) {
        let nearest = floorTables[0];
        let minDist = Infinity;
        floorTables.forEach((tb) => {
          const d2 = (tb.cx - pt[0]) ** 2 + (tb.cz - pt[1]) ** 2;
          if (d2 < minDist) {
            minDist = d2;
            nearest = tb;
          }
        });
        const dx = nearest.cx - pt[0];
        const dz = nearest.cz - pt[1];
        if (Math.abs(dx) > Math.abs(dz)) {
          rot = dx > 0 ? -Math.PI / 2 : Math.PI / 2;
        } else {
          rot = dz > 0 ? Math.PI : 0;
        }
      }
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
    const pl = new THREE.PointLight(0xffdca8, 0.85, 6500, 0);
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
    } else if (preset === 'f1_facade') {
      eyeLevelMode = true;
      document.getElementById('toggle-eye-level').checked = true;
      setCeilingVisibility(true);
      updateFloorMode('all');
      // Street-level exterior perspective showing both 1F Entrance Facade & 2F 50/50 Push-Out Front Window
      camera.position.set(29800, 2500, 2500);
      controls.target.set(22000, 2650, 2500);
      banner.textContent = '🚪 1F·2F 전면 외관 시점: 1층 노출 콘크리트 파사드(우측 상단 프로젝트 창) + 2층 전면 통유리(상하 50% 분할 상단 개폐창)';
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
