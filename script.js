/* ============================================================
   스마트 분실물 키오스크 - script.js
   - 분실물 등록 (다양한 정보 입력 + 카테고리)
   - 분실물 찾기: 등록된 정보 기반 필터링
   - 본인 확인: 퀴즈(10종) 또는 미니게임(2종) 중 선택
   ============================================================ */

/* ---------------------- 상수 데이터 ---------------------- */

/* 카테고리/장소는 "자가 확장형" 데이터다.
   기본값으로 시작하되, 등록자가 '+새로 입력'으로 추가한 값이
   localStorage 에 누적되어 다음 등록자에게도 선택지로 제공된다.
   (등록이 쌓일수록 목록 자체가 점점 정교해지는 구조) */
const DEFAULT_CATEGORIES = [
    { value: '학용품', label: '학용품', icon: '✏️' },
    { value: '전자기기', label: '전자기기', icon: '💻' },
    { value: '손선풍기', label: '손 선풍기', icon: '🌀' },
    { value: '교과서', label: '교과서 및 노트', icon: '📚' },
    { value: '의류', label: '의류', icon: '👕' },
    { value: '기타', label: '기타', icon: '❓' }
];

/* 학교 실제 공간 구조 (층 -> 장소 목록) 기본값 */
const DEFAULT_LOCATIONS = {
    '1층': ['복도', '스튜디오', '시청각실', '도서실', 'Wee클래스', '보건실', '음악실', '음악활동실', '미술실', '급식실'],
    '2층': ['복도', '정보교육실', '진덕관(체육관)', '탈의실'],
    '3층': ['복도', '교과교실1', '교과교실2', '탈의실'],
    '4층': ['복도', '상담실', '과학실1', '과학실2', '과학실3', '융합교육실', '탈의실']
};

const COLORS = [
    { name: '빨강', hex: '#ef4444' },
    { name: '주황', hex: '#f97316' },
    { name: '노랑', hex: '#eab308' },
    { name: '초록', hex: '#22c55e' },
    { name: '파랑', hex: '#3b82f6' },
    { name: '남색', hex: '#1e3a8a' },
    { name: '보라', hex: '#a855f7' },
    { name: '흰색', hex: '#ffffff' },
    { name: '검정', hex: '#000000' },
    { name: '분홍', hex: '#ec4899' },
    { name: '청록', hex: '#14b8a6' }
];

const TAGS = [
    '스크래치 있음', '스티커 부착됨', '이름표 있음', '케이스/커버 있음',
    '충전선 포함됨', '낙서 있음', '냄새가 남', '새 제품처럼 깨끗함'
];

const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

const DECOY_ICONS = ['🎒', '🧢', '🔑', '🖊️', '🧦', '🩴', '⌚', '🧣'];

const QUIZ_QUESTION_COUNT = 6; // 본인 확인 정확도를 위해 6문제 모두 정답이어야 통과
const DEMO_FIXED_CODE = '9026'; // 프로토타입 데모용 고정 고유번호

/* ---------------------- 상태 ---------------------- */
let items = [];        // 등록된 분실물 목록
let nextId = 1;
let categories = [];   // 자가 확장형 카테고리 목록
let locations = {};    // 자가 확장형 장소 목록 { 층: [장소, ...] }

const unknownStates = { loc: false, cat: false, color: false, date: false };
let selectedRegColorValue = null;
let selectedFindColorValue = null;
let selectedRegTags = [];

let selectedRegFloor = null, selectedRegRoom = null, selectedRegCategory = null;
let selectedFindFloor = null, selectedFindRoom = null, selectedFindCategory = null;

let currentTargetItem = null;   // 확인 대상 분실물
let quizQueue = [];
let quizIndex = 0;
let quizUserAnswer = null;

let mediaStream = null;
let capturedPhotoDataUrl = null;

/* ---------------------- 초기화 ---------------------- */
window.onload = () => {
    loadItems();
    loadTaxonomy();
    renderColorGrids();
    renderTagGrid();
    renderCategoryPicker('reg');
    renderCategoryPicker('find');
    renderFloorPicker('reg');
    renderFloorPicker('find');
    updateHomeCount();
    setRegDateMode('auto');
};

function loadItems() {
    try {
        const raw = localStorage.getItem('laf_items');
        const nid = localStorage.getItem('laf_nextId');
        items = raw ? JSON.parse(raw) : [];
        nextId = nid ? parseInt(nid, 10) : 1;
    } catch (e) {
        items = [];
        nextId = 1;
    }
}

function saveItems() {
    try {
        localStorage.setItem('laf_items', JSON.stringify(items));
        localStorage.setItem('laf_nextId', String(nextId));
    } catch (e) { /* 저장 실패 시 조용히 무시 (프로토타입) */ }
}

/* ---- 자가 확장형 카테고리/장소 데이터 ---- */
function loadTaxonomy() {
    try {
        const rawCat = localStorage.getItem('laf_categories');
        const rawLoc = localStorage.getItem('laf_locations');
        categories = rawCat ? JSON.parse(rawCat) : JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
        locations = rawLoc ? JSON.parse(rawLoc) : JSON.parse(JSON.stringify(DEFAULT_LOCATIONS));
    } catch (e) {
        categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
        locations = JSON.parse(JSON.stringify(DEFAULT_LOCATIONS));
    }
}

