/* ============================================================
   스마트 분실물 키오스크 - script.js
   - 분실물 등록 (다양한 정보 입력 + 카테고리)
   - 분실물 찾기: 아키네이터식 스무고개로 후보를 좁혀 소지자 본인확인
   - 설정 데이터(카테고리/장소 기본값, 색상, 태그 등)는
     이 파일이 아니라 data.json 에서 불러온다. (아래 CONFIG 참고)
   ============================================================ */

/* ---------------------- 설정 데이터 (data.json에서 로드) ---------------------- */
let CONFIG = null; // { categories, locations, colors, tags, weekdays, newCategoryIconPool, demoFixedCode }

async function loadConfig() {
    try {
        const res = await fetch('data.json');
        if (!res.ok) throw new Error('data.json 응답 오류: ' + res.status);
        CONFIG = await res.json();
    } catch (e) {
        alert('설정 데이터(data.json)를 불러오지 못했습니다.\n\n' +
              'index.html 파일을 더블클릭해서 바로 열면 브라우저 보안 정책 때문에 fetch가 막힐 수 있습니다.\n' +
              '터미널에서 이 폴더로 이동한 뒤 아래 명령으로 로컬 서버를 켜고 접속해 주세요.\n\n' +
              'python3 -m http.server 8000\n\n그 다음 http://localhost:8000 으로 접속하세요.');
        throw e;
    }
}

/* ---------------------- 상태 ---------------------- */
let items = [];        // 등록된 분실물 목록
let nextId = 1;
let categories = [];   // 자가 확장형 카테고리 목록
let locations = {};    // 자가 확장형 장소 목록 { 층: [장소, ...] }

let selectedRegColorValue = null;
let selectedRegTags = [];

let selectedRegFloor = null, selectedRegRoom = null, selectedRegCategory = null;

let mediaStream = null;
let capturedPhotoDataUrl = null;

/* ---------------------- 초기화 ---------------------- */
window.onload = async () => {
    await loadConfig(); // CONFIG가 준비되어야 이후 렌더링이 안전하다
    loadItems();
    loadTaxonomy();
    renderColorGrids();
    renderTagGrid();
    renderCategoryPicker('reg');
    renderFloorPicker('reg');
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
        categories = rawCat ? JSON.parse(rawCat) : JSON.parse(JSON.stringify(CONFIG.categories));
        locations = rawLoc ? JSON.parse(rawLoc) : JSON.parse(JSON.stringify(CONFIG.locations));
    } catch (e) {
        categories = JSON.parse(JSON.stringify(CONFIG.categories));
        locations = JSON.parse(JSON.stringify(CONFIG.locations));
    }
}

function saveTaxonomy() {
    try {
        localStorage.setItem('laf_categories', JSON.stringify(categories));
        localStorage.setItem('laf_locations', JSON.stringify(locations));
    } catch (e) { /* 저장 실패 시 조용히 무시 (프로토타입) */ }
}

function addCategory(rawLabel) {
    const label = (rawLabel || '').trim();
    if (!label) return null;
    const existing = categories.find(c => c.label === label || c.value === label);
    if (existing) return existing.value;
    const usedIcons = categories.map(c => c.icon);
    const freeIcon = CONFIG.newCategoryIconPool.find(i => !usedIcons.includes(i)) || '📦';
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
    selectedRegCategory = value;
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

/* ---- 장소 picker (층 -> 장소 2단계, 등록 화면 전용) ---- */
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
    selectedRegFloor = floor; selectedRegRoom = null;
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
    selectedRegRoom = room;
}

