// =====================================================================
// 스마트 분실물 키오스크 — 클라이언트 로직
// 모든 데이터는 이 파일 안의 IndexedDB 저장소(로컬 저장소 섹션)에
// 직접 저장됩니다. server.js/data.json은 더 이상 쓰이지 않으며,
// Node.js가 있는 PC에서 미리 테스트할 때만 선택적으로 쓰는 정적
// 파일 서버 + 그 초기 시드 참고용 파일로만 남아있습니다.
// =====================================================================

const API = {
  data: '/api/data',
  items: '/api/items',
  itemOne: (id) => `/api/items/${id}`,
  claim: (id) => `/api/items/${id}/claim`,
  meta: '/api/meta',
  reset: '/api/reset'
};

// =====================================================================
// 로컬 저장소 (IndexedDB)
// -----------------------------------------------------------------------
// 이 키오스크는 Localhost Lite처럼 "폴더를 그대로 정적 파일로 서빙"만
// 해주는 앱 위에서 돌아간다 — Node.js 같은 서버 실행 환경이 없다.
// 그래서 server.js(Node) API에 의존하지 않고, 브라우저 자체 저장소인
// IndexedDB에 직접 데이터를 영구 저장한다. 이 태블릿의 이 브라우저에
// 귀속된 저장소이며, 앱을 껐다 켜거나 새로고침해도 그대로 남아있다.
// (주의: 브라우저 데이터/캐시를 완전히 지우면 함께 삭제되므로, 관리자
// 화면의 "데이터 내보내기"로 주기적으로 백업하는 것을 권장한다.)
// =====================================================================
const DB_NAME = 'kiosk-db';
const DB_STORE = 'kv';
const DB_KEY = 'main';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(DB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function dbGet(key) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function dbSet(key, value) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function seedData() {
  return {
    settings: { managerPin: '2010' },
    meta: {
      categories: ['전자기기', '의류', '문구/학용품', '가방/지갑', '신발/실내화', '안경/액세서리', '체육용품', '도서/노트', '담요', '기타'],
      floors: ['1층', '2층', '3층', '4층'],
      rooms: {
        '1층': ['운동장', '보건실', '방송실', '화장실', '음악실', '미술실', '급식실', '복도', '위클래스(상담실)', '진덕숲도서관', '통합지원교육실', '계단'],
        '2층': ['진덕관', '교실', '복도', '화장실', '정보교육실1', '정보교육실2', '교육활동지원실1(자습실)', '1학년 상담실', '탈의실'],
        '3층': ['교실', '복도', '화장실', '교육활동지원실2(자습실)', '교과교실1', '교과교실2', '탈의실'],
        '4층': ['교실', '복도', '화장실', '과학실1', '과학실2', '과학실3', '융합교육실', '교육활동지원실3(자습실)', '교육활동지원실4(자습실)', '탈의실']
      },
      colors: ['빨강', '주황', '노랑', '연두', '초록', '하늘', '파랑', '남색', '보라', '분홍', '갈색', '베이지', '흰색', '회색', '검정', '은색', '금색'],
      materials: ['플라스틱', '금속', '가죽', '패브릭/천', '고무', '유리', '종이', '실리콘'],
      tags: ['이름표 있음', '스티커 있음', '케이스 있음', '손상 있음', '새 제품', '키링 달림'],
      contents: ['이어폰', '학생증', '지갑', '동전', '지폐', '화장품', '우산', '필기구', '카드류', '열쇠', '손수건', '충전기', '마스크', '간식/과자', '머리끈/핀'],
      hiddenTags: ['스크래치 있음', '얼룩 있음', '낙서 있음', '이름 적혀있음', '이니셜 있음', '찢어짐', '고유한 냄새', '수리한 흔적', '색 바램', '스티커 안쪽에 있음'],
      categorySubtypes: {
        '전자기기': ['핸드폰', '보조배터리', '태블릿', '이어폰/헤드폰', '스마트워치', '노트북', '계산기', '충전기/케이블', '기타'],
        '의류': ['상의', '하의', '외투/점퍼', '체육복', '모자', '장갑', '목도리', '기타'],
        '문구/학용품': ['필기구', '필통', '지우개/수정테이프', '자', '가위/풀', '파일/바인더', '기타'],
        '가방/지갑': ['백팩', '크로스백', '지갑', '파우치', '도시락가방', '기타'],
        '신발/실내화': ['운동화', '실내화', '슬리퍼', '구두', '기타'],
        '안경/액세서리': ['안경', '선글라스', '시계', '머리끈/핀', '목걸이/팔찌', '기타'],
        '체육용품': ['축구공', '농구공', '배드민턴채', '줄넘기', '물병', '기타'],
        '도서/노트': ['문제집', '교과서', '개인노트', '다이어리/플래너', '만화책/소설', '기타'],
        '기타': []
      },
      subtypeDetails: {
        '도서/노트|개인노트': ['스프링노트', '무선노트(제본)', '바인더노트', '연습장', '기타'],
        '전자기기|이어폰/헤드폰': ['유선 이어폰', '무선 이어폰', '헤드폰', '기타'],
        '문구/학용품|필기구': ['샤프', '볼펜', '연필', '형광펜', '기타']
      }
    },
    items: []
  };
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function genCode(items) {
  const used = new Set(items.map((i) => i.code));
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (used.has(code));
  return code;
}

let localStore = null;

async function ensureStoreLoaded() {
  if (localStore) return localStore;
  const saved = await dbGet(DB_KEY);
  localStore = saved || seedData();
  if (!saved) await dbSet(DB_KEY, localStore);
  return localStore;
}

// data.json 서버가 처리하던 것과 동일한 라우트를 IndexedDB에 저장된
// localStore에 대해 그대로 수행한다.
function localHandle(method, path, body) {
  const d = localStore;

  if (path === '/api/data' && method === 'GET') return { ok: true, data: d };

  if (path === '/api/items' && method === 'POST') {
    if (!body.name) return { ok: false, data: { error: '물품명이 필요합니다.' } };
    const item = {
      id: genId(), code: genCode(d.items), name: body.name,
      floor: body.floor || null, room: body.room || null, date: body.date || null,
      colors: Array.isArray(body.colors) ? body.colors : [], category: body.category || null,
      subtype: body.subtype || null, detail: body.detail || null,
      material: body.material || null, size: body.size || null, brand: body.brand || null,
      model: body.model || null, tags: Array.isArray(body.tags) ? body.tags : [],
      notes: body.notes || null, contents: Array.isArray(body.contents) ? body.contents : [], hiddenTags: Array.isArray(body.hiddenTags) ? body.hiddenTags : [], photo: body.photo || null,
      claimed: false, claimedBy: null, claimedAt: null, createdAt: new Date().toISOString()
    };
    d.items.push(item);
    return { ok: true, data: { item } };
  }

  const claimMatch = path.match(/^\/api\/items\/([^/]+)\/claim$/);
  if (claimMatch && method === 'POST') {
    const item = d.items.find((i) => i.id === claimMatch[1]);
    if (!item) return { ok: false, data: { error: '항목을 찾을 수 없습니다.' } };
    item.claimed = true; item.claimedBy = body.claimantName || null; item.claimedStudentId = body.claimantStudentId || null; item.claimedViaPicker = !!body.viaPicker; item.claimedAt = new Date().toISOString();
    return { ok: true, data: { item } };
  }

  const itemMatch = path.match(/^\/api\/items\/([^/]+)$/);
  if (itemMatch && method === 'PATCH') {
    const item = d.items.find((i) => i.id === itemMatch[1]);
    if (!item) return { ok: false, data: { error: '항목을 찾을 수 없습니다.' } };
    ['name', 'floor', 'room', 'date', 'colors', 'category', 'subtype', 'detail', 'material', 'size', 'brand', 'model', 'tags', 'notes', 'contents', 'hiddenTags', 'claimed', 'claimedBy', 'claimedStudentId'].forEach((k) => { if (k in body) item[k] = body[k]; });
    if (item.claimed === false) { item.claimedBy = null; item.claimedAt = null; }
    if (item.claimed === true && !item.claimedAt) item.claimedAt = new Date().toISOString();
    return { ok: true, data: { item } };
  }
  if (itemMatch && method === 'DELETE') {
    const before = d.items.length;
    d.items = d.items.filter((i) => i.id !== itemMatch[1]);
    if (d.items.length === before) return { ok: false, data: { error: '항목을 찾을 수 없습니다.' } };
    return { ok: true, data: { ok: true } };
  }

  if (path === '/api/meta' && method === 'POST') {
    if (body.field === 'rooms') {
      if (!d.meta.rooms[body.floor]) d.meta.rooms[body.floor] = [];
      if (!d.meta.rooms[body.floor].includes(body.value)) d.meta.rooms[body.floor].push(body.value);
    } else {
      if (!Array.isArray(d.meta[body.field])) return { ok: false, data: { error: '알 수 없는 field' } };
      if (!d.meta[body.field].includes(body.value)) d.meta[body.field].push(body.value);
    }
    return { ok: true, data: { meta: d.meta } };
  }

  if (path === '/api/reset' && method === 'POST') {
    localStore = seedData();
    return { ok: true, data: { ok: true } };
  }

  return { ok: false, data: { error: 'Unknown route' } };
}

// 화면 코드는 예전처럼 apiCall(method, path, body)로 호출한다 — 내부적으로
// 서버 통신 대신 IndexedDB를 쓰도록 바뀌었을 뿐, 호출부는 그대로다.
async function apiCall(method, path, body) {
  await ensureStoreLoaded();
  const result = localHandle(method, path, body);
  await dbSet(DB_KEY, localStore); // 변경 여부와 무관하게 항상 최신 상태를 저장 (데이터 양이 적어 비용이 크지 않음)
  if (method !== 'GET') maybeAutoBackup(); // 데이터가 바뀐 경우에만, 완료를 기다리지 않고 백그라운드로 실행
  return result;
}

// 백업/복원: IndexedDB는 브라우저 데이터를 지우면 함께 사라지므로,
// 관리자 화면에서 전체 데이터를 JSON 파일로 내보내고 다시 불러올 수 있게 한다.
function exportBackup(filename, silent) {
  const json = JSON.stringify(localStore, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `kiosk-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 일부 브라우저/웹뷰는 클릭 직후 곧바로 blob URL을 해제하면 다운로드가
  // 실제로 시작되기 전에 데이터가 사라져 실패할 수 있다 - 약간 늦춰서 해제한다.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  if (!silent) {
    showModal('', `내보내기를 시도했습니다 (${(blob.size / 1024).toFixed(1)}KB).\n다운로드 폴더를 확인해 주세요.\n\n만약 파일이 안 보이면, 이 브라우저/키오스크 앱이 파일 다운로드 자체를 지원하지 않는 것일 수 있습니다 — 아래 "화면에 직접 표시" 방법을 이용해 주세요.`);
  }
}

// 다운로드 자체가 막혀있는 브라우저/키오스크 앱을 위한 최후의 수단:
// 새 창 없이, 지금 화면 위에 바로 전체 백업 JSON 텍스트를 보여준다.
// 여기서 직접 길게 눌러 복사하거나, 눈으로 데이터가 실제로 있는지 확인할 수 있다.
function showBackupAsText() {
  const json = JSON.stringify(localStore, null, 2);
  document.getElementById('modalIcon').innerText = '';
  const content = document.getElementById('modalContent');
  content.innerHTML = '';
  const label = document.createElement('p');
  label.className = 'hint';
  label.style.marginBottom = '8px';
  label.innerText = `전체 데이터 (${(json.length / 1024).toFixed(1)}KB) — 길게 눌러 복사하세요.`;
  const textarea = document.createElement('textarea');
  textarea.value = json;
  textarea.readOnly = true;
  textarea.rows = 10;
  textarea.style.fontSize = '10px';
  textarea.style.width = '100%';
  content.appendChild(label);
  content.appendChild(textarea);
  document.getElementById('modalOverlay').classList.add('active');
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.meta || !parsed.items) throw new Error('형식이 올바르지 않습니다.');
      localStore = parsed;
      await dbSet(DB_KEY, localStore);
      await loadData();
      renderManagerList();
      showModal('', '백업 파일을 불러왔습니다.');
    } catch (e) {
      showModal('', '백업 파일을 읽을 수 없습니다.');
    }
  };
  reader.readAsText(file);
}

// =====================================================================
// 자동 백업
// -----------------------------------------------------------------------
// 웹페이지는 보안상 다운로드 폴더의 예전 파일을 직접 지울 수 없다. 대신:
//  1) 브라우저가 File System Access API를 지원하면(대부분의 데스크톱 크롬,
//     일부 최신 안드로이드 크롬) — 관리자가 파일을 한 번 지정해두면, 그 뒤로는
//     데이터가 바뀔 때마다 "같은 파일"을 그대로 덮어쓴다. 새 다운로드가
//     생기지 않고, 예전 내용이 최신 내용으로 대체되는 것과 사실상 동일하다.
//  2) 지원하지 않는 브라우저(대부분의 안드로이드 웹뷰)에서는, 이 방법이
//     불가능하므로 차선책으로 하루 최대 1회 자동으로 다운로드를 트리거한다.
//     이 경우 파일이 계속 쌓이므로, 가끔 다운로드 폴더를 정리해줘야 한다.
// =====================================================================
let backupHandle = null;

async function loadBackupHandle() {
  try {
    const handle = await dbGet('backupHandle');
    if (handle) backupHandle = handle;
  } catch (e) { /* 저장된 핸들 없음 - 무시 */ }
}

async function setupAutoBackupFile() {
  if (!window.showSaveFilePicker) {
    showModal('', '이 브라우저는 파일 자동 덮어쓰기를 지원하지 않습니다.\n(File System Access API 미지원 — 특히 안드로이드 웹뷰는 대부분 지원하지 않습니다)\n대신 "데이터 내보내기"로 수동 백업하시거나, "화면에 직접 표시"로 확인해 주세요.');
    return;
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'kiosk-backup.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    });
    backupHandle = handle;
    await dbSet('backupHandle', handle);
    const wrote = await writeAutoBackupToHandle();
    if (wrote) {
      showModal('', '자동 백업 파일이 설정되었습니다.\n이제부터 데이터가 바뀔 때마다 이 파일에 자동으로 덮어써서 저장됩니다.');
    } else {
      showModal('', '파일은 선택됐지만 쓰기 권한을 못 받았습니다. 다시 시도해 주세요.');
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // 사용자가 파일 선택을 취소함 - 정상, 조용히 무시
    // 그 외의 에러(브라우저/웹뷰가 이 기능 자체를 실제로는 지원 안 하는 경우 등)는 반드시 알려준다.
    showModal('', `자동 백업 파일 지정에 실패했습니다.\n(${e && e.name ? e.name : '알 수 없는 오류'}: ${e && e.message ? e.message : e})\n\n이 브라우저/키오스크 앱이 이 기능을 지원하지 않는 것일 수 있습니다. 대신 "데이터 내보내기"나 "화면에 직접 표시"를 이용해 주세요.`);
  }
}

async function writeAutoBackupToHandle() {
  if (!backupHandle) return false;
  try {
    let perm = await backupHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') perm = await backupHandle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return false;
    const writable = await backupHandle.createWritable();
    await writable.write(JSON.stringify(localStore, null, 2));
    await writable.close();
    return true;
  } catch (e) {
    return false;
  }
}

async function maybeAutoBackup() {
  const ok = await writeAutoBackupToHandle();
  if (ok) {
    lastLocalBackupAt = new Date().toISOString();
    await dbSet('lastLocalBackupAt', lastLocalBackupAt);
    updateLocalStatusDisplay();
  }
}

// =====================================================================
// [로컬 버전] 이 빌드는 인터넷/클라우드와 일절 통신하지 않습니다.
// 데이터는 전부 이 기기의 IndexedDB에만 저장되고, 원하면 "자동 백업 파일
// 지정"(File System Access API)으로 같은 기기 안의 파일 하나에도 계속
// 덮어써서 저장할 수 있습니다 — 이것도 완전히 로컬 동작이라 인터넷이
// 필요 없습니다.
// =====================================================================
let lastLocalBackupAt = null;

async function loadStatusTimestamps() {
  try { lastLocalBackupAt = await dbGet('lastLocalBackupAt'); } catch (e) { /* 저장된 값 없음 */ }
}

// 배터리 상태 (지원하는 브라우저에서만, 미지원이면 조용히 숨김)
// navigator.getBattery()는 Chromium 계열 + HTTPS(또는 localhost)에서만 동작한다.
// 계속 확인(폴링)하지 않고, OS가 배터리 상태 변화를 알려줄 때만 이벤트로 갱신되므로 비용이 거의 없다.
async function setupBatteryStatus() {
  if (!navigator.getBattery) return; // 미지원 브라우저 - 그냥 숨겨둔 채로 둠
  try {
    const battery = await navigator.getBattery();
    const update = () => {
      const el = document.getElementById('status-battery');
      if (el) el.innerText = `${Math.round(battery.level * 100)}%${battery.charging ? ' (충전중)' : ''}`;
    };
    update();
    battery.addEventListener('levelchange', update);
    battery.addEventListener('chargingchange', update);
    document.getElementById('status-battery-row').style.display = 'block';
  } catch (e) {
    // 지원 안 함/권한 없음 - 조용히 숨겨둔 채로 둠
  }
}

function formatRelativeTime(iso) {
  if (!iso) return '없음';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  const exact = new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  let rel;
  if (min < 1) rel = '방금 전';
  else if (min < 60) rel = `${min}분 전`;
  else {
    const hr = Math.floor(min / 60);
    rel = hr < 24 ? `${hr}시간 전` : `${Math.floor(hr / 24)}일 전`;
  }
  return `${rel} (${exact})`;
}

// 홈 화면 [키오스크 상태] 박스 갱신 — 전부 로컬 값만 보여준다. 서버 통신 없음.
function updateLocalStatusDisplay() {
  const fileEl = document.getElementById('status-backup-file');
  const timeEl = document.getElementById('status-backup-time');
  if (fileEl) fileEl.innerText = backupHandle ? '지정됨' : '미지정';
  if (timeEl) timeEl.innerText = formatRelativeTime(lastLocalBackupAt);
}

let state = {
  settings: { managerPin: '2010' },
  meta: { categories: [], floors: [], rooms: {}, colors: [], materials: [], tags: [] },
  items: [],
  reg: { colors: [], category: null, subtype: null, detail: null, material: null, tags: [], contents: [], hiddenTags: [], floor: null, room: null, date: null },
  narrow: null,
  challenge: null,
  managerEditId: null,
  managerEditClaimed: false
};

// ---------------------------------------------------------------
// 초기화 & 서버 통신
// ---------------------------------------------------------------
document.addEventListener('DOMContentLoaded', init);

// 태블릿 저장공간이 부족해질 때 브라우저가 이 사이트 데이터를 "덜 중요한
// 데이터"로 판단해 자동으로 지워버리지 않도록 "영구 저장"을 요청한다.
// 브라우저가 거부할 수도 있는 요청이라 100% 보장은 아니지만, 밑져야 본전인
// 안전장치라 시도해서 나쁠 게 없다.
async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    try { await navigator.storage.persist(); } catch (e) { /* 무시 - 실패해도 나머지 기능엔 영향 없음 */ }
  }
}

async function init() {
  await requestPersistentStorage();
  await loadBackupHandle();
  await loadStatusTimestamps();
  await loadData();
  setRegDateToday();
  renderRegisterPickers();
  showRegStep(1);
  updateLocalStatusDisplay();
  setupBatteryStatus();
}

async function loadData() {
  const { data } = await apiCall('GET', API.data);
  state.meta = data.meta;
  state.items = data.items;
  if (data.settings) state.settings = data.settings;
  updateHomeCount();
}

function updateHomeCount() {
  const count = state.items.filter((i) => !i.claimed).length;
  document.getElementById('display-count').innerText = count;
}

async function addMetaValue(field, value, floor) {
  const body = floor ? { field, value, floor } : { field, value };
  const { data } = await apiCall('POST', API.meta, body);
  if (data.meta) state.meta = data.meta;
}

// ---------------------------------------------------------------
// 화면 전환
// ---------------------------------------------------------------
function renderStepper(containerId, total, current) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  for (let i = 1; i <= total; i++) {
    const circle = document.createElement('div');
    circle.className = 'step-circle' + (i < current ? ' done' : i === current ? ' current' : '');
    circle.innerText = i;
    el.appendChild(circle);
    if (i < total) {
      const line = document.createElement('div');
      line.className = 'step-line' + (i < current ? ' done' : '');
      el.appendChild(line);
    }
  }
}

function navTo(view) {
  document.querySelectorAll('.view-section').forEach((s) => s.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.body.classList.toggle('theme-dark', view === 'home');
  if (view === 'register') resetRegisterForm();
  if (view === 'home') {
    updateLocalStatusDisplay();
  }
}

function showModal(icon, text) {
  document.getElementById('modalIcon').innerText = icon;
  document.getElementById('modalContent').innerText = text;
  document.getElementById('modalOverlay').classList.add('active');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

// 브라우저 기본 confirm()을 대신한다. 일부 키오스크 잠금 브라우저(FreeKiosk 등)는
// window.confirm() 같은 OS 레벨 팝업을 차단해서, 그냥 아무 반응 없이 조용히
// false를 반환해버리는 경우가 있다 — 그러면 "눌러도 아무 일도 안 일어나는" 것처럼
// 보인다. 그래서 우리가 직접 만든 모달로 확인을 받는다.
function showConfirm(text) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirmOverlay');
    document.getElementById('confirmContent').innerText = text;
    overlay.classList.add('active');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const cleanup = (result) => {
      overlay.classList.remove('active');
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      resolve(result);
    };
    okBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
  });
}

async function resetAllData() {
  if (!(await showConfirm('테스트로 등록된 모든 분실물과 커스텀 항목을 전부 삭제하고 초기 상태로 되돌립니다.\n(발표/시연 전 정리용 — 되돌릴 수 없습니다)\n\n계속할까요?'))) return;
  await apiCall('POST', API.reset);
  await loadData();
  renderRegisterPickers();
  navTo('home');
}

// ---------------------------------------------------------------
// 관리자 PIN 인증
// ---------------------------------------------------------------
function openManagerPin() {
  navTo('pin');
  const input = document.getElementById('pin-input');
  input.value = '';
  input.focus();
}

function submitPin() {
  const input = document.getElementById('pin-input');
  const entered = input.value.replace(/\D/g, '');
  if (entered === String(state.settings.managerPin || '2010').replace(/\D/g, '')) {
    input.value = '';
    openManager();
  } else {
    showModal('', 'PIN이 올바르지 않습니다.');
    input.value = '';
    input.focus();
  }
}

// ---------------------------------------------------------------
// 관리자 화면
// ---------------------------------------------------------------
async function openManager() {
  await loadData();
  navTo('manager');
  renderManagerList();
}

function exitManager() {
  navTo('home');
}

function estimatePhotoStorageMB(list) {
  // base64 문자열 길이 * 0.75 ≈ 실제 바이트 수 (base64는 원본보다 약 1.37배 커짐)
  const totalChars = list.reduce((sum, i) => sum + (i.photo ? i.photo.length : 0), 0);
  return (totalChars * 0.75) / (1024 * 1024);
}

function renderManagerList() {
  const list = state.items.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const unclaimedCount = list.filter((i) => !i.claimed).length;
  const storageMB = estimatePhotoStorageMB(list);
  document.getElementById('manager-summary').innerText = `전체 ${list.length}건 · 보관중 ${unclaimedCount}건 · 수령완료 ${list.length - unclaimedCount}건 · 사진 데이터 약 ${storageMB.toFixed(1)}MB`;

  const body = document.getElementById('manager-list');
  body.innerHTML = '';
  if (list.length === 0) {
    body.innerHTML = '<p class="manager-empty">등록된 항목이 없습니다.</p>';
    return;
  }
  list.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'manager-item-row';
    const descParts = [item.floor, item.room, item.category, (item.colors || []).join('/')].filter(Boolean);
    if (item.claimed && item.claimedBy) {
      const dot = item.claimedViaPicker ? '<span class="risk-dot" title="사진 선택 경로로 수령됨"></span>' : '';
      descParts.push(`수령: ${item.claimedBy}${item.claimedStudentId ? '(' + item.claimedStudentId + ')' : ''}${dot}`);
    }
    row.innerHTML = `
      <div class="manager-item-main">
        <div class="manager-item-title">${item.name} · ${item.code}</div>
        <div class="manager-item-desc">${descParts.join(' · ') || '정보 없음'}</div>
      </div>
      <span class="manager-item-badge ${item.claimed ? 'claimed' : ''}">${item.claimed ? '수령완료' : '보관중'}</span>
    `;
    row.onclick = () => openManagerEdit(item.id);
    body.appendChild(row);
  });

  const hasRisky = list.some((i) => i.claimedViaPicker);
  const existingHint = document.getElementById('risk-dot-hint');
  if (existingHint) existingHint.remove();
  if (hasRisky) {
    const hint = document.createElement('p');
    hint.id = 'risk-dot-hint';
    hint.style.fontSize = '10px';
    hint.style.color = 'var(--danger)';
    hint.style.marginTop = '8px';
    hint.innerHTML = '<span class="risk-dot"></span> 빨강 동그라미: 전부 "모르겠어요"로 답해도 사진 선택 화면이 뜹니다. 이 과정으로 가져간 사람에게는 표시됩니다.';
    body.appendChild(hint);
  }
}

function fillSelect(selectEl, values, selected) {
  selectEl.innerHTML = '';
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.innerText = '(없음)';
  selectEl.appendChild(noneOpt);
  values.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.innerText = v;
    if (v === selected) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

function onEditFloorChange() {
  const floor = document.getElementById('edit-floor').value;
  const rooms = state.meta.rooms[floor] || [];
  fillSelect(document.getElementById('edit-room'), rooms, null);
}

function onEditCategoryChange() {
  const category = document.getElementById('edit-category').value;
  const subtypes = state.meta.categorySubtypes[category] || [];
  fillSelect(document.getElementById('edit-subtype'), subtypes, null);
  onEditSubtypeChange();
}

function onEditSubtypeChange() {
  const category = document.getElementById('edit-category').value;
  const subtype = document.getElementById('edit-subtype').value;
  const details = state.meta.subtypeDetails[`${category}|${subtype}`] || [];
  fillSelect(document.getElementById('edit-detail'), details, null);
}

function toggleEditClaimed() {
  state.managerEditClaimed = !state.managerEditClaimed;
  const btn = document.getElementById('edit-claimed-toggle');
  btn.innerText = state.managerEditClaimed ? '수령완료 (탭하여 보관중으로 변경)' : '보관중 (탭하여 수령완료로 변경)';
  btn.classList.toggle('active', state.managerEditClaimed);
}

function openManagerEdit(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  state.managerEditId = id;
  state.managerEditClaimed = !!item.claimed;

  document.getElementById('edit-name').value = item.name || '';
  document.getElementById('edit-code').value = item.code || '';
  document.getElementById('edit-date').value = item.date || '';
  document.getElementById('edit-colors').value = (item.colors || []).join(', ');
  document.getElementById('edit-size').value = item.size || '';
  document.getElementById('edit-brand').value = item.brand || '';
  document.getElementById('edit-model').value = item.model || '';
  document.getElementById('edit-tags').value = (item.tags || []).join(', ');
  document.getElementById('edit-contents').value = (item.contents || []).join(', ');
  document.getElementById('edit-hidden-tags').value = (item.hiddenTags || []).join(', ');
  document.getElementById('edit-notes').value = item.notes || '';

  const photoPreview = document.getElementById('edit-photo-preview');
  const photoEmpty = document.getElementById('edit-photo-empty');
  if (item.photo) {
    photoPreview.src = item.photo;
    photoPreview.style.display = 'block';
    photoEmpty.style.display = 'none';
  } else {
    photoPreview.style.display = 'none';
    photoEmpty.style.display = 'block';
  }

  fillSelect(document.getElementById('edit-floor'), state.meta.floors, item.floor);
  fillSelect(document.getElementById('edit-room'), state.meta.rooms[item.floor] || [], item.room);
  fillSelect(document.getElementById('edit-category'), state.meta.categories, item.category);
  fillSelect(document.getElementById('edit-material'), state.meta.materials, item.material);
  fillSelect(document.getElementById('edit-subtype'), state.meta.categorySubtypes[item.category] || [], item.subtype);
  fillSelect(document.getElementById('edit-detail'), state.meta.subtypeDetails[`${item.category}|${item.subtype}`] || [], item.detail);

  const btn = document.getElementById('edit-claimed-toggle');
  btn.innerText = state.managerEditClaimed ? '수령완료 (탭하여 보관중으로 변경)' : '보관중 (탭하여 수령완료로 변경)';
  btn.classList.toggle('active', state.managerEditClaimed);

  document.getElementById('managerEditOverlay').classList.add('active');
}

function closeManagerEdit() {
  document.getElementById('managerEditOverlay').classList.remove('active');
  state.managerEditId = null;
}

async function saveManagerEdit() {
  if (!state.managerEditId) return;
  const body = {
    name: document.getElementById('edit-name').value.trim(),
    floor: document.getElementById('edit-floor').value || null,
    room: document.getElementById('edit-room').value || null,
    date: document.getElementById('edit-date').value || null,
    colors: document.getElementById('edit-colors').value.split(',').map((s) => s.trim()).filter(Boolean),
    category: document.getElementById('edit-category').value || null,
    subtype: document.getElementById('edit-subtype').value || null,
    detail: document.getElementById('edit-detail').value || null,
    material: document.getElementById('edit-material').value || null,
    size: document.getElementById('edit-size').value.trim() || null,
    brand: document.getElementById('edit-brand').value.trim() || null,
    model: document.getElementById('edit-model').value.trim() || null,
    tags: document.getElementById('edit-tags').value.split(',').map((s) => s.trim()).filter(Boolean),
    contents: document.getElementById('edit-contents').value.split(',').map((s) => s.trim()).filter(Boolean),
    hiddenTags: document.getElementById('edit-hidden-tags').value.split(',').map((s) => s.trim()).filter(Boolean),
    notes: document.getElementById('edit-notes').value.trim() || null,
    claimed: state.managerEditClaimed
  };
  await apiCall('PATCH', API.itemOne(state.managerEditId), body);
  await loadData();
  closeManagerEdit();
  renderManagerList();
}

async function deleteManagerItem() {
  if (!state.managerEditId) return;
  if (!(await showConfirm('이 항목을 삭제하시겠습니까? 되돌릴 수 없습니다.'))) return;
  await apiCall('DELETE', API.itemOne(state.managerEditId));
  await loadData();
  closeManagerEdit();
  renderManagerList();
}

// ---------------------------------------------------------------
// 공통: 칩 그룹 렌더러
// ---------------------------------------------------------------
const COLOR_HEX = {
  '빨강': '#E53935', '주황': '#FB8C00', '노랑': '#FDD835', '연두': '#9CCC65', '초록': '#43A047',
  '하늘': '#4FC3F7', '파랑': '#1E88E5', '남색': '#1A237E', '보라': '#8E24AA', '분홍': '#F48FB1',
  '갈색': '#6D4C41', '베이지': '#E8DCC8', '흰색': '#FFFFFF', '회색': '#9E9E9E', '검정': '#212121',
  '은색': '#C0C0C0', '금색': '#D4AF37'
};
function applyColorSwatch(btn, value) {
  if (COLOR_HEX[value]) {
    btn.classList.add('color-swatch');
    btn.style.backgroundColor = COLOR_HEX[value];
  }
}

function renderChipGroup(containerId, values, activeGetter, onToggle) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  values.forEach((v) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-row' + (activeGetter(v) ? ' active' : '');
    btn.innerText = v;
    btn.onclick = () => onToggle(v);
    applyColorSwatch(btn, v);
    el.appendChild(btn);
  });
}

function renderAddInline(containerId, onAdd, placeholder) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'link-btn';
  openBtn.innerText = '+ 새 항목 직접 입력';
  const row = document.createElement('div');
  row.className = 'add-inline';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder || '직접 입력';
  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.innerText = '추가';
  confirmBtn.onclick = () => {
    if (!input.value.trim()) return;
    onAdd(input.value.trim());
    input.value = '';
    row.classList.remove('open');
  };
  row.appendChild(input);
  row.appendChild(confirmBtn);
  openBtn.onclick = () => row.classList.toggle('open');
  el.appendChild(openBtn);
  el.appendChild(row);
}

// ---------------------------------------------------------------
// 등록 화면
// ---------------------------------------------------------------
function renderRegisterPickers() {
  // 층
  renderChipGroup('reg-floor-group', state.meta.floors, (v) => state.reg.floor === v, (v) => {
    state.reg.floor = v;
    state.reg.room = null;
    document.getElementById('reg-room-field').style.display = 'block';
    renderRegisterPickers(); // re-render all to reflect selection + room list
    requestAnimationFrame(() => {
      const roomField = document.getElementById('reg-room-field');
      if (roomField) roomField.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  if (state.reg.floor) {
    document.getElementById('reg-room-field').style.display = 'block';
    const rooms = state.meta.rooms[state.reg.floor] || [];
    renderChipGroup('reg-room-group', rooms, (v) => state.reg.room === v, (v) => {
      state.reg.room = v;
      renderRegisterPickers();
    });
  }

  // 색상 (다중)
  renderChipGroup('reg-color-group', state.meta.colors, (v) => state.reg.colors.includes(v), (v) => {
    const i = state.reg.colors.indexOf(v);
    if (i >= 0) state.reg.colors.splice(i, 1); else state.reg.colors.push(v);
    renderRegisterPickers();
  });

  // 분류 (단일 + 직접입력) -> 선택 시 세부종류로 이어짐
  renderChipGroup('reg-category-group', state.meta.categories, (v) => state.reg.category === v, (v) => {
    state.reg.category = v;
    state.reg.subtype = null;
    state.reg.detail = null;
    renderRegisterPickers();
    requestAnimationFrame(() => {
      const el = document.getElementById('reg-subtype-field');
      if (el && el.style.display !== 'none') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  renderAddInline('reg-category-add', async (val) => {
    await addMetaValue('categories', val);
    state.reg.category = val;
    state.reg.subtype = null;
    state.reg.detail = null;
    renderRegisterPickers();
  }, '예: 우산');

  // 세부 종류 (분류에 딸려있음, 선택 시 상세종류로 이어짐)
  const subtypeField = document.getElementById('reg-subtype-field');
  const subtypeOptions = state.reg.category ? (state.meta.categorySubtypes[state.reg.category] || []) : [];
  if (state.reg.category && subtypeOptions.length > 0) {
    subtypeField.style.display = 'block';
    renderChipGroup('reg-subtype-group', subtypeOptions, (v) => state.reg.subtype === v, (v) => {
      state.reg.subtype = v;
      state.reg.detail = null;
      renderRegisterPickers();
      requestAnimationFrame(() => {
        const el = document.getElementById('reg-detail-field');
        if (el && el.style.display !== 'none') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  } else {
    subtypeField.style.display = 'none';
  }

  // 더 자세히 (세부종류에 딸려있음, 일부 세부종류에만 존재)
  const detailField = document.getElementById('reg-detail-field');
  const detailKey = state.reg.category && state.reg.subtype ? `${state.reg.category}|${state.reg.subtype}` : null;
  const detailOptions = detailKey ? (state.meta.subtypeDetails[detailKey] || []) : [];
  if (detailKey && detailOptions.length > 0) {
    detailField.style.display = 'block';
    renderChipGroup('reg-detail-group', detailOptions, (v) => state.reg.detail === v, (v) => {
      state.reg.detail = v;
      renderRegisterPickers();
    });
  } else {
    detailField.style.display = 'none';
  }

  // 재질 (단일 + 직접입력)
  renderChipGroup('reg-material-group', state.meta.materials, (v) => state.reg.material === v, (v) => {
    state.reg.material = v;
    renderRegisterPickers();
  });
  renderAddInline('reg-material-add', async (val) => {
    await addMetaValue('materials', val);
    state.reg.material = val;
    renderRegisterPickers();
  }, '예: 나무');

  // 태그 (다중 + 직접입력)
  renderChipGroup('reg-tags-group', state.meta.tags, (v) => state.reg.tags.includes(v), (v) => {
    const i = state.reg.tags.indexOf(v);
    if (i >= 0) state.reg.tags.splice(i, 1); else state.reg.tags.push(v);
    renderRegisterPickers();
  });
  renderAddInline('reg-tags-add', async (val) => {
    await addMetaValue('tags', val);
    state.reg.tags.push(val);
    renderRegisterPickers();
  }, '예: 그림 있음');

  // 내용물 (다중 + 직접입력) — 본인확인 문제용
  renderChipGroup('reg-contents-group', state.meta.contents, (v) => state.reg.contents.includes(v), (v) => {
    const i = state.reg.contents.indexOf(v);
    if (i >= 0) state.reg.contents.splice(i, 1); else state.reg.contents.push(v);
    renderRegisterPickers();
  });
  renderAddInline('reg-contents-add', async (val) => {
    await addMetaValue('contents', val);
    state.reg.contents.push(val);
    renderRegisterPickers();
  }, '예: 손거울');

  // 숨겨진 특징·흠집 (다중 + 직접입력) — 본인확인 문제용
  renderChipGroup('reg-hidden-group', state.meta.hiddenTags, (v) => state.reg.hiddenTags.includes(v), (v) => {
    const i = state.reg.hiddenTags.indexOf(v);
    if (i >= 0) state.reg.hiddenTags.splice(i, 1); else state.reg.hiddenTags.push(v);
    renderRegisterPickers();
  });
  renderAddInline('reg-hidden-add', async (val) => {
    await addMetaValue('hiddenTags', val);
    state.reg.hiddenTags.push(val);
    renderRegisterPickers();
  }, '예: 모서리 깨짐');
}

function setRegDateToday() {
  const d = new Date();
  state.reg.date = d.toISOString().slice(0, 10);
  document.getElementById('btn-date-today').classList.add('active');
  document.getElementById('btn-date-pick').classList.remove('active');
  document.getElementById('reg-date-manual').classList.remove('open');
}

function openDatePicker() {
  document.getElementById('btn-date-today').classList.remove('active');
  document.getElementById('btn-date-pick').classList.add('active');
  const input = document.getElementById('reg-date-manual');
  input.classList.add('open');
  if (input.showPicker) { input.showPicker(); } else { input.focus(); }
}

function setRegDateManual(value) {
  if (!value) return;
  state.reg.date = value;
  document.getElementById('btn-date-today').classList.remove('active');
  document.getElementById('btn-date-pick').classList.add('active');
}

function readFileAsDataURL(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// 태블릿 저장공간 절약: 원본 사진(장당 수 MB)을 그대로 저장하지 않고,
// 최대 900px 폭으로 축소 + JPEG 70% 압축해서 저장한다 (장당 대략 수십~150KB 수준).
// 본인확인 사진은 "알아볼 수 있는 정도"면 충분하므로 화질 손실은 문제되지 않는다.
function compressImageFile(file, maxDim = 900, quality = 0.7) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(reader.result); // 압축 실패 시 원본이라도 사용
      img.src = reader.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function showRegStep(n) {
  document.querySelectorAll('#view-register .step-panel').forEach((p) => p.classList.remove('active'));
  document.getElementById('reg-step-' + n).classList.add('active');
  state.regStep = n;
  renderStepper('reg-stepper', 4, n);
  document.getElementById('reg-prev-btn').style.visibility = n === 1 ? 'hidden' : 'visible';
  document.getElementById('reg-next-btn').innerText = n === 4 ? '등록 완료' : '다음';
}

function regValidateStep(n) {
  if (n === 1 && !document.getElementById('reg-name').value.trim()) {
    showModal('', '물품명을 입력해 주세요.');
    return false;
  }
  if (n === 2 && !state.reg.floor) {
    showModal('', '습득 층을 선택해 주세요.');
    return false;
  }
  if (n === 4) {
    const photoInput = document.getElementById('reg-photo');
    if (!photoInput.files || photoInput.files.length === 0) {
      showModal('', '분실물 사진을 촬영해 주세요. (필수)');
      return false;
    }
  }
  return true;
}

function onRegPhotoChange() {
  const input = document.getElementById('reg-photo');
  const preview = document.getElementById('reg-photo-preview');
  const captureBtn = document.getElementById('reg-photo-btn');
  const retakeBtn = document.getElementById('reg-photo-retake');
  const file = input.files[0];
  if (!file) {
    preview.style.display = 'none'; preview.src = '';
    captureBtn.style.display = 'block'; retakeBtn.style.display = 'none';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    preview.src = reader.result;
    preview.style.display = 'block';
    captureBtn.style.display = 'none';
    retakeBtn.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function regNextStep() {
  if (!regValidateStep(state.regStep)) return;
  if (state.regStep === 4) { submitRegistration(); return; }
  showRegStep(state.regStep + 1);
}

function regPrevStep() {
  if (state.regStep === 1) { navTo('home'); return; }
  showRegStep(state.regStep - 1);
}

async function submitRegistration() {
  const name = document.getElementById('reg-name').value.trim();
  if (!name) { showModal('', '물품명을 입력해 주세요.'); return; }
  if (!state.reg.floor) { showModal('', '습득 층을 선택해 주세요.'); return; }

  const photoFile = document.getElementById('reg-photo').files[0];
  if (!photoFile) { showModal('', '분실물 사진을 촬영해 주세요. (필수)'); return; }
  const photo = await compressImageFile(photoFile);

  const body = {
    name,
    floor: state.reg.floor,
    room: state.reg.room,
    date: state.reg.date,
    colors: state.reg.colors,
    category: state.reg.category,
    subtype: state.reg.subtype,
    detail: state.reg.detail,
    material: state.reg.material,
    size: document.getElementById('reg-size').value.trim() || null,
    model: document.getElementById('reg-model').value.trim() || null,
    tags: state.reg.tags,
    notes: document.getElementById('reg-notes').value.trim() || null,
    contents: state.reg.contents,
    hiddenTags: state.reg.hiddenTags,
    photo
  };

  const { ok, data: out } = await apiCall('POST', API.items, body);
  if (!ok) { showModal('', out.error || '등록에 실패했습니다.'); return; }

  await loadData();
  resetRegisterForm();
  showModal('', `등록이 완료됐습니다.\n보관 코드: ${out.item.code}\n\n이 코드를 물건에 표시해 보관해 주세요.`);
  navTo('home');
}

function resetRegisterForm() {
  document.getElementById('reg-name').value = '';
  document.getElementById('reg-size').value = '';
  document.getElementById('reg-model').value = '';
  document.getElementById('reg-notes').value = '';
  document.getElementById('reg-photo').value = '';
  document.getElementById('reg-photo-preview').style.display = 'none';
  document.getElementById('reg-photo-preview').src = '';
  document.getElementById('reg-photo-btn').style.display = 'block';
  document.getElementById('reg-photo-retake').style.display = 'none';
  document.getElementById('reg-date-manual').value = '';
  document.getElementById('reg-room-field').style.display = 'none';
  state.reg = { colors: [], category: null, subtype: null, detail: null, material: null, tags: [], contents: [], hiddenTags: [], floor: null, room: null, date: null };
  setRegDateToday();
  renderRegisterPickers();
  showRegStep(1);
}

// ---------------------------------------------------------------
// 찾기: ① 엘리미네이션(후보 좁히기)
// ---------------------------------------------------------------
const NARROW_FIELDS = [
  { key: 'floor', label: '어느 층에서 잃어버리셨나요?', metaKey: 'floors', multi: false },
  { key: 'room', label: '그 층에서 정확히 어디였나요?', metaKey: null, multi: false, dependsOn: 'floor' },
  { key: 'category', label: '어떤 종류의 물건이었나요?', metaKey: 'categories', multi: false },
  { key: 'subtype', label: '그중에서도 어떤 종류였나요?', metaKey: null, multi: false, dependsOn: 'category' },
  { key: 'detail', label: '조금 더 자세히 말하면요?', metaKey: null, multi: false, dependsOn: 'subtype' },
  { key: 'colors', label: '어떤 색이 있었나요?', metaKey: 'colors', multi: true },
  { key: 'material', label: '어떤 재질이었나요?', metaKey: 'materials', multi: false },
  { key: 'tags', label: '특별한 특징이 있었나요?', metaKey: 'tags', multi: true }
];

function startFindFlow() { navTo('find'); }

function beginVerification() {
  const pool = state.items.filter((i) => !i.claimed);
  if (pool.length === 0) {
    showModal('', '현재 보관 중인 분실물이 없습니다.');
    navTo('home');
    return;
  }
  state.narrow = { fieldIndex: 0, candidates: pool, answers: {} };
  state.candidatePicker = null;
  state.photoAlreadyConfirmed = false;
  state.photoConfirmItem = null;
  state.claimedViaPicker = false;
  navTo('narrow');
  renderNarrowQuestion();
}

function getNarrowOptionValues(field) {
  if (field.key === 'room') return state.meta.rooms[state.narrow.answers.floor] || [];
  if (field.key === 'subtype') return state.meta.categorySubtypes[state.narrow.answers.category] || [];
  if (field.key === 'detail') {
    const dKey = `${state.narrow.answers.category}|${state.narrow.answers.subtype}`;
    return state.meta.subtypeDetails[dKey] || [];
  }
  return state.meta[field.metaKey] || [];
}

function currentNarrowField() {
  let idx = state.narrow.fieldIndex;
  while (idx < NARROW_FIELDS.length) {
    const f = NARROW_FIELDS[idx];
    if (f.dependsOn && !state.narrow.answers[f.dependsOn]) { idx++; continue; }
    if (getNarrowOptionValues(f).length === 0) { idx++; continue; }
    return { field: f, idx };
  }
  return null;
}

function renderNarrowQuestion() {
  if (state.narrow.candidates.length <= 1) return finishNarrowing();
  const found = currentNarrowField();
  if (!found) return finishNarrowing();
  const { field } = found;

  document.getElementById('narrow-question').innerText = field.label;
  renderStepper('narrow-stepper', NARROW_FIELDS.length, found.idx + 1);

  const body = document.getElementById('narrow-body');
  body.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'question-card';

  const optionValues = getNarrowOptionValues(field);

  const selected = field.multi ? [] : null;
  const grid = document.createElement('div');
  grid.className = 'option-grid' + (['room', 'colors', 'subtype', 'detail'].includes(field.key) ? ' wrap-chips' : '');

  function renderOptions() {
    grid.innerHTML = '';
    optionValues.forEach((v) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-btn';
      const isSel = field.multi ? selected.includes(v) : selected === v;
      if (isSel) btn.classList.add('selected');
      btn.innerText = v;
      applyColorSwatch(btn, v);
      btn.onclick = () => {
        if (field.multi) {
          const i = selected.indexOf(v);
          if (i >= 0) selected.splice(i, 1); else selected.push(v);
          renderOptions();
        } else {
          answerNarrow(field, v);
        }
      };
      grid.appendChild(btn);
    });
    const unknownBtn = document.createElement('button');
    unknownBtn.type = 'button';
    unknownBtn.className = 'option-btn unknown';
    unknownBtn.innerText = '모르겠어요';
    unknownBtn.onclick = () => answerNarrow(field, null);
    grid.appendChild(unknownBtn);
  }
  renderOptions();
  card.appendChild(grid);

  if (field.multi) {
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'submit-btn';
    nextBtn.style.marginTop = '14px';
    nextBtn.innerText = '선택 완료';
    nextBtn.onclick = () => answerNarrow(field, selected.length ? selected : null);
    card.appendChild(nextBtn);
  }

  // 직접 입력 (목록에 없는 답 대응)
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'custom-toggle';
  toggleBtn.innerText = '목록에 없어요 · 직접 입력';
  const row = document.createElement('div');
  row.className = 'custom-input-row';
  const input = document.createElement('input');
  input.type = 'text';
  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.innerText = '확인';
  okBtn.onclick = () => { if (input.value.trim()) answerNarrow(field, input.value.trim()); };
  row.appendChild(input); row.appendChild(okBtn);
  toggleBtn.onclick = () => row.classList.toggle('open');
  card.appendChild(toggleBtn);
  card.appendChild(row);

  body.appendChild(card);
}

function matchesField(item, key, value) {
  if (value === null) return true; // 모름 -> 필터링 안 함
  if (Array.isArray(value)) {
    const itemVals = Array.isArray(item[key]) ? item[key] : [];
    return value.some((v) => itemVals.includes(v));
  }
  if (Array.isArray(item[key])) return item[key].includes(value);
  return item[key] === value;
}

function answerNarrow(field, value) {
  state.narrow.answers[field.key] = value;
  if (value !== null) {
    state.narrow.candidates = state.narrow.candidates.filter((it) => matchesField(it, field.key, value));
  }
  // 다음 필드로
  const curIdx = NARROW_FIELDS.findIndex((f) => f.key === field.key);
  state.narrow.fieldIndex = curIdx + 1;
  renderNarrowQuestion();
}

function finishNarrowing() {
  const candidates = state.narrow.candidates;
  if (candidates.length === 0) {
    navTo('fail');
    return;
  }
  if (candidates.length === 1) {
    // 후보가 하나면 바로 본인확인 퀴즈로. 통과 후 사진으로 마지막 확인.
    state.candidatePicker = null;
    state.photoAlreadyConfirmed = false;
    startChallenge(candidates[0]);
    return;
  }
  // 후보가 여럿이면(위치/날짜 등을 몰라 다 좁혀지지 않은 경우) 퀴즈보다 먼저
  // 사진을 보고 직접 골라보게 한다 — 위치·날짜를 몰라도 사진은 알아볼 수 있으므로.
  state.candidatePicker = { candidates: candidates.slice(), attemptsLeft: 2 };
  renderCandidatePhotoPicker();
  navTo('candidatephotos');
}

function renderCandidatePhotoPicker() {
  const body = document.getElementById('candidate-photos-body');
  body.innerHTML = '';
  state.candidatePicker.candidates.forEach((item) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'candidate-photo-card';
    if (item.photo) {
      card.innerHTML = `<img src="${item.photo}" alt="후보 사진">`;
    } else {
      card.innerHTML = '<div class="candidate-photo-empty">사진 없음</div>';
    }
    card.onclick = () => selectCandidatePhoto(item);
    body.appendChild(card);
  });
}

function selectCandidatePhoto(item) {
  state.photoAlreadyConfirmed = true; // 이미 사진으로 골랐으므로 퀴즈 통과 후 다시 사진 확인을 묻지 않음
  state.claimedViaPicker = true; // 위치/날짜 등을 몰라 후보 여러 개 중 사진만 보고 골랐음을 기록 (관리자 확인용)
  startChallenge(item);
}

function candidatePickerNoMatch() {
  navTo('fail');
}

// ---------------------------------------------------------------
// 찾기: ② 최종 본인확인 챌린지 (5~7문항)
// ---------------------------------------------------------------
// 완전히 결정론적인 "키워드 매핑" 방식이다. 문장을 해석하거나 유사도를
// 판단하는 로직은 전혀 없다:
//  - 다중값 태그 필드(내용물/숨겨진 특징/특징/색상): 특정 키워드 하나를
//    골라 "이 물건에 OO가 있었나요?" 라고 묻고, 그 키워드가 등록된
//    배열에 실제로 들어있는지(true/false)만 그대로 비교한다.
//  - 단일값 필드(브랜드/모델/사이즈/재질/분류/층/위치): 등록된 값과
//    문자열이 정확히 같은지만 비교하는 객관식.
const TAG_FIELDS = ['contents', 'hiddenTags', 'tags', 'colors'];
const CHOICE_FIELDS = ['brand', 'model', 'subtype', 'detail', 'size', 'material', 'category', 'floor', 'room'];
const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 8;

const TAG_FIELD_LABELS = {
  contents: (kw) => `이 물건 안에 "${kw}"이(가) 있었나요?`,
  hiddenTags: (kw) => `이 물건에 "${kw}"라는 특징이 있었나요?`,
  tags: (kw) => `이 물건에 "${kw}"라는 특징이 있었나요?`,
  colors: (kw) => `이 물건에 "${kw}" 색이 있었나요?`
};
const CHOICE_FIELD_LABELS = {
  brand: '브랜드가 무엇이었나요?',
  model: '모델명이 무엇이었나요?',
  size: '사이즈/크기가 어떻게 되나요?',
  material: '재질이 무엇이었나요?',
  category: '어떤 종류의 물건이었나요?',
  subtype: '그중에서도 어떤 종류였나요?',
  detail: '조금 더 자세히 말하면요?',
  floor: '몇 층에서 잃어버리셨나요?',
  room: '정확히 어디였나요?'
};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 다중값 태그 필드용 예/아니오 문제 생성.
// 절반 확률로 이 물건이 실제로 가진 키워드(정답 "네")를, 절반 확률로
// 다른 물건은 갖고 있지만 이 물건은 갖고 있지 않은 키워드(정답 "아니요")를
// 골라 묻는다. 정답 판정은 "그 키워드가 item[field] 배열에 있는가"
// 하나뿐이다 — 표현이 비슷한지 따위는 전혀 보지 않는다.
function buildTagQuestion(item, field, allItems) {
  const ownArr = item[field] || [];
  const ownSet = new Set(ownArr);
  const wantTrue = Math.random() < 0.5;
  let keyword = null;

  if (wantTrue && ownArr.length > 0) {
    keyword = shuffle(ownArr)[0];
  } else {
    const otherPool = new Set();
    allItems.forEach((it) => {
      if (it.id === item.id) return;
      (it[field] || []).forEach((v) => { if (!ownSet.has(v)) otherPool.add(v); });
    });
    (state.meta[field] || []).forEach((v) => { if (!ownSet.has(v)) otherPool.add(v); });
    if (otherPool.size > 0) {
      keyword = shuffle([...otherPool])[0];
    } else if (ownArr.length > 0) {
      keyword = shuffle(ownArr)[0];
    }
  }
  if (!keyword) return null;

  const expectedYes = ownSet.has(keyword);
  return { field, keyword, expectedYes, label: TAG_FIELD_LABELS[field](keyword), yesNo: true };
}

// 단일값 필드용 객관식 문제 생성. 오답 보기는 다른 실제 등록 데이터에서
// 가져오고, 부족하면 meta 목록에서 채운다. 정답 판정은 문자열 완전 일치.
function buildChoiceQuestion(item, field, allItems) {
  const correct = item[field];
  if (!correct) return null;
  const metaPool = field === 'category' ? state.meta.categories : field === 'material' ? state.meta.materials
    : field === 'floor' ? state.meta.floors : field === 'room' ? (state.meta.rooms[item.floor] || [])
    : field === 'subtype' ? (state.meta.categorySubtypes[item.category] || [])
    : field === 'detail' ? (state.meta.subtypeDetails[`${item.category}|${item.subtype}`] || []) : null;

  let decoyPool = [];
  allItems.forEach((it) => {
    if (it.id === item.id) return;
    const v = it[field];
    if (v) decoyPool.push(v);
  });
  decoyPool = [...new Set(decoyPool)].filter((v) => v !== correct);
  if (decoyPool.length < 2 && metaPool) {
    decoyPool = [...new Set([...decoyPool, ...metaPool])].filter((v) => v !== correct);
  }
  const decoys = shuffle(decoyPool).slice(0, 2);
  const options = shuffle([correct, ...decoys]);

  return { field, label: CHOICE_FIELD_LABELS[field] || `${field}는 무엇이었나요?`, correct, options, yesNo: false };
}

function startChallenge(item) {
  const allItems = state.items;
  const questions = [];
  const priority = [...TAG_FIELDS, ...CHOICE_FIELDS];
  for (const f of priority) {
    if (questions.length >= MAX_QUESTIONS) break;
    const q = TAG_FIELDS.includes(f) ? buildTagQuestion(item, f, allItems) : buildChoiceQuestion(item, f, allItems);
    if (q) questions.push(q);
  }
  // 문항이 5개 미만이면(등록 정보가 부족한 경우) 요일 질문으로 최소 개수를 채운다
  if (questions.length < MIN_QUESTIONS && item.date) {
    const weekday = new Date(item.date).toLocaleDateString('ko-KR', { weekday: 'long' });
    if (weekday && weekday !== 'Invalid Date') {
      const allWeekdays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
      const decoys = shuffle(allWeekdays.filter((w) => w !== weekday)).slice(0, 2);
      questions.push({ field: 'dateWeekday', label: '습득 날짜는 무슨 요일이었나요?', correct: weekday, options: shuffle([weekday, ...decoys]), yesNo: false });
    }
  }
  if (questions.length === 0) {
    // 정보가 거의 없는 경우: 바로 성공 처리하지 않고 층 질문 하나라도 강제 생성
    questions.push({ field: 'floor', label: '몇 층에서 잃어버리셨나요?', correct: item.floor, options: shuffle([item.floor, ...state.meta.floors.filter((f) => f !== item.floor)].slice(0, 3)), yesNo: false });
  }
  state.challenge = { item, questions, index: 0, correctCount: 0 };
  navTo('challenge');
  renderChallengeQuestion();
}

function renderChallengeQuestion() {
  const ch = state.challenge;
  const q = ch.questions[ch.index];
  document.getElementById('challenge-question').innerText = q.label;
  renderStepper('challenge-stepper', ch.questions.length, ch.index + 1);

  const body = document.getElementById('challenge-body');
  body.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'question-card';
  const grid = document.createElement('div');
  grid.className = 'option-grid';

  if (q.yesNo) {
    const yesBtn = document.createElement('button');
    yesBtn.type = 'button';
    yesBtn.className = 'option-btn';
    yesBtn.innerText = '네, 맞아요';
    yesBtn.onclick = () => submitChallengeAnswer(true);
    grid.appendChild(yesBtn);

    const noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'option-btn';
    noBtn.innerText = '아니요';
    noBtn.onclick = () => submitChallengeAnswer(false);
    grid.appendChild(noBtn);

    const unknownBtn = document.createElement('button');
    unknownBtn.type = 'button';
    unknownBtn.className = 'option-btn unknown';
    unknownBtn.innerText = '모르겠어요';
    unknownBtn.onclick = () => submitChallengeAnswer(null);
    grid.appendChild(unknownBtn);

    card.appendChild(grid);
    body.appendChild(card);
    return;
  }

  q.options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-btn';
    btn.innerText = opt;
    btn.onclick = () => submitChallengeAnswer(opt);
    grid.appendChild(btn);
  });
  const unknownBtn = document.createElement('button');
  unknownBtn.type = 'button';
  unknownBtn.className = 'option-btn unknown';
  unknownBtn.innerText = '모르겠습니다';
  unknownBtn.onclick = () => submitChallengeAnswer(null);
  grid.appendChild(unknownBtn);
  card.appendChild(grid);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'custom-toggle';
  toggleBtn.innerText = '목록에 없어요 · 직접 입력';
  const row = document.createElement('div');
  row.className = 'custom-input-row';
  const input = document.createElement('input');
  input.type = 'text';
  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.innerText = '확인';
  okBtn.onclick = () => { if (input.value.trim()) submitChallengeAnswer(input.value.trim()); };
  row.appendChild(input); row.appendChild(okBtn);
  toggleBtn.onclick = () => row.classList.toggle('open');
  card.appendChild(toggleBtn);
  card.appendChild(row);

  body.appendChild(card);
}

function submitChallengeAnswer(answer) {
  const ch = state.challenge;
  const q = ch.questions[ch.index];
  if (answer !== null) {
    const isCorrect = q.yesNo
      ? answer === q.expectedYes
      : String(answer).trim().toLowerCase() === String(q.correct).trim().toLowerCase();
    if (isCorrect) ch.correctCount++;
  }
  ch.index++;
  if (ch.index >= ch.questions.length) {
    const passed = ch.correctCount >= Math.ceil(ch.questions.length * 0.75) || ch.correctCount >= ch.questions.length - 1;
    if (passed) {
      if (state.photoAlreadyConfirmed) {
        // 후보 사진 선택 화면에서 이미 눈으로 확인했으므로 다시 묻지 않고 바로 성공 처리
        showSuccess(ch.item);
      } else {
        startPhotoConfirm(ch.item);
      }
    } else if (state.candidatePicker) {
      // 후보가 여럿이던 경우: 방금 후보를 제외하고 남은 후보가 있으면 다시 골라볼 기회를 준다 (남용 방지를 위해 횟수 제한)
      state.candidatePicker.candidates = state.candidatePicker.candidates.filter((c) => c.id !== ch.item.id);
      if (state.candidatePicker.attemptsLeft > 0 && state.candidatePicker.candidates.length > 0) {
        state.candidatePicker.attemptsLeft--;
        showModal('', '본인확인에 실패했어요.\n다른 후보에서 다시 골라보세요.');
        renderCandidatePhotoPicker();
        navTo('candidatephotos');
      } else {
        navTo('fail');
      }
    } else {
      navTo('fail');
    }
    return;
  }
  renderChallengeQuestion();
}

// ---------------------------------------------------------------
// 찾기: ③ 사진으로 최종 확인
// -----------------------------------------------------------------------
// 후보가 여럿이었던 경우는 이미 챌린지 전 candidatePicker 단계에서 사진으로
// 골랐으므로 이 단계까지 오지 않는다(state.photoAlreadyConfirmed로 건너뜀).
// 여기 도달하는 건 애초에 후보가 하나뿐이었던 경우라, "아니요"를 눌러도
// 보여줄 다른 후보가 없다.
// ---------------------------------------------------------------
function startPhotoConfirm(item) {
  if (!item.photo) {
    // 사진이 없는 예전 데이터는 사진 확인을 건너뛰고 바로 성공 처리
    showSuccess(item);
    return;
  }
  state.photoConfirmItem = item;
  renderPhotoConfirm(item);
  navTo('photoconfirm');
}

function renderPhotoConfirm(item) {
  document.getElementById('photoconfirm-img').src = item.photo;
}

function confirmPhotoYes() {
  showSuccess(state.photoConfirmItem);
}

function confirmPhotoNo() {
  // 후보가 하나뿐이었던 경우라 더 보여줄 다른 후보가 없다
  navTo('fail');
}

function showSuccess(item) {
  state.matchedItem = item;
  document.getElementById('result-name').innerText = item.name;
  document.getElementById('result-code').innerText = item.code;
  document.getElementById('claimant-name').value = '';
  document.getElementById('claimant-studentid').value = '';
  validateClaimForm();
  navTo('success');
}

// 이름: 한글/영문만, 2자 이상 (숫자·공백·특수문자 전부 불가)
const CLAIMANT_NAME_RE = /^[A-Za-z가-힣]{2,}$/;
// 학번: 숫자 5자리
const CLAIMANT_STUDENTID_RE = /^\d{5}$/;

function validateClaimForm() {
  const name = document.getElementById('claimant-name').value;
  const studentId = document.getElementById('claimant-studentid').value;
  const nameValid = CLAIMANT_NAME_RE.test(name);
  const studentIdValid = CLAIMANT_STUDENTID_RE.test(studentId);

  const hint = document.getElementById('claimant-name-hint');
  hint.classList.toggle('hint-error', name.length > 0 && !nameValid);

  const btn = document.getElementById('finalize-claim-btn');
  btn.disabled = !(nameValid && studentIdValid);
  return nameValid && studentIdValid;
}

async function finalizeClaim() {
  if (!validateClaimForm()) return;
  const name = document.getElementById('claimant-name').value.trim();
  const studentId = document.getElementById('claimant-studentid').value.trim();
  const item = state.matchedItem;
  await apiCall('POST', API.claim(item.id), { claimantName: name, claimantStudentId: studentId, viaPicker: !!state.claimedViaPicker });
  await loadData();
  showModal('', `${name}님, 확인되었습니다.\n행정실에서 보관 코드 ${item.code}를 보여주시면 물건을 받으실 수 있습니다.`);
  navTo('home');
}