function saveTaxonomy() {
    try {
        localStorage.setItem('laf_categories', JSON.stringify(categories));
        localStorage.setItem('laf_locations', JSON.stringify(locations));
    } catch (e) { /* 저장 실패 시 조용히 무시 (프로토타입) */ }
}

const NEW_CATEGORY_ICON_POOL = ['📦', '🧢', '🔑', '🖊️', '🧦', '🩴', '⌚', '🧣', '🎒', '🧤', '🥤', '🧴'];
function addCategory(rawLabel) {
    const label = (rawLabel || '').trim();
    if (!label) return null;
    const existing = categories.find(c => c.label === label || c.value === label);
    if (existing) return existing.value;
    const usedIcons = categories.map(c => c.icon);
    const freeIcon = NEW_CATEGORY_ICON_POOL.find(i => !usedIcons.includes(i)) || '📦';
    const newCat = { value: label, label: label, icon: freeIcon };
    categories.push(newCat);
    saveTaxonomy();
    return newCat.value;
}

function addRoom(floor, rawRoom) {
    const room = (rawRoom || '').trim();
    if (!floor || !room) return null;
    if (!locations[floor]) locations[floor] = [];
    if (!locations[floor].includes(room)) {
        locations[floor].push(room);
        saveTaxonomy();
    }
    return room;
}

function flattenLocations() {
    const arr = [];
    Object.keys(locations).forEach(floor => (locations[floor] || []).forEach(room => arr.push(`${floor} ${room}`)));
    return arr;
}

/* ---- 카테고리 picker (등록/찾기 공용) ---- */
function renderCategoryPicker(mode) {
    const row = document.getElementById(`${mode}-category-row`);
    row.innerHTML = '';
    categories.forEach(c => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip-select-btn';
        btn.innerText = `${c.icon} ${c.label}`;
        btn.onclick = () => selectCategory(mode, c.value, btn);
        row.appendChild(btn);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'chip-select-btn chip-add-btn';
    addBtn.innerText = '+ 새로 입력';
    addBtn.onclick = () => { document.getElementById(`${mode}-category-add`).style.display = 'flex'; };
    row.appendChild(addBtn);
}

function selectCategory(mode, value, btnEl) {
    document.querySelectorAll(`#${mode}-category-row .chip-select-btn`).forEach(b => b.classList.remove('selected'));
    btnEl.classList.add('selected');
    if (mode === 'reg') selectedRegCategory = value; else selectedFindCategory = value;
}

function confirmAddCategory(mode) {
    const input = document.getElementById(`${mode}-category-add-input`);
    const value = addCategory(input.value);
    if (!value) return;
    input.value = '';
    document.getElementById(`${mode}-category-add`).style.display = 'none';
    renderCategoryPicker(mode);
    const target = [...document.querySelectorAll(`#${mode}-category-row .chip-select-btn`)].find(b => b.innerText.includes(value));
    if (target) selectCategory(mode, value, target);
}

/* ---- 장소 picker (층 -> 장소 2단계, 등록/찾기 공용) ---- */
function renderFloorPicker(mode) {
    const row = document.getElementById(`${mode}-floor-row`);
    row.innerHTML = '';
    Object.keys(locations).forEach(floor => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip-select-btn';
        btn.innerText = floor;
        btn.onclick = () => selectFloor(mode, floor, btn);
        row.appendChild(btn);
    });
}

function selectFloor(mode, floor, btnEl) {
    document.querySelectorAll(`#${mode}-floor-row .chip-select-btn`).forEach(b => b.classList.remove('selected'));
    btnEl.classList.add('selected');
    if (mode === 'reg') { selectedRegFloor = floor; selectedRegRoom = null; }
    else { selectedFindFloor = floor; selectedFindRoom = null; }
    document.getElementById(`${mode}-location-add`).style.display = 'none';
    renderRoomPicker(mode, floor);
}

