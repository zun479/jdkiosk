// =====================================================================
// 스마트 분실물 키오스크 — 클라이언트 로직
// data.json 은 더 이상 localStorage 캐시가 아니라, 서버(server.js)가
// 실제로 읽고 쓰는 진짜 데이터 저장소입니다. 모든 등록/수령은 fetch로
// 서버 API를 호출해 파일에 기록됩니다.
// =====================================================================

const API = {
  data: '/api/data',
  items: '/api/items',
  claim: (id) => `/api/items/${id}/claim`,
  meta: '/api/meta',
  reset: '/api/reset'
};

let state = {
  meta: { categories: [], floors: [], rooms: {}, colors: [], materials: [], tags: [] },
  items: [],
  reg: { colors: [], category: null, material: null, tags: [], floor: null, room: null, date: null },
  narrow: null,
  challenge: null
};

// ---------------------------------------------------------------
// 초기화 & 서버 통신
// ---------------------------------------------------------------
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadData();
  setRegDateToday();
  renderRegisterPickers();
}

async function loadData() {
  const res = await fetch(API.data);
  const data = await res.json();
  state.meta = data.meta;
  state.items = data.items;
  updateHomeCount();
}

function updateHomeCount() {
  const count = state.items.filter((i) => !i.claimed).length;
  document.getElementById('display-count').innerText = count;
}

async function addMetaValue(field, value, floor) {
  const body = floor ? { field, value, floor } : { field, value };
  const res = await fetch(API.meta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const out = await res.json();
  if (out.meta) state.meta = out.meta;
}

// ---------------------------------------------------------------
// 화면 전환
// ---------------------------------------------------------------
function navTo(view) {
  document.querySelectorAll('.view-section').forEach((s) => s.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
}

function confirmLeave(from, to) {
  navTo(to);
}

function showModal(icon, text) {
  document.getElementById('modalIcon').innerText = icon;
  document.getElementById('modalContent').innerText = text;
  document.getElementById('modalOverlay').classList.add('active');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

async function resetAllData() {
  if (!confirm('테스트로 등록된 모든 분실물과 커스텀 항목을 전부 삭제하고 초기 상태로 되돌립니다.\n(발표/시연 전 정리용 — 되돌릴 수 없습니다)\n\n계속할까요?')) return;
  await fetch(API.reset, { method: 'POST' });
  await loadData();
  renderRegisterPickers();
  navTo('home');
}

// ---------------------------------------------------------------
// 공통: 칩 그룹 렌더러
// ---------------------------------------------------------------
function renderChipGroup(containerId, values, activeGetter, onToggle) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  values.forEach((v) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (activeGetter(v) ? ' active' : '');
    btn.innerText = v;
    btn.onclick = () => onToggle(v);
    el.appendChild(btn);
  });
}

function renderAddInline(containerId, onAdd, placeholder) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'chip chip-add';
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

  // 분류 (단일 + 직접입력)
  renderChipGroup('reg-category-group', state.meta.categories, (v) => state.reg.category === v, (v) => {
    state.reg.category = v;
    renderRegisterPickers();
  });
  renderAddInline('reg-category-add', async (val) => {
    await addMetaValue('categories', val);
    state.reg.category = val;
    renderRegisterPickers();
  }, '예: 우산');

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
}