function confirmAddLocation(mode) {
    const floor = selectedRegFloor;
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

function getSelectedLocation() {
    if (!selectedRegFloor || !selectedRegRoom) return null;
    return `${selectedRegFloor} ${selectedRegRoom}`;
}

function renderColorGrids() {
    document.getElementById('reg-color-grid').innerHTML = CONFIG.colors.map(c => {
        const border = c.name === '흰색' ? 'border:1px solid #ccc;' : (c.name === '검정' ? 'border:1px solid #333;' : '');
        return `<button type="button" class="color-btn" style="background-color:${c.hex};${border}" onclick="selectColor(this,'${c.name}')"></button>`;
    }).join('');
}

function renderTagGrid() {
    document.getElementById('reg-tag-grid').innerHTML = CONFIG.tags.map(t =>
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

/* ---------------------- 색상 선택 (등록 화면 전용) ---------------------- */
function selectColor(btnElement, colorName) {
    const grid = document.getElementById('reg-color-grid');
    grid.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
    btnElement.classList.add('selected');
    selectedRegColorValue = colorName;
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
    const loc = getSelectedLocation();
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
        code: CONFIG.demoFixedCode, // 프로토타입: 실제 번호 채번 로직 없이 데모용 고정값 사용
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

/* ============================================================
   소지자 본인확인: 아키네이터식 스무고개
   - 등록된 정보(층/카테고리/색상/장소/요일/특이사항)를 속성으로 삼아
     한 번에 하나씩 물어보며 후보를 좁혀나간다.
   - "모르겠어요"를 선택해도 그 속성만 건너뛸 뿐, 다른 속성으로 계속
     좁혀나가기 때문에 한 가지를 몰라도 못 찾는 일이 없다.
   - 후보가 1개로 좁혀지면 마지막 확인만 거쳐 고유번호를 안내한다.
   ============================================================ */

const FIND_ATTRIBUTES = [
    {
        key: 'floor',
        mode: 'multi', // 후보가 적어 한 화면에 다 보여줌 (1층/2층/3층/4층/모르겠다)
        question: '분실물을 몇 층에서 잃어버렸나요?',
        getValue: item => (item.location || '').split(' ')[0]
    },
    {
        key: 'category',
        mode: 'sequential', // 하나씩 "~인가요? 예/모르겠습니다/아니요"로 물어봄
        formatQuestion: v => {
            const c = categories.find(c => c.value === v);
            return `분실물은 ${c ? c.icon + ' ' + c.label : v} 인가요?`;
        },
        getValue: item => item.category
    },
    {
        key: 'color',
        mode: 'sequential',
        formatQuestion: v => `분실물은 '${v}' 색상인가요?`,
        getValue: item => item.color
    },
    {
        key: 'room',
        mode: 'sequential',
        formatQuestion: v => `'${v}'에서 잃어버렸나요?`,
        getValue: item => item.location
    },
    {
        key: 'weekday',
        mode: 'sequential',
        formatQuestion: v => `${v}에 잃어버렸나요?`,
        getValue: item => CONFIG.weekdays[new Date(item.date).getDay()]
    },
    {
        key: 'hasTags',
        mode: 'multi', // 값이 '있음'/'없음' 둘뿐이라 한 화면 선택형이 더 자연스러움
        question: '분실물에 스티커, 케이스 같은 특이사항이 있었나요?',
        getValue: item => (item.tags && item.tags.length > 0) ? '있음' : '없음'
    }
];

let findPool = [];        // 현재 후보 분실물 목록
let findAttrPointer = 0;  // 다음에 검토할 FIND_ATTRIBUTES 인덱스
let findSeqAttr = null;   // 순차 질문 진행 중인 속성
let findSeqValues = [];   // 순차 질문에서 아직 안 물어본 값들

function shuffleArr(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function startFindFlow() {
    findPool = items.filter(i => !i.claimed);
    findAttrPointer = 0;
    navTo('find');
    if (findPool.length === 0) {
        finishFindFail('현재 등록된 분실물이 없습니다.');
        return;
    }
    renderNextFindStep();
}

function renderNextFindStep() {
    if (findPool.length === 1) { renderFinalConfirm(); return; }
    if (findPool.length === 0) { finishFindFail(); return; }

    while (findAttrPointer < FIND_ATTRIBUTES.length) {
        const attr = FIND_ATTRIBUTES[findAttrPointer];
        findAttrPointer++;
        const values = [...new Set(findPool.map(attr.getValue))];
        // 후보들이 이미 같은 값을 갖고 있으면(구분 불가) 건너뛴다.
        if (values.length <= 1) continue;

        if (attr.mode === 'multi') {
            if (values.length > 8) continue; // 선택지가 너무 많으면 건너뛴다.
            renderMultiChoiceQuestion(attr, values);
        } else {
            findSeqAttr = attr;
            findSeqValues = shuffleArr(values);
            askNextSequentialValue();
        }
        return;
    }

    // 모든 속성을 다 물어봤는데도 후보가 여럿이면, 물품명으로 마지막 시도
    renderNameTiebreaker();
}

/* ---- multi 모드: 값 전부 + '모르겠어요' 버튼을 한 화면에 ---- */
function renderMultiChoiceQuestion(attr, values) {
    const body = document.getElementById('find-body');
    body.innerHTML = '';

    const q = document.createElement('div');
    q.className = 'verify-question-text';
    q.innerText = attr.question;
    body.appendChild(q);

    const grid = document.createElement('div');
    grid.className = 'option-grid';
    values.forEach(v => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option-btn';
        btn.innerText = attr.formatLabel ? attr.formatLabel(v) : v;
        btn.onclick = () => {
            findPool = findPool.filter(item => attr.getValue(item) === v);
            renderNextFindStep();
        };
        grid.appendChild(btn);
    });
    const unknownBtn = document.createElement('button');
    unknownBtn.type = 'button';
    unknownBtn.className = 'option-btn option-btn-unknown';
    unknownBtn.innerText = '🤷 모르겠어요';
    unknownBtn.onclick = () => renderNextFindStep(); // 필터링 없이 다음 속성으로
    grid.appendChild(unknownBtn);

    body.appendChild(grid);
}

/* ---- sequential 모드: 값 하나씩 "~인가요? 예 / 모르겠습니다 / 아니요" ---- */
function askNextSequentialValue() {
    if (findSeqValues.length === 0) {
        // 이 속성의 값을 다 물어봤는데 '예'가 없었다 -> 다음 속성으로
        renderNextFindStep();
        return;
    }
    const value = findSeqValues.shift();
    renderSequentialQuestion(findSeqAttr, value);
}

function renderSequentialQuestion(attr, value) {
    const body = document.getElementById('find-body');
    body.innerHTML = '';

    const q = document.createElement('div');
    q.className = 'verify-question-text';
    q.innerText = attr.formatQuestion(value);
    body.appendChild(q);

    const grid = document.createElement('div');
    grid.className = 'option-grid';

    const yesBtn = document.createElement('button');
    yesBtn.type = 'button';
    yesBtn.className = 'option-btn';
    yesBtn.innerText = '예';
    yesBtn.onclick = () => {
        findPool = findPool.filter(item => attr.getValue(item) === value);
        findSeqValues = []; // 이 속성은 확정됐으니 남은 값들은 더 물어보지 않는다.
        renderNextFindStep();
    };

    const unknownBtn = document.createElement('button');
    unknownBtn.type = 'button';
    unknownBtn.className = 'option-btn option-btn-unknown';
    unknownBtn.innerText = '🤷 모르겠습니다';
    unknownBtn.onclick = () => askNextSequentialValue(); // 이 값만 건너뛰고 다음 값으로

    const noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'option-btn';
    noBtn.innerText = '아니요';
    noBtn.onclick = () => {
        findPool = findPool.filter(item => attr.getValue(item) !== value);
        askNextSequentialValue();
    };

    grid.appendChild(yesBtn);
    grid.appendChild(unknownBtn);
    grid.appendChild(noBtn);
    body.appendChild(grid);
}

function renderNameTiebreaker() {
    const body = document.getElementById('find-body');
    body.innerHTML = '';

    const q = document.createElement('div');
    q.className = 'verify-question-text';
    q.innerText = `아직 후보가 ${findPool.length}개 남았어요. 물품명을 기억하신다면 입력해 주세요.`;
    body.appendChild(q);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '물품명을 입력하세요 (모르면 비워두고 넘어가도 돼요)';
    body.appendChild(input);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:10px; margin-top:16px;';

    const submitBtn = document.createElement('button');
    submitBtn.className = 'submit-btn';
    submitBtn.style.marginTop = '0';
    submitBtn.innerText = '확인하기';
    submitBtn.onclick = () => {
        const val = input.value.trim();
        if (val) {
            const norm = s => (s || '').replace(/\s+/g, '').toLowerCase();
            const nv = norm(val);
            const matched = findPool.filter(it => {
                const nn = norm(it.name);
                return nn === nv || nn.includes(nv) || nv.includes(nn);
            });
            if (matched.length > 0) findPool = matched;
        }
        // 그래도 여러 개면 가장 최근에 등록된 것을 최종 후보로 선택
        findPool = [[...findPool].sort((a, b) => b.registeredAt - a.registeredAt)[0]];
        renderFinalConfirm();
    };
    btnRow.appendChild(submitBtn);
    body.appendChild(btnRow);
}

function renderFinalConfirm() {
    const item = findPool[0];
    let attemptsLeft = 3;

    const body = document.getElementById('find-body');
    body.innerHTML = '';

    const q = document.createElement('div');
    q.className = 'verify-question-text';
    q.innerText = '거의 다 왔어요! 마지막으로, 등록할 때 적었던 물품명을 정확히 입력해 주세요.';
    body.appendChild(q);

    const hint = document.createElement('div');
    hint.className = 'hint-text';
    hint.innerText = '실제 소유자만 알 수 있는 정보를 확인하는 단계라, 그냥 넘어갈 수는 없어요.';
    body.appendChild(hint);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '물품명을 입력하세요';
    body.appendChild(input);

    const errorMsg = document.createElement('div');
    errorMsg.className = 'hint-text hint-error';
    errorMsg.style.display = 'none';
    body.appendChild(errorMsg);

    const submitBtn = document.createElement('button');
    submitBtn.className = 'submit-btn';
    submitBtn.style.marginTop = '16px';
    submitBtn.innerText = '확인하기';
    submitBtn.onclick = () => {
        const norm = s => (s || '').replace(/\s+/g, '').toLowerCase();
        const typed = norm(input.value);
        const correct = norm(item.name);
        const isMatch = typed.length >= 2 && (typed === correct || correct.includes(typed) || typed.includes(correct));

        if (isMatch) {
            renderClaimantNameStep(item);
            return;
        }

        attemptsLeft--;
        if (attemptsLeft <= 0) {
            finishFindFail('물품명이 일치하지 않아 본인 확인에 실패했습니다.<br><br><span style="color:#f87171;">교무실에 직접 문의해주세요.</span>');
            return;
        }
        errorMsg.innerText = `물품명이 일치하지 않습니다. (남은 시도: ${attemptsLeft}번)`;
        errorMsg.style.display = 'block';
        input.value = '';
        input.focus();
    };
    body.appendChild(submitBtn);
}

function renderClaimantNameStep(item) {
    const body = document.getElementById('find-body');
    body.innerHTML = '';

    const q = document.createElement('div');
    q.className = 'verify-question-text';
    q.innerText = '확인됐습니다! 가져가시는 분의 이름을 입력해 주세요.';
    body.appendChild(q);

    const hint = document.createElement('div');
    hint.className = 'hint-text';
    hint.innerText = '교무실에서 수령하실 때 이 이름으로 대조합니다.';
    body.appendChild(hint);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '이름을 입력하세요';
    body.appendChild(input);

    const submitBtn = document.createElement('button');
    submitBtn.className = 'submit-btn';
    submitBtn.style.marginTop = '16px';
    submitBtn.innerText = '고유번호 확인하기';
    submitBtn.onclick = () => {
        const claimant = input.value.trim();
        if (!claimant) { alert('이름을 입력해 주세요.'); return; }
        finishFindSuccess(item, claimant);
    };
    body.appendChild(submitBtn);
}

/* ---------------------- 확인 결과 처리 ---------------------- */
function finishFindSuccess(item, claimantName) {
    item.claimed = true;
    item.claimedBy = claimantName || null;
    item.claimedAt = Date.now();
    saveItems();
    showModal('🎉', `본인 확인이 완료되었습니다!<br>분실물의 고유 번호는 <span class="modal-highlight">${item.code}</span>입니다.<br><br><span style="font-size:16px;">교무실에서 <b>${claimantName}</b> 님 이름으로 찾아가세요.</span>`, () => {
        navTo('home');
    });
}

function finishFindFail(reasonHtml) {
    showModal('❌', reasonHtml || '일치하는 분실물을 찾을 수 없습니다.<br><br><span style="color:#f87171;">교무실에 직접 문의해주세요.</span>', () => {
        navTo('home');
    });
}