function renderRoomPicker(mode, floor) {
    const row = document.getElementById(`${mode}-room-row`);
    row.innerHTML = '';
    (locations[floor] || []).forEach(room => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chip-select-btn';
        btn.innerText = room;
        btn.onclick = () => selectRoom(mode, room, btn);
        row.appendChild(btn);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'chip-select-btn chip-add-btn';
    addBtn.innerText = '+ 새로 입력';
    addBtn.onclick = () => { document.getElementById(`${mode}-location-add`).style.display = 'flex'; };
    row.appendChild(addBtn);
}

function selectRoom(mode, room, btnEl) {
    document.querySelectorAll(`#${mode}-room-row .chip-select-btn`).forEach(b => b.classList.remove('selected'));
    btnEl.classList.add('selected');
    if (mode === 'reg') selectedRegRoom = room; else selectedFindRoom = room;
}

function confirmAddLocation(mode) {
    const floor = mode === 'reg' ? selectedRegFloor : selectedFindFloor;
    if (!floor) { alert('먼저 층을 선택해 주세요.'); return; }
    const input = document.getElementById(`${mode}-location-add-input`);
    const room = addRoom(floor, input.value);
    if (!room) return;
    input.value = '';
    document.getElementById(`${mode}-location-add`).style.display = 'none';
    renderRoomPicker(mode, floor);
    const target = [...document.querySelectorAll(`#${mode}-room-row .chip-select-btn`)].find(b => b.innerText === room);
    if (target) selectRoom(mode, room, target);
}

function getSelectedLocation(mode) {
    const floor = mode === 'reg' ? selectedRegFloor : selectedFindFloor;
    const room = mode === 'reg' ? selectedRegRoom : selectedFindRoom;
    if (!floor || !room) return null;
    return `${floor} ${room}`;
}

function renderColorGrids() {
    const html = mode => COLORS.map(c => {
        const border = c.name === '흰색' ? 'border:1px solid #ccc;' : (c.name === '검정' ? 'border:1px solid #333;' : '');
        return `<button type="button" class="color-btn" style="background-color:${c.hex};${border}" onclick="selectColor(this,'${c.name}','${mode}')"></button>`;
    }).join('');
    document.getElementById('reg-color-grid').innerHTML = html('reg');
    document.getElementById('find-color-grid').innerHTML = html('find');
}

function renderTagGrid() {
    document.getElementById('reg-tag-grid').innerHTML = TAGS.map(t =>
        `<button type="button" class="chip-btn" onclick="toggleRegTag(this,'${t}')">${t}</button>`
    ).join('');
}

/* ---------------------- 네비게이션 / 공통 ---------------------- */
function navTo(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById('view-' + viewId).classList.add('active');
    if (viewId === 'home') updateHomeCount();
}

function updateHomeCount() {
    const count = items.filter(i => !i.claimed).length;
    document.getElementById('display-count').innerText = count;
}

function showModal(icon, htmlContent, onCloseCallback = null) {
    document.getElementById('modalIcon').innerText = icon;
    document.getElementById('modalContent').innerHTML = htmlContent;
    document.getElementById('modalOverlay').style.display = 'flex';
    const closeBtn = document.getElementById('modalCloseBtn');
    closeBtn.onclick = () => {
        document.getElementById('modalOverlay').style.display = 'none';
        if (onCloseCallback) onCloseCallback();
    };
}
function closeModal() { document.getElementById('modalOverlay').style.display = 'none'; }

/* ---------------------- 색상 선택 (등록/찾기 공용) ---------------------- */
function selectColor(btnElement, colorName, mode) {
    const gridId = mode === 'reg' ? 'reg-color-grid' : 'find-color-grid';
    const grid = document.getElementById(gridId);
    grid.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
    btnElement.classList.add('selected');
    if (mode === 'reg') selectedRegColorValue = colorName;
    else selectedFindColorValue = colorName;
}

/* ---------------------- 특이사항 태그 선택 (등록) ---------------------- */
function toggleRegTag(btn, tag) {
    const idx = selectedRegTags.indexOf(tag);
    if (idx === -1) { selectedRegTags.push(tag); btn.classList.add('selected'); }
    else { selectedRegTags.splice(idx, 1); btn.classList.remove('selected'); }
}

/* ---------------------- 등록 화면 ---------------------- */
function setRegDateMode(mode) {
    const autoBtn = document.getElementById('btn-reg-date-auto');
    const manualBtn = document.getElementById('btn-reg-date-manual');
    const dateInput = document.getElementById('reg-date');
    if (mode === 'auto') {
        autoBtn.classList.add('active');
        manualBtn.classList.remove('active');
        dateInput.disabled = true;
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    } else {
        autoBtn.classList.remove('active');
        manualBtn.classList.add('active');
        dateInput.disabled = false;
        dateInput.value = '';
    }
}

function submitRegister() {
    const name = document.getElementById('reg-name').value.trim();
    const loc = getSelectedLocation('reg');
    const cat = selectedRegCategory;
    const date = document.getElementById('reg-date').value;
    const brand = document.getElementById('reg-brand').value.trim();
    const details = document.getElementById('reg-details').value.trim();

    if (!name || !loc || !cat || !date || !selectedRegColorValue) {
        alert('입력되지 않은 항목이 있습니다. 정확히 입력 및 선택해 주세요.');
        return;
    }

    const item = {
        id: nextId,
        code: DEMO_FIXED_CODE, // 프로토타입: 실제 번호 채번 로직 없이 데모용 고정값 사용
        name, location: loc, category: cat, date,
        color: selectedRegColorValue,
        brand: brand || null,
        tags: [...selectedRegTags],
        details: details || null,
        photo: capturedPhotoDataUrl,
        claimed: false,
        registeredAt: Date.now()
    };
    nextId++;
    items.push(item);
    saveItems();

    showModal('✅', `분실물이 등록되었습니다.<br>고유 번호는 <span class="modal-highlight">${item.code}</span>입니다.`, () => {
        navTo('home');
        resetRegisterForm();
    });
}

function resetRegisterForm() {
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-brand').value = '';
    document.getElementById('reg-details').value = '';
    setRegDateMode('auto');
    document.querySelectorAll('#reg-color-grid .color-btn').forEach(b => b.classList.remove('selected'));
    selectedRegColorValue = null;
    document.querySelectorAll('#reg-tag-grid .chip-btn').forEach(b => b.classList.remove('selected'));
    selectedRegTags = [];

    document.querySelectorAll('#reg-category-row .chip-select-btn').forEach(b => b.classList.remove('selected'));
    selectedRegCategory = null;
    document.getElementById('reg-category-add').style.display = 'none';

    document.querySelectorAll('#reg-floor-row .chip-select-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('reg-room-row').innerHTML = '';
    document.getElementById('reg-location-add').style.display = 'none';
    selectedRegFloor = null; selectedRegRoom = null;

    resetCameraUI();
}

/* ---------------------- 사진 촬영 (등록 화면) ---------------------- */
async function startCamera() {
    const video = document.getElementById('camera-video');
    const startBtn = document.getElementById('btn-camera-start');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        fallbackToFileInput();
        return;
    }
    startBtn.disabled = true;
    startBtn.innerText = '카메라 연결 중...';

    let settled = false;
    const timeoutId = setTimeout(() => {
        if (!settled) {
            settled = true;
            startBtn.disabled = false;
            startBtn.innerText = '📷 촬영하기';
            fallbackToFileInput();
        }
    }, 4000);

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (settled) { stream.getTracks().forEach(t => t.stop()); return; }
        settled = true;
        clearTimeout(timeoutId);
        mediaStream = stream;
        video.srcObject = stream;
        video.style.display = 'block';
        document.getElementById('camera-placeholder').style.display = 'none';
        document.getElementById('camera-preview-img').style.display = 'none';
        startBtn.style.display = 'none';
        document.getElementById('btn-camera-capture').style.display = 'inline-block';
    } catch (err) {
        if (!settled) {
            settled = true;
            clearTimeout(timeoutId);
            fallbackToFileInput();
        }
    } finally {
        startBtn.disabled = false;
        startBtn.innerText = '📷 촬영하기';
    }
}