function setRegDateToday() {
  const d = new Date();
  state.reg.date = d.toISOString().slice(0, 10);
  document.getElementById('btn-date-today').classList.add('active');
}
function setRegDateManual(value) {
  if (!value) return;
  state.reg.date = value;
  document.getElementById('btn-date-today').classList.remove('active');
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

async function submitRegistration() {
  const name = document.getElementById('reg-name').value.trim();
  if (!name) { showModal('✏️', '물품명을 입력해 주세요.'); return; }
  if (!state.reg.floor) { showModal('📍', '습득 층을 선택해 주세요.'); return; }

  const photoFile = document.getElementById('reg-photo').files[0];
  const photo = await readFileAsDataURL(photoFile);

  const body = {
    name,
    floor: state.reg.floor,
    room: state.reg.room,
    date: state.reg.date,
    colors: state.reg.colors,
    category: state.reg.category,
    material: state.reg.material,
    size: document.getElementById('reg-size').value.trim() || null,
    brand: document.getElementById('reg-brand').value.trim() || null,
    model: document.getElementById('reg-model').value.trim() || null,
    tags: state.reg.tags,
    notes: document.getElementById('reg-notes').value.trim() || null,
    photo
  };

  const res = await fetch(API.items, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const out = await res.json();
  if (!res.ok) { showModal('⚠️', out.error || '등록에 실패했습니다.'); return; }

  await loadData();
  resetRegisterForm();
  showModal('🏷️', `이름표가 완성됐어요!\n보관 코드: ${out.item.code}\n\n이 코드를 물건에 붙여 보관해 주세요.`);
  navTo('home');
}

function resetRegisterForm() {
  document.getElementById('reg-name').value = '';
  document.getElementById('reg-size').value = '';
  document.getElementById('reg-brand').value = '';
  document.getElementById('reg-model').value = '';
  document.getElementById('reg-notes').value = '';
  document.getElementById('reg-photo').value = '';
  document.getElementById('reg-room-field').style.display = 'none';
  state.reg = { colors: [], category: null, material: null, tags: [], floor: null, room: null, date: null };
  setRegDateToday();
  renderRegisterPickers();
}

// ---------------------------------------------------------------
// 찾기: ① 엘리미네이션(후보 좁히기)
// ---------------------------------------------------------------
const NARROW_FIELDS = [
  { key: 'category', label: '어떤 종류의 물건이었나요?', metaKey: 'categories', multi: false },
  { key: 'floor', label: '어느 층에서 잃어버리셨나요?', metaKey: 'floors', multi: false },
  { key: 'room', label: '그 층에서 정확히 어디였나요?', metaKey: null, multi: false, dependsOn: 'floor' },
  { key: 'colors', label: '어떤 색이 있었나요?', metaKey: 'colors', multi: true },
  { key: 'material', label: '어떤 재질이었나요?', metaKey: 'materials', multi: false },
  { key: 'tags', label: '특별한 특징이 있었나요?', metaKey: 'tags', multi: true }
];

function startFindFlow() { navTo('find'); }

function beginVerification() {
  const pool = state.items.filter((i) => !i.claimed);
  if (pool.length === 0) {
    showModal('📭', '현재 보관 중인 분실물이 없습니다.');
    navTo('home');
    return;
  }
  state.narrow = { fieldIndex: 0, candidates: pool, answers: {} };
  navTo('narrow');
  renderNarrowQuestion();
}

function currentNarrowField() {
  let idx = state.narrow.fieldIndex;
  while (idx < NARROW_FIELDS.length) {
    const f = NARROW_FIELDS[idx];
    if (f.dependsOn && !state.narrow.answers[f.dependsOn]) { idx++; continue; }
    return { field: f, idx };
  }
  return null;
}

function renderNarrowQuestion() {
  if (state.narrow.candidates.length <= 1) return finishNarrowing();
  const found = currentNarrowField();
  if (!found) return finishNarrowing();
  const { field } = found;

  document.getElementById('narrow-progress').innerText = `후보 ${state.narrow.candidates.length}개 · 특징으로 좁히는 중`;
  document.getElementById('narrow-question').innerText = field.label;

  const body = document.getElementById('narrow-body');
  body.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'question-card';

  const optionValues = field.key === 'room'
    ? (state.meta.rooms[state.narrow.answers.floor] || [])
    : state.meta[field.metaKey] || [];

  const selected = field.multi ? [] : null;
  const grid = document.createElement('div');
  grid.className = 'option-grid';

  function renderOptions() {
    grid.innerHTML = '';
    optionValues.forEach((v) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-btn';
      const isSel = field.multi ? selected.includes(v) : selected === v;
      if (isSel) btn.classList.add('selected');
      btn.innerText = v;
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
    startChallenge(candidates[0]);
    return;
  }
  renderCandidates(candidates.slice(0, 6));
  navTo('candidates');
}

function renderCandidates(list) {
  const body = document.getElementById('candidates-body');
  body.innerHTML = '';
  list.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'candidate-card';
    const descParts = [item.category, item.floor, item.room, (item.colors || []).join('/')].filter(Boolean);
    card.innerHTML = `<div class="cc-title">보관 코드 ${item.code}</div><div class="cc-desc">${descParts.join(' · ') || '정보 없음'}</div>`;
    card.onclick = () => startChallenge(item);
    body.appendChild(card);
  });
}

// ---------------------------------------------------------------
// 찾기: ② 최종 본인확인 챌린지 (4문항, 3개 이상 정답 필요)
// ---------------------------------------------------------------
const CHALLENGE_FIELD_PRIORITY = ['brand', 'model', 'size', 'material', 'colors', 'tags', 'category', 'floor', 'room'];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestionForField(item, field, allItems) {
  let correct, label, metaPool;
  if (field === 'colors' || field === 'tags') {
    const vals = item[field] || [];
    if (!vals.length) return null;
    correct = vals[Math.floor(Math.random() * vals.length)];
    metaPool = field === 'colors' ? state.meta.colors : state.meta.tags;
    label = field === 'colors' ? '이 물건에 포함된 색은 무엇이었나요?' : '이 물건의 특징으로 맞는 것은?';
  } else {
    correct = item[field];
    if (!correct) return null;
    const labels = {
      brand: '브랜드가 무엇이었나요?', model: '모델명이 무엇이었나요?', size: '사이즈/크기가 어떻게 되나요?',
      material: '재질이 무엇이었나요?', category: '어떤 종류의 물건이었나요?', floor: '몇 층에서 잃어버리셨나요?',
      room: '정확히 어디였나요?'
    };
    label = labels[field] || `${field}는 무엇이었나요?`;
    metaPool = field === 'category' ? state.meta.categories : field === 'material' ? state.meta.materials
      : field === 'floor' ? state.meta.floors : field === 'room' ? (state.meta.rooms[item.floor] || []) : null;
  }

  // 오답 후보: 다른 실제 등록 데이터에서 수집, 부족하면 meta 목록에서 채움
  let decoyPool = [];
  allItems.forEach((it) => {
    if (it.id === item.id) return;
    const v = it[field];
    if (Array.isArray(v)) decoyPool.push(...v); else if (v) decoyPool.push(v);
  });
  decoyPool = [...new Set(decoyPool)].filter((v) => v !== correct);
  if (decoyPool.length < 2 && metaPool) {
    decoyPool = [...new Set([...decoyPool, ...metaPool])].filter((v) => v !== correct);
  }
  const decoys = shuffle(decoyPool).slice(0, 2);
  const options = shuffle([correct, ...decoys]);

  return { field, label, correct, options, allowFreeText: true };
}

function startChallenge(item) {
  const allItems = state.items;
  const questions = [];
  for (const f of CHALLENGE_FIELD_PRIORITY) {
    if (questions.length >= 4) break;
    const q = buildQuestionForField(item, f, allItems);
    if (q) questions.push(q);
  }
  if (questions.length === 0) {
    // 정보가 거의 없는 경우: 바로 성공 처리하지 않고 층 질문 하나라도 강제 생성
    questions.push({ field: 'floor', label: '몇 층에서 잃어버리셨나요?', correct: item.floor, options: shuffle([item.floor, ...state.meta.floors.filter((f) => f !== item.floor)].slice(0, 3)), allowFreeText: true });
  }
  state.challenge = { item, questions, index: 0, correctCount: 0 };
  navTo('challenge');
  renderChallengeQuestion();
}

function renderChallengeQuestion() {
  const ch = state.challenge;
  const q = ch.questions[ch.index];
  document.getElementById('challenge-progress').innerText = `본인확인 ${ch.index + 1} / ${ch.questions.length}`;
  document.getElementById('challenge-question').innerText = q.label;

  const body = document.getElementById('challenge-body');
  body.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'question-card';
  const grid = document.createElement('div');
  grid.className = 'option-grid';

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
    const norm = (s) => String(s).trim().toLowerCase();
    if (norm(answer) === norm(q.correct)) ch.correctCount++;
  }
  ch.index++;
  if (ch.index >= ch.questions.length) {
    if (ch.correctCount >= Math.ceil(ch.questions.length * 0.75) || ch.correctCount >= ch.questions.length - 1) {
      showSuccess(ch.item);
    } else {
      navTo('fail');
    }
    return;
  }
  renderChallengeQuestion();
}

function showSuccess(item) {
  state.matchedItem = item;
  document.getElementById('result-name').innerText = item.name;
  document.getElementById('result-code').innerText = item.code;
  document.getElementById('claimant-name').value = '';
  navTo('success');
}

async function finalizeClaim() {
  const name = document.getElementById('claimant-name').value.trim();
  if (!name) { showModal('✏️', '성함을 입력해 주세요.'); return; }
  const item = state.matchedItem;
  await fetch(API.claim(item.id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claimantName: name })
  });
  await loadData();
  showModal('🎉', `${name}님, 확인 감사합니다.\n행정실에서 보관 코드 ${item.code}를 보여주시면 물건을 받으실 수 있어요.`);
  navTo('home');
}
