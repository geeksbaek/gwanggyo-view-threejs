// ───────────── which building / park / amenity is under the cursor (analytic ray vs. footprint prisms + landmarks)
const PICK = {};
function initPick() {
  const off = arr('b_off'), xy = arr('b_xy'), bh = arr('b_h'), bb = arr('b_base'), bk = arr('b_kind');
  const bf = W.idx.b_fl ? arr('b_fl') : null;
  const N = bh.length, c = new Float32Array(N * 5);
  for (let i = 0; i < N; i++) {
    let cx = 0, cz = 0; const n = off[i + 1] - off[i];
    for (let v = off[i]; v < off[i + 1]; v++) { cx += xy[v * 2] / 4; cz += xy[v * 2 + 1] / 4; }
    cx /= n; cz /= n;
    let r = 0;
    for (let v = off[i]; v < off[i + 1]; v++) r = Math.max(r, Math.hypot(xy[v * 2] / 4 - cx, xy[v * 2 + 1] / 4 - cz));
    const y0 = bb[i] / 10 - 0.5;
    c.set([cx, cz, r, y0, y0 + bh[i] / 10], i * 5);
  }
  // Exact sub-meter amenity coordinates mapped 1:1 from official 단지배치도!
  const U2S = (u, v) => [-0.25210532 * u + 0.20415737 * v - 14.13187687, -0.20250471 * u - 0.25586374 * v + 196.07265457];
  const mkAm = (name, sub, u, v, r) => { const [x, z] = U2S(u, v); return { name, sub, x, z, r }; };
  const amenities = [
    mkAm('주출입구 문주 · 회전광장 · 지하주차장 램프', '32m 도로 진입부', 330, 960, 22),
    mkAm('부출입구 · 부채꼴 지하주차장 램프', '51.5m 도로(법원지하차도) 진입부', 225, 424, 20),
    mkAm('근린생활시설 (B1F)', '단지 내 스트리트 상가', 396, 978, 16),
    mkAm('키즈&맘스라운지 (B1F)', '가족형 놀이·문화공간', 286, 948, 14),
    mkAm('센트레 라이브러리 · 다 함께 돌봄센터 (B1F)', '작은도서관 · 돌봄센터', 192, 875, 16),
    mkAm('센트웰 듀플렉스 피트니스 · 스크린 골프 라운지', 'B1~B2F 다목적 체육관 · 골프연습장', 208, 768, 16),
    mkAm('센트웰 스테이 (게스트하우스 B1F)', '프라이빗 게스트하우스 · 선큰 라운지', 248, 636, 15),
    mkAm('① 비스타애비뉴 · 벽천 폭포 · 옆 계단', '시퀀스형 중심 가로 · 누드 엘리베이터', 274, 608, 18),
    mkAm('블루아트갤러리 · 블라썸가든', '수경 정원 · 벚나무 가로수길', 368, 514, 20),
    mkAm('웰컴라운지 (1F) · 석가산 폭포', '단지 입구 티하우스 · 수경 연못', 360, 856, 18),
    mkAm('② 센트레 커넥트 파크', '단지 중심 오픈 잔디마당', 390, 725, 24),
    mkAm('③ 펀 그라운드', '가족 통합형 모험·물놀이터', 608, 672, 26),
    mkAm('④ 그로잉 그라운드 · 어린이집 (1F)', 'KIDS VILLAGE · 열린 정원형 휴게공간', 438, 566, 20),
    mkAm('⑤ 아너스가든 · 아너스라운지 (경로당 1F)', 'SENIOR LOUNGE · 운동·텃밭 시니어 가든', 428, 386, 22),
    mkAm('보타닉라운지', '단지 북측 숲속 보타닉 쉼터', 505, 198, 20),
    mkAm('바이탈그라운드', '야외 배드민턴 코트 · 허브 치유정원', 658, 522, 22),
    mkAm('킨포크라운지', '1708~1709동 목재 티라운지 쉼터', 554, 848, 16),
  ];
  Object.assign(PICK, { c, off, xy, bk, bf, N, amenities, ray: new THREE.Raycaster(), v: new THREE.Vector2() });
}
function rayPrism(o, d, n, px, pz, y0, y1) {
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const ax = px(i), az = pz(i), j = (i + 1) % n, ex = px(j) - ax, ez = pz(j) - az, den = d.x * ez - d.z * ex; if (Math.abs(den) < 1e-9) continue;
    const t = ((ax - o.x) * ez - (az - o.z) * ex) / den, s = ((ax - o.x) * d.z - (az - o.z) * d.x) / den;
    if (t > 0 && t < best && s >= 0 && s <= 1) { const y = o.y + t * d.y; if (y >= y0 && y <= y1) best = t; }
  }
  if (d.y < 0 && o.y > y1) { const t = (y1 - o.y) / d.y; if (t < best) { const x = o.x + t * d.x, z = o.z + t * d.z; let c = false; for (let i = 0; i < n; i++) { const j = (i + 1) % n, z1 = pz(i), z2 = pz(j); if ((z1 > z) !== (z2 > z) && x < (px(j) - px(i)) * (z - z1) / (z2 - z1) + px(i)) c = !c; } if (c) best = t; } }
  return best;
}
function rayGround(o, d, maxT) {
  if (d.y >= -0.005) return null;
  let prevT = 0, prevH = o.y - groundY(o.x, o.z);
  const steps = 40;
  for (let s = 1; s <= steps; s++) {
    const f = s / steps, t = maxT * f * f;
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (Math.abs(x) > W.HN - 40 || Math.abs(z) > W.HN - 40) break;
    const h = y - groundY(x, z);
    if (h <= 0) {
      const a = prevH / Math.max(prevH - h, 1e-4);
      const th = lerp(prevT, t, a);
      return { t: th, x: o.x + d.x * th, z: o.z + d.z * th };
    }
    prevT = t; prevH = h;
  }
  return null;
}
function pickAt(cam, nx, ny, inside) {
  PICK.v.set(nx, ny); PICK.ray.setFromCamera(PICK.v, cam); const o = PICK.ray.ray.origin, d = PICK.ray.ray.direction;
  if (inside) { // allow picking through SE facade windows OR NE kitchen side window!
    let ok = false;
    if (d.z < -0.02) {
      const t = (0.1 - o.z) / d.z, x = o.x + t * d.x, y = o.y + t * d.y - FY;
      if (ROOMS.some(r => x > r.win[0] - 0.05 && x < r.win[1] + 0.05 && y > r.win[2] && y < r.win[3] + 0.1)) ok = true;
    }
    if (!ok && d.x < -0.02) {
      const t = (-1.9 - o.x) / d.x, z = o.z + t * d.z, y = o.y + t * d.y - FY;
      if (z > 6.20 && z < 6.94 && y > 0.90 && y < 2.15) ok = true;
    }
    if (!ok) return null;
  }
  const { c, off, xy, bk, bf, N } = PICK, h = Math.hypot(d.x, d.z); let best = Infinity, hit = -1, tower = null;
  for (let i = 0; i < N; i++) {
    const rx = c[i * 5] - o.x, rz = c[i * 5 + 1] - o.z, r = c[i * 5 + 2];
    if (h > 1e-3) { if (Math.abs(rx * d.z - rz * d.x) > r * h) continue; const al = (rx * d.x + rz * d.z) / h; if (al < -r || al / h > best + r) continue; }
    const a = off[i], t = rayPrism(o, d, off[i + 1] - a, k => xy[(a + k) * 2] / 4, k => xy[(a + k) * 2 + 1] / 4, c[i * 5 + 3], c[i * 5 + 4]);
    if (t < best) { best = t; hit = i; }
  }
  for (const tw of W.towers) {
    if (inside && tw.name === '1703') continue;
    const t = rayPrism(o, d, tw.p.length, k => tw.p[k][0], k => tw.p[k][1], -0.5, 0.9 + tw.levels * FLOOR_H + 2.2);
    if (t < best) { best = t; tower = tw; hit = -1; }
  }
  // Check terrain occlusion against buildings/towers
  if (best < Infinity) {
    for (let s = 0.15; s < 0.98; s += 0.12) {
      const t = best * s;
      if (o.y + t * d.y < groundY(o.x + t * d.x, o.z + t * d.z) - 2.2) { best = Infinity; hit = -1; tower = null; break; }
    }
  }
  if (tower) {
    const sub = tower.name === '1703' ? '우리 동 · 이 라인 ' + tower.levels + '층' : '이 라인 ' + tower.levels + '층';
    return { name: '광교 자연앤 센트레빌 ' + tower.name + '동', sub, dist: best };
  }
  if (hit >= 0) {
    const nm = W.names && W.names[W.bname[hit]];
    if (nm) {
      const fl = bf ? bf[hit] : 0;
      const k = bk[hit];
      const kindLab = k === 1 ? '아파트' : k === 4 ? '교육/공공' : k === 2 ? '상업/업무' : '';
      const sub = fl > 1 ? (fl + '층' + (kindLab && !nm.includes('아파트') && !nm.includes('학교') ? ' · ' + kindLab : '')) : kindLab;
      return { name: nm, sub, dist: best };
    }
  }
  // Fallback: check complex ground amenities & parks/lakes/tunnels on the ground!
  const gh = rayGround(o, d, Math.min(best, 4200));
  if (gh) {
    if (!inside || gh.t < 450) {
      for (const am of PICK.amenities) {
        if (Math.hypot(gh.x - am.x, gh.z - am.z) < am.r) return { name: am.name, sub: am.sub, dist: gh.t };
      }
    }
    if (W.landmarks) {
      let bestL = null, bestR = 1e9;
      for (const lm of W.landmarks) {
        const dl = Math.hypot(gh.x - lm.x, gh.z - lm.z);
        if (dl < lm.r && lm.r < bestR) { bestR = lm.r; bestL = lm; }
      }
      if (bestL) return { name: bestL.name, sub: bestL.sub, dist: gh.t };
    }
  }
  return null;
}