function fallbackToFileInput() {
    document.getElementById('btn-camera-start').style.display = 'none';
    const fileInput = document.getElementById('camera-file-fallback');
    fileInput.style.display = 'inline-block';
    fileInput.click();
}

function handleFileFallback(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        capturedPhotoDataUrl = e.target.result;
        showCapturedPreview(capturedPhotoDataUrl);
    };
    reader.readAsDataURL(file);
}

function capturePhoto() {
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    canvas.width = video.videoWidth || 400;
    canvas.height = video.videoHeight || 300;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    capturedPhotoDataUrl = canvas.toDataURL('image/png');
    stopCameraStream();
    showCapturedPreview(capturedPhotoDataUrl);
}

function showCapturedPreview(dataUrl) {
    const previewImg = document.getElementById('camera-preview-img');
    const video = document.getElementById('camera-video');
    video.style.display = 'none';
    document.getElementById('camera-placeholder').style.display = 'none';
    previewImg.src = dataUrl;
    previewImg.style.display = 'block';
    document.getElementById('btn-camera-capture').style.display = 'none';
    document.getElementById('btn-camera-start').style.display = 'none';
    document.getElementById('btn-camera-retake').style.display = 'inline-block';
}

function stopCameraStream() {
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
}

function retakePhoto() {
    capturedPhotoDataUrl = null;
    const previewImg = document.getElementById('camera-preview-img');
    previewImg.style.display = 'none';
    previewImg.src = '';
    document.getElementById('camera-placeholder').style.display = 'flex';
    document.getElementById('btn-camera-retake').style.display = 'none';
    document.getElementById('btn-camera-start').style.display = 'inline-block';
    document.getElementById('camera-file-fallback').value = '';
}

function resetCameraUI() {
    stopCameraStream();
    capturedPhotoDataUrl = null;
    document.getElementById('camera-video').style.display = 'none';
    const previewImg = document.getElementById('camera-preview-img');
    previewImg.style.display = 'none';
    previewImg.src = '';
    document.getElementById('camera-placeholder').style.display = 'flex';
    document.getElementById('btn-camera-start').style.display = 'inline-block';
    document.getElementById('btn-camera-capture').style.display = 'none';
    document.getElementById('btn-camera-retake').style.display = 'none';
    document.getElementById('camera-file-fallback').style.display = 'none';
    document.getElementById('camera-file-fallback').value = '';
}

/* ---------------------- 찾기(필터) 화면 ---------------------- */
function toggleUnknown(field) {
    unknownStates[field] = !unknownStates[field];
    const btn = document.getElementById(`btn-unk-${field}`);
    const on = unknownStates[field];
    btn.classList.toggle('active', on);

    if (field === 'loc') {
        const floorRow = document.getElementById('find-floor-row');
        const roomRow = document.getElementById('find-room-row');
        floorRow.style.opacity = on ? '0.4' : '1';
        floorRow.style.pointerEvents = on ? 'none' : 'auto';
        roomRow.style.opacity = on ? '0.4' : '1';
        roomRow.style.pointerEvents = on ? 'none' : 'auto';
        if (on) {
            document.getElementById('find-location-add').style.display = 'none';
            document.querySelectorAll('#find-floor-row .chip-select-btn, #find-room-row .chip-select-btn').forEach(b => b.classList.remove('selected'));
            selectedFindFloor = null; selectedFindRoom = null;
        }
    } else if (field === 'cat') {
        const catRow = document.getElementById('find-category-row');
        catRow.style.opacity = on ? '0.4' : '1';
        catRow.style.pointerEvents = on ? 'none' : 'auto';
        if (on) {
            document.getElementById('find-category-add').style.display = 'none';
            document.querySelectorAll('#find-category-row .chip-select-btn').forEach(b => b.classList.remove('selected'));
            selectedFindCategory = null;
        }
    } else if (field === 'date') {
        const dateInput = document.getElementById('find-date');
        dateInput.disabled = on;
        if (on) dateInput.value = '';
    } else if (field === 'color') {
        const colorGrid = document.getElementById('find-color-grid');
        colorGrid.style.opacity = on ? '0.5' : '1';
        colorGrid.style.pointerEvents = on ? 'none' : 'auto';
        if (on) {
            document.querySelectorAll('#find-color-grid .color-btn').forEach(b => b.classList.remove('selected'));
            selectedFindColorValue = null;
        }
    }
}

function resetFindForm() {
    ['loc', 'cat', 'color', 'date'].forEach(f => { if (unknownStates[f]) toggleUnknown(f); });
    document.getElementById('find-date').value = '';
    document.getElementById('find-details').value = '';
    document.querySelectorAll('#find-color-grid .color-btn').forEach(b => b.classList.remove('selected'));
    selectedFindColorValue = null;
    document.querySelectorAll('#find-category-row .chip-select-btn').forEach(b => b.classList.remove('selected'));
    selectedFindCategory = null;
    document.querySelectorAll('#find-floor-row .chip-select-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('find-room-row').innerHTML = '';
    selectedFindFloor = null; selectedFindRoom = null;
}

function submitFind() {
    let unknownCount = 0;
    for (let key in unknownStates) if (unknownStates[key]) unknownCount++;

    const loc = getSelectedLocation('find');
    const cat = selectedFindCategory;
    const date = document.getElementById('find-date').value;
    const color = selectedFindColorValue;

    if (unknownCount >= 2) {
        showModal('❌', `정보가 너무 부족합니다.<br><br><span style="color:#f87171;">일치하는 분실물이 없습니다.</span>`);
        return;
    }

    const providedFields = [
        !unknownStates.loc && loc,
        !unknownStates.cat && cat,
        !unknownStates.date && date,
        !unknownStates.color && color
    ].filter(Boolean).length;

    if (providedFields === 0) {
        showModal('❌', `입력된 정보가 없습니다.<br><br><span style="color:#f87171;">최소 한 가지 정보를 입력해 주세요.</span>`);
        return;
    }

    let best = null, bestScore = 0;
    items.filter(i => !i.claimed).forEach(item => {
        let score = 0;
        if (!unknownStates.loc && loc && item.location.toLowerCase().includes(loc.toLowerCase())) score++;
        if (!unknownStates.cat && cat && item.category === cat) score++;
        if (!unknownStates.date && date && item.date === date) score++;
        if (!unknownStates.color && color && item.color === color) score++;
        if (score > bestScore || (score === bestScore && score > 0 && best && item.registeredAt > best.registeredAt)) {
            best = item; bestScore = score;
        }
    });

    if (!best || bestScore === 0) {
        showModal('❌', `일치하는 분실물이 없습니다.<br><br><span style="color:#f87171;">교무실에 직접 문의해주세요.</span>`);
        return;
    }

    currentTargetItem = best;
    navTo('challenge-select');
}

/* ============================================================
   본인 확인: 퀴즈 (10종)
   각 퀴즈 함수는 { title, render, check } 를 반환한다.
   render()는 #quiz-body 를 채우고, 사용자가 답을 고르면
   전역 변수 quizUserAnswer 를 갱신한다.
   check(item)은 quizUserAnswer 가 정답인지 boolean 반환.
   ============================================================ */

function pickRandom(arr, n) {
    const copy = [...arr];
    const out = [];
    while (copy.length && out.length < n) {
        out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    return out;
}
function shuffle(arr) { return pickRandom(arr, arr.length); }

function renderOptionButtons(options, correctValue, labelFn) {
    quizUserAnswer = null;
    const body = document.getElementById('quiz-body');
    const grid = document.createElement('div');
    grid.className = 'option-grid';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option-btn';
        btn.innerText = labelFn ? labelFn(opt) : opt;
        btn.onclick = () => {
            grid.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            quizUserAnswer = opt;
        };
        grid.appendChild(btn);
    });
    body.appendChild(grid);
}

const QUIZ_BUILDERS = [

    // 1. 카테고리 객관식
    function quizCategory(item) {
        return {
            title: '이 물건의 분류는 무엇인가요?',
            render() {
                const others = categories.map(c => c.value).filter(v => v !== item.category);
                const options = shuffle([item.category, ...pickRandom(others, Math.min(3, others.length))]);
                renderOptionButtons(options, item.category, v => {
                    const c = categories.find(c => c.value === v) || { icon: '📦', label: v };
                    return `${c.icon} ${c.label}`;
                });
            },
            check: () => quizUserAnswer === item.category
        };
    },

    // 2. 색상 이름 객관식
    function quizColorText(item) {
        return {
            title: '이 물건의 색상은 무엇이었나요?',
            render() {
                const others = COLORS.map(c => c.name).filter(n => n !== item.color);
                const options = shuffle([item.color, ...pickRandom(others, 3)]);
                renderOptionButtons(options, item.color);
            },
            check: () => quizUserAnswer === item.color
        };
    },

    // 3. 색상 비주얼 선택
    function quizColorVisual(item) {
        return {
            title: '아래 색상 중 이 물건의 색상을 골라주세요.',
            render() {
                quizUserAnswer = null;
                const body = document.getElementById('quiz-body');
                const grid = document.createElement('div');
                grid.className = 'visual-grid';
                COLORS.forEach(c => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'visual-color-btn';
                    btn.style.backgroundColor = c.hex;
                    if (c.name === '흰색') btn.style.border = '1px solid #ccc';
                    if (c.name === '검정') btn.style.border = '1px solid #333';
                    btn.onclick = () => {
                        grid.querySelectorAll('.visual-color-btn').forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                        quizUserAnswer = c.name;
                    };
                    grid.appendChild(btn);
                });
                body.appendChild(grid);
            },
            check: () => quizUserAnswer === item.color
        };
    },

    // 4. 습득 장소 객관식
    function quizLocation(item) {
        return {
            title: '이 물건은 어디에서 습득되었나요?',
            render() {
                const pool = flattenLocations();
                if (!pool.includes(item.location)) pool.push(item.location);
                const others = pool.filter(l => l !== item.location);
                const options = shuffle([item.location, ...pickRandom(others, Math.min(3, others.length))]);
                renderOptionButtons(options, item.location);
            },
            check: () => quizUserAnswer === item.location
        };
    },

    // 5. 습득 요일 객관식
    function quizWeekday(item) {
        return {
            title: '이 물건은 무슨 요일에 습득되었을까요?',
            render() {
                const correctIdx = new Date(item.date).getDay();
                const correct = WEEKDAYS[correctIdx];
                const others = WEEKDAYS.filter(w => w !== correct);
                const options = shuffle([correct, ...pickRandom(others, 3)]);
                renderOptionButtons(options, correct);
                this._correct = correct;
            },
            check: () => quizUserAnswer === WEEKDAYS[new Date(item.date).getDay()]
        };
    },

    // 6. 특이사항 OX
    function quizOxDetail(item) {
        return {
            title: '',
            statementHtml: '',
            answerBool: null,
            render() {
                quizUserAnswer = null;
                let statement, correctBool;
                const hasTag = item.tags && item.tags.length > 0;
                const isTrueQuestion = Math.random() < 0.5;
                if (hasTag && isTrueQuestion) {
                    const tag = item.tags[Math.floor(Math.random() * item.tags.length)];
                    statement = `이 물건에는 <b>'${tag}'</b> 라는 특이사항이 있었다.`;
                    correctBool = true;
                } else if (hasTag && !isTrueQuestion) {
                    const decoyPool = TAGS.filter(t => !item.tags.includes(t));
                    const tag = decoyPool.length ? decoyPool[Math.floor(Math.random() * decoyPool.length)] : TAGS[0];
                    statement = `이 물건에는 <b>'${tag}'</b> 라는 특이사항이 있었다.`;
                    correctBool = decoyPool.length ? false : item.tags.includes(tag);
                } else if (isTrueQuestion) {
                    statement = `이 물건의 색상은 <b>'${item.color}'</b> 이다.`;
                    correctBool = true;
                } else {
                    const decoyColor = COLORS.map(c => c.name).find(n => n !== item.color);
                    statement = `이 물건의 색상은 <b>'${decoyColor}'</b> 이다.`;
                    correctBool = false;
                }
                this._correctBool = correctBool;
                document.getElementById('quiz-body').innerHTML = '';
                const p = document.createElement('div');
                p.className = 'quiz-question-text';
                p.innerHTML = statement;
                const row = document.createElement('div');
                row.className = 'ox-row';
                const oBtn = document.createElement('button');
                oBtn.className = 'ox-btn'; oBtn.innerText = 'O';
                const xBtn = document.createElement('button');
                xBtn.className = 'ox-btn'; xBtn.innerText = 'X';
                oBtn.onclick = () => { oBtn.classList.add('selected'); xBtn.classList.remove('selected'); quizUserAnswer = true; };
                xBtn.onclick = () => { xBtn.classList.add('selected'); oBtn.classList.remove('selected'); quizUserAnswer = false; };
                row.appendChild(oBtn); row.appendChild(xBtn);
                document.getElementById('quiz-body').appendChild(p);
                document.getElementById('quiz-body').appendChild(row);
                document.getElementById('quiz-body').prepend(makeBadge('OX 퀴즈'));
            },
            check() { return quizUserAnswer === this._correctBool; }
        };
    },

    // 7. 특이사항 다중 선택 (태그가 있는 경우에만 사용)
    function quizMultiselectFeatures(item) {
        return {
            title: '이 물건에 해당하는 특이사항을 모두 골라주세요.',
            render() {
                quizUserAnswer = [];
                const decoyPool = TAGS.filter(t => !item.tags.includes(t));
                const options = shuffle([...item.tags, ...pickRandom(decoyPool, Math.min(4, decoyPool.length))]);
                const body = document.getElementById('quiz-body');
                const grid = document.createElement('div');
                grid.className = 'multiselect-grid';
                options.forEach(opt => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'chip-btn';
                    btn.innerText = opt;
                    btn.onclick = () => {
                        const idx = quizUserAnswer.indexOf(opt);
                        if (idx === -1) { quizUserAnswer.push(opt); btn.classList.add('selected'); }
                        else { quizUserAnswer.splice(idx, 1); btn.classList.remove('selected'); }
                    };
                    grid.appendChild(btn);
                });
                body.appendChild(grid);
            },
            check() {
                if (!Array.isArray(quizUserAnswer)) return false;
                const a = [...quizUserAnswer].sort();
                const b = [...item.tags].sort();
                return a.length === b.length && a.every((v, i) => v === b[i]);
            },
            valid: item.tags && item.tags.length > 0
        };
    },

    // 8. 물품명 단답형 입력
    function quizTextInputName(item) {
        return {
            title: '이 물건의 정확한 물품명을 입력해 주세요.',
            render() {
                quizUserAnswer = '';
                const body = document.getElementById('quiz-body');
                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = '물품명을 입력하세요';
                input.oninput = () => { quizUserAnswer = input.value; };
                body.appendChild(input);
            },
            check() {
                const norm = s => (s || '').replace(/\s+/g, '').toLowerCase();
                const a = norm(quizUserAnswer);
                const b = norm(item.name);
                if (!a) return false;
                return a === b || (a.length >= 2 && (b.includes(a) || a.includes(b)));
            }
        };
    },

    // 9. 습득 날짜(일) 슬라이더
    function quizSliderDay(item) {
        return {
            title: '이 물건이 습득된 날짜의 "일(day)"을 슬라이더로 맞춰보세요.',
            render() {
                const body = document.getElementById('quiz-body');
                const wrap = document.createElement('div');
                wrap.className = 'slider-wrap';
                const valueDisplay = document.createElement('div');
                valueDisplay.className = 'slider-value';
                valueDisplay.innerText = '15일';
                const slider = document.createElement('input');
                slider.type = 'range'; slider.min = '1'; slider.max = '31'; slider.value = '15';
                quizUserAnswer = 15;
                slider.oninput = () => { quizUserAnswer = parseInt(slider.value, 10); valueDisplay.innerText = `${slider.value}일`; };
                wrap.appendChild(valueDisplay);
                wrap.appendChild(slider);
                body.appendChild(wrap);
            },
            check() {
                const correctDay = new Date(item.date).getDate();
                return Math.abs(quizUserAnswer - correctDay) <= 1;
            }
        };
    },

    // 10. 카테고리 아이콘 비주얼 선택
    function quizIconVisual(item) {
        return {
            title: '이 물건의 분류 아이콘을 골라주세요.',
            render() {
                quizUserAnswer = null;
                const body = document.getElementById('quiz-body');
                const grid = document.createElement('div');
                grid.className = 'visual-grid';
                shuffle(categories).forEach(c => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'visual-icon-btn';
                    btn.innerText = c.icon;
                    btn.title = c.label;
                    btn.onclick = () => {
                        grid.querySelectorAll('.visual-icon-btn').forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                        quizUserAnswer = c.value;
                    };
                    grid.appendChild(btn);
                });
                body.appendChild(grid);
            },
            check: () => quizUserAnswer === item.category
        };
    }
];

function makeBadge(text) {
    const b = document.createElement('div');
    b.className = 'quiz-type-badge';
    b.innerText = text;
    return b;
}

function startQuizChallenge() {
    const item = currentTargetItem;
    const built = QUIZ_BUILDERS.map(fn => fn(item)).filter(q => q.valid !== false);
    quizQueue = pickRandom(built, Math.min(QUIZ_QUESTION_COUNT, built.length));
    quizIndex = 0;
    navTo('quiz');
    renderQuizStep();
}

function renderQuizStep() {
    const q = quizQueue[quizIndex];
    document.getElementById('quiz-progress').innerText = `${quizIndex + 1} / ${quizQueue.length} 문제`;
    const body = document.getElementById('quiz-body');
    body.innerHTML = '';
    if (q.title) {
        const p = document.createElement('div');
        p.className = 'quiz-question-text';
        p.innerText = q.title;
        body.appendChild(p);
    }
    q.render();
}

function submitQuizAnswer() {
    const q = quizQueue[quizIndex];
    if (quizUserAnswer === null || quizUserAnswer === undefined ||
        (quizUserAnswer === '' && !Array.isArray(quizUserAnswer))) {
        alert('답을 선택하거나 입력해 주세요.');
        return;
    }
    const correct = q.check();
    if (!correct) {
        handleChallengeFail('퀴즈 정답이 일치하지 않습니다.<br><br><span style="color:#f87171;">본인 확인에 실패했습니다.</span>');
        return;
    }
    quizIndex++;
    if (quizIndex < quizQueue.length) {
        renderQuizStep();
    } else {
        handleChallengeSuccess();
    }
}

/* ============================================================
   본인 확인: 미니게임 (2종)
   ============================================================ */

function startGameChallenge() {
    navTo('game');
    if (Math.random() < 0.5) renderColorFlipGame();
    else renderIconCatchGame();
}

/* 게임 1: 컬러 카드 뒤집기 */
function renderColorFlipGame() {
    document.getElementById('game-title').innerText = '🎴 컬러 카드 뒤집기';
    document.getElementById('game-desc').innerText = '내 분실물의 색상 카드를 찾아 뒤집어보세요! (기회 2번)';

    const item = currentTargetItem;
    const others = COLORS.map(c => c.name).filter(n => n !== item.color);
    const boardColors = shuffle([item.color, ...pickRandom(others, 7)]);

    const body = document.getElementById('game-body');
    body.innerHTML = '';
    const hint = document.createElement('div');
    hint.className = 'game-hint';
    hint.id = 'flip-attempts';
    hint.innerText = '남은 기회: 2번';
    body.appendChild(hint);

    const grid = document.createElement('div');
    grid.className = 'card-flip-grid';

    let attemptsLeft = 2;
    let finished = false;

    boardColors.forEach(colorName => {
        const colorHex = COLORS.find(c => c.name === colorName).hex;
        const card = document.createElement('div');
        card.className = 'flip-card';
        card.innerHTML = `
            <div class="flip-card-inner">
                <div class="flip-card-face flip-card-front">?</div>
                <div class="flip-card-face flip-card-back" style="background-color:${colorHex};"></div>
            </div>`;
        card.onclick = () => {
            if (finished || card.classList.contains('flipped')) return;
            card.classList.add('flipped');
            if (colorName === item.color) {
                card.classList.add('correct-reveal');
                finished = true;
                setTimeout(() => handleChallengeSuccess(), 700);
            } else {
                card.classList.add('wrong-reveal');
                attemptsLeft--;
                hint.innerText = `남은 기회: ${attemptsLeft}번`;
                if (attemptsLeft <= 0) {
                    finished = true;
                    setTimeout(() => handleChallengeFail('색상 카드를 맞추지 못했습니다.<br><br><span style="color:#f87171;">본인 확인에 실패했습니다.</span>'), 700);
                }
            }
        };
        grid.appendChild(card);
    });
    body.appendChild(grid);
}

/* 게임 2: 아이콘 캐치 (제한시간 내 분류 아이콘 찾기) */
function renderIconCatchGame() {
    document.getElementById('game-title').innerText = '⏱️ 아이콘 캐치';
    document.getElementById('game-desc').innerText = '시간 안에 내 분실물의 분류 아이콘을 클릭하세요!';

    const item = currentTargetItem;
    const correctCatObj = categories.find(c => c.value === item.category) || { icon: '📦' };
    const correctIcon = correctCatObj.icon;
    const otherCategoryIcons = categories.map(c => c.icon).filter(i => i !== correctIcon);
    const pool = shuffle([...otherCategoryIcons, ...DECOY_ICONS]);
    const gridIcons = shuffle([correctIcon, ...pool.slice(0, 8)]);

    const body = document.getElementById('game-body');
    body.innerHTML = '';

    const track = document.createElement('div');
    track.className = 'timer-bar-track';
    const fill = document.createElement('div');
    fill.className = 'timer-bar-fill';
    track.appendChild(fill);
    body.appendChild(track);

    const grid = document.createElement('div');
    grid.className = 'icon-catch-grid';

    let finished = false;
    let timeLeft = 7000; // ms
    const totalTime = timeLeft;

    const timerInterval = setInterval(() => {
        if (finished) return;
        timeLeft -= 100;
        fill.style.width = Math.max(0, (timeLeft / totalTime) * 100) + '%';
        if (timeLeft <= 0) {
            finished = true;
            clearInterval(timerInterval);
            handleChallengeFail('시간 안에 아이콘을 찾지 못했습니다.<br><br><span style="color:#f87171;">본인 확인에 실패했습니다.</span>');
        }
    }, 100);

    gridIcons.forEach(icon => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'icon-catch-btn';
        btn.innerText = icon;
        btn.onclick = () => {
            if (finished) return;
            if (icon === correctIcon) {
                finished = true;
                clearInterval(timerInterval);
                btn.classList.add('correct');
                setTimeout(() => handleChallengeSuccess(), 500);
            } else {
                btn.classList.add('wrong');
                setTimeout(() => btn.classList.remove('wrong'), 400);
            }
        };
        grid.appendChild(btn);
    });
    body.appendChild(grid);
}

/* ---------------------- 확인 결과 처리 ---------------------- */
function handleChallengeSuccess() {
    const item = currentTargetItem;
    item.claimed = true;
    saveItems();
    showModal('🎉', `본인 확인이 완료되었습니다!<br>분실물의 고유 번호는 <span class="modal-highlight">${item.code}</span>입니다.<br><br><span style="font-size:16px;">교무실에서 찾아가세요.</span>`, () => {
        currentTargetItem = null;
        resetFindForm();
        navTo('home');
    });
}

function handleChallengeFail(reasonHtml) {
    showModal('❌', reasonHtml || '본인 확인에 실패했습니다.', () => {
        currentTargetItem = null;
        navTo('home');
    });
}
