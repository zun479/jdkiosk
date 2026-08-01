/* =========================================================
   설정
   ========================================================= */
const CONFIG = {
  pinHash: "a1fb4e703a9ef1fa4936801721ff285a97ac85330856674412e054892afe6972", // sha256("2468")
  idleResetMs: 90 * 1000,
  photoMaxSize: 240,
  photoQuality: 0.5,
  backupUrl: "https://script.google.com/macros/s/여기에_배포ID를_넣으세요/exec",
  deviceId: "kiosk-01"
};

/* =========================================================
   기본 선택지 데이터 (담당자가 여기 값만 바꿔도 문항 구성이 바뀝니다)
   ========================================================= */
const DEFAULTS = {
  locations: {
    "1층": ["교실", "행정실", "보건실", "화장실", "복도"],
    "2층": ["교실", "도서관", "화장실", "복도"],
    "3층": ["교실", "과학실", "화장실", "복도"],
    "4층": ["교실", "음악실", "미술실", "화장실", "복도"],
    "실외/기타": ["운동장", "급식실", "체육관", "주차장", "기타"]
  },
  categories: ["가방", "전자기기", "의류", "문구/도서", "지갑/카드", "열쇠", "장신구", "우산", "스포츠용품", "기타"],
  colors: [
    { name:"검정", hex:"#111111" }, { name:"흰색", hex:"#f5f5f5" }, { name:"회색", hex:"#9ca3af" },
    { name:"빨강", hex:"#ef4444" }, { name:"주황", hex:"#f97316" }, { name:"노랑", hex:"#eab308" },
    { name:"초록", hex:"#22c55e" }, { name:"파랑", hex:"#3b82f6" }, { name:"남색", hex:"#1e3a8a" },
    { name:"보라", hex:"#a855f7" }, { name:"분홍", hex:"#ec4899" }, { name:"갈색", hex:"#92400e" }
  ],
  materials: ["천/직물", "가죽/인조가죽", "플라스틱", "금속", "고무", "종이", "유리", "기타"],
  sizes: ["아주 작음 (손바닥 크기)", "작음 (필통 크기)", "보통 (책 크기)", "큼 (가방 크기)", "아주 큼 (그 이상)"],
  tags: ["스티커 부착", "이름표 있음", "키링/장식 있음", "지퍼 손상", "얼룩/오염", "브랜드 로고 있음", "새 것 같음", "낡음/헌 것"]
};

/* 담당자가 앱에서 직접 추가한 항목은 여기 담겨 로컬에 영구 저장됩니다 */
function loadCustomOptions(){
  try { return JSON.parse(localStorage.getItem("customOptions") || "{}"); }
  catch(e){ return {}; }
}
function saveCustomOptions(custom){
  localStorage.setItem("customOptions", JSON.stringify(custom));
}
let CUSTOM = loadCustomOptions();
CUSTOM.locations = CUSTOM.locations || {};
CUSTOM.categories = CUSTOM.categories || [];
CUSTOM.materials = CUSTOM.materials || [];
CUSTOM.tags = CUSTOM.tags || [];

function getFloors(){ return [...Object.keys(DEFAULTS.locations), ...Object.keys(CUSTOM.locations)]; }
function getRooms(floor){
  const base = DEFAULTS.locations[floor] || [];
  const custom = CUSTOM.locations[floor] || [];
  return [...base, ...custom];
}
function getCategories(){ return [...DEFAULTS.categories, ...CUSTOM.categories]; }
function getMaterials(){ return [...DEFAULTS.materials, ...CUSTOM.materials]; }
function getTags(){ return [...DEFAULTS.tags, ...CUSTOM.tags]; }

/* =========================================================
   유틸
   ========================================================= */
function esc(str){
  return String(str).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
async function sha256(text){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function todayStr(){
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

/* =========================================================
   로컬 저장소 (localStorage, 용량 초과 대비)
   ========================================================= */
const Store = {
  KEY: "lostItems",
  COUNTER_KEY: "itemCounter",
  all(){
    try { return JSON.parse(localStorage.getItem(this.KEY) || "[]"); }
    catch(e){ return []; }
  },
  save(items){
    try {
      localStorage.setItem(this.KEY, JSON.stringify(items));
      return { ok:true };
    } catch(e){
      if (e && e.name === "QuotaExceededError"){
        const stripped = items.map(it => ({...it, photo:null}));
        try {
          localStorage.setItem(this.KEY, JSON.stringify(stripped));
          return { ok:true, photoDropped:true };
        } catch(e2){ return { ok:false }; }
      }
      return { ok:false };
    }
  },
  add(item){
    const items = this.all();
    items.push(item);
    return this.save(items);
  },
  update(id, patch){
    const items = this.all().map(it => it.id === id ? {...it, ...patch} : it);
    return this.save(items);
  },
  remove(id){
    return this.save(this.all().filter(it => it.id !== id));
  },
  nextTicketNo(){
    let n = parseInt(localStorage.getItem(this.COUNTER_KEY) || "0", 10) + 1;
    localStorage.setItem(this.COUNTER_KEY, String(n));
    return "LF-" + String(n).padStart(4, "0");
  },
  usageBytes(){
    const raw = localStorage.getItem(this.KEY) || "";
    return new Blob([raw]).size;
  }
};

/* =========================================================
   사진 압축 (Canvas)
   ========================================================= */
function compressPhoto(dataUrl){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(CONFIG.photoMaxSize / img.width, CONFIG.photoMaxSize / img.height, 1);
      const canvas = document.getElementById("camera-canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", CONFIG.photoQuality));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/* =========================================================
   화면 전환
   ========================================================= */
let idleTimer = null;
function navTo(view){
  document.querySelectorAll(".view-section").forEach(el => el.classList.remove("active"));
  document.getElementById("view-" + view).classList.add("active");
  resetIdleTimer();

  if (view !== "register") stopCamera();
  if (view === "home") updateHomeCount();
  if (view === "register") { resetRegisterForm(); }
}
function resetIdleTimer(){
  clearTimeout(idleTimer);
  const cur = document.querySelector(".view-section.active")?.id;
  if (cur === "view-home" || cur === "view-admin-pin" || cur === "view-admin") return;
  idleTimer = setTimeout(()=> navTo("home"), CONFIG.idleResetMs);
}
document.addEventListener("click", resetIdleTimer);

/* =========================================================
   모달
   ========================================================= */
let modalOnCloseCallback = null;
function showModal(icon, html, onClose){
  document.getElementById("modalIcon").textContent = icon;
  document.getElementById("modalContent").innerHTML = html;
  document.getElementById("modalOverlay").style.display = "flex";
  modalOnCloseCallback = onClose || null;
}
function closeModal(){
  document.getElementById("modalOverlay").style.display = "none";
  const cb = modalOnCloseCallback;
  modalOnCloseCallback = null;
  if (cb) cb();
}

/* =========================================================
   홈 화면
   ========================================================= */
function updateHomeCount(){
  const count = Store.all().filter(it => it.status !== "done").length;
  document.getElementById("display-count").textContent = count;
}
function resetAllData(){
  if (!confirm("정말 모든 분실물 데이터를 초기화할까요? 되돌릴 수 없어요.")) return;
  localStorage.removeItem(Store.KEY);
  localStorage.removeItem(Store.COUNTER_KEY);
  localStorage.removeItem("customOptions");
  CUSTOM = { locations:{}, categories:[], materials:[], tags:[] };
  updateHomeCount();
  alert("초기화됐어요.");
}

/* =========================================================
   등록 화면 상태
   ========================================================= */
let regState = null;
function freshRegState(){
  return {
    name:"", floor:null, room:null, dateMode:"auto", date:todayStr(),
    colors:[], category:null, material:null, size:null,
    brand:"", model:"", tags:[], details:"", photo:null
  };
}
let pendingAddContext = null; // 'reg-location' | 'reg-category' | 'reg-material' | 'reg-tag'

function resetRegisterForm(){
  regState = freshRegState();
  document.getElementById("reg-name").value = "";
  document.getElementById("reg-brand").value = "";
  document.getElementById("reg-model").value = "";
  document.getElementById("reg-details").value = "";
  setRegDateMode("auto");
  document.querySelectorAll(".add-inline").forEach(el => el.style.display = "none");
  renderFloorRow();
  renderRoomRow();
  renderColorGrid();
  renderCategoryRow();
  renderMaterialRow();
  renderSizeRow();
  renderTagGrid();
  resetCameraUI();
}

/* ---- 범용 chip row 렌더러 ---- */
function renderChipRow(containerId, options, isSelected, onPick, addInlineId){
  const el = document.getElementById(containerId);
  let html = options.map(opt => `
    <button type="button" class="chip-select-btn ${isSelected(opt) ? "selected" : ""}" data-v="${esc(opt)}">${esc(opt)}</button>
  `).join("");
  if (addInlineId){
    html += `<button type="button" class="chip-select-btn chip-add-btn" data-add="1">+ 직접 추가</button>`;
  }
  el.innerHTML = html;
  el.querySelectorAll(".chip-select-btn:not(.chip-add-btn)").forEach(btn=>{
    btn.addEventListener("click", ()=> onPick(btn.dataset.v));
  });
  if (addInlineId){
    el.querySelector(".chip-add-btn").addEventListener("click", ()=> toggleAddInline(addInlineId));
  }
}
function toggleAddInline(id){
  const el = document.getElementById(id);
  const showing = el.style.display === "flex";
  document.querySelectorAll(".add-inline").forEach(e => e.style.display = "none");
  el.style.display = showing ? "none" : "flex";
  if (!showing) el.querySelector("input").focus();
}

/* ---- 습득 장소 (층 -> 방) ---- */
function renderFloorRow(){
  pendingAddContext = regState.floor ? "room" : "floor";
  renderChipRow("reg-floor-row", getFloors(), (f)=> f===regState.floor, (f)=>{
    regState.floor = f;
    regState.room = null;
    renderFloorRow();
    renderRoomRow();
  }, "reg-location-add");
}
function renderRoomRow(){
  const el = document.getElementById("reg-room-row");
  if (!regState.floor){ el.innerHTML = ""; return; }
  pendingAddContext = "room";
  renderChipRow("reg-room-row", getRooms(regState.floor), (r)=> r===regState.room, (r)=>{
    regState.room = r;
    renderRoomRow();
  }, "reg-location-add");
}
function confirmAddLocation(prefix){
  const input = document.getElementById("reg-location-add-input");
  const val = input.value.trim();
  if (!val) return;
  if (!regState.floor){
    // 층이 아직 선택 안 됨 -> 새 층으로 추가
    CUSTOM.locations[val] = CUSTOM.locations[val] || [];
    saveCustomOptions(CUSTOM);
    regState.floor = val;
    renderFloorRow();
    renderRoomRow();
  } else {
    // 층이 선택됨 -> 해당 층의 방으로 추가
    CUSTOM.locations[regState.floor] = CUSTOM.locations[regState.floor] || [];
    CUSTOM.locations[regState.floor].push(val);
    saveCustomOptions(CUSTOM);
    regState.room = val;
    renderRoomRow();
  }
  input.value = "";
  document.getElementById("reg-location-add").style.display = "none";
}

/* ---- 습득 날짜 ---- */
function setRegDateMode(mode){
  regState.dateMode = mode;
  document.getElementById("btn-reg-date-auto").classList.toggle("active", mode==="auto");
  document.getElementById("btn-reg-date-manual").classList.toggle("active", mode==="manual");
  const input = document.getElementById("reg-date");
  if (mode === "auto"){
    regState.date = todayStr();
    input.value = regState.date;
    input.disabled = true;
  } else {
    input.disabled = false;
    input.value = "";
    regState.date = "";
    input.focus();
  }
}
document.getElementById("reg-date").addEventListener("change", (e)=>{ if (regState) regState.date = e.target.value; });

/* ---- 색상 (다중 선택, 스와치) ---- */
function renderColorGrid(){
  const el = document.getElementById("reg-color-grid");
  el.innerHTML = DEFAULTS.colors.map(c => `
    <button type="button" class="color-btn ${regState.colors.includes(c.name) ? "selected" : ""}"
      style="background-color:${c.hex};${c.hex === "#f5f5f5" ? "border:1px solid #475569;" : ""}"
      data-v="${esc(c.name)}" title="${esc(c.name)}"></button>
  `).join("");
  el.querySelectorAll(".color-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const v = btn.dataset.v;
      const idx = regState.colors.indexOf(v);
      if (idx > -1) regState.colors.splice(idx,1); else regState.colors.push(v);
      renderColorGrid();
    });
  });
}

/* ---- 분류 (단일 선택) ---- */
function renderCategoryRow(){
  renderChipRow("reg-category-row", getCategories(), (v)=> v===regState.category, (v)=>{
    regState.category = v;
    renderCategoryRow();
  }, "reg-category-add");
}
function confirmAddCategory(prefix){
  const input = document.getElementById("reg-category-add-input");
  const val = input.value.trim();
  if (!val) return;
  CUSTOM.categories.push(val);
  saveCustomOptions(CUSTOM);
  regState.category = val;
  renderCategoryRow();
  input.value = "";
  document.getElementById("reg-category-add").style.display = "none";
}

/* ---- 재질 (단일 선택, 선택 항목) ---- */
function renderMaterialRow(){
  renderChipRow("reg-material-row", getMaterials(), (v)=> v===regState.material, (v)=>{
    regState.material = (regState.material === v) ? null : v;
    renderMaterialRow();
  }, "reg-material-add");
}
function confirmAddMaterial(){
  const input = document.getElementById("reg-material-add-input");
  const val = input.value.trim();
  if (!val) return;
  CUSTOM.materials.push(val);
  saveCustomOptions(CUSTOM);
  regState.material = val;
  renderMaterialRow();
  input.value = "";
  document.getElementById("reg-material-add").style.display = "none";
}

/* ---- 크기 (단일 선택, 커스텀 추가 없음) ---- */
function renderSizeRow(){
  renderChipRow("reg-size-row", DEFAULTS.sizes, (v)=> v===regState.size, (v)=>{
    regState.size = (regState.size === v) ? null : v;
    renderSizeRow();
  }, null);
}

/* ---- 특이사항 (다중 선택) ---- */
function renderTagGrid(){
  const el = document.getElementById("reg-tag-grid");
  let html = getTags().map(t => `
    <button type="button" class="chip-btn ${regState.tags.includes(t) ? "selected" : ""}" data-v="${esc(t)}">${esc(t)}</button>
  `).join("");
  html += `<button type="button" class="chip-btn chip-add-btn" data-add="1">+ 직접 추가</button>`;
  el.innerHTML = html;
  el.querySelectorAll(".chip-btn:not(.chip-add-btn)").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const v = btn.dataset.v;
      const idx = regState.tags.indexOf(v);
      if (idx > -1) regState.tags.splice(idx,1); else regState.tags.push(v);
      renderTagGrid();
    });
  });
  el.querySelector(".chip-add-btn").addEventListener("click", ()=> toggleAddInline("reg-tag-add"));
}
function confirmAddTag(){
  const input = document.getElementById("reg-tag-add-input");
  const val = input.value.trim();
  if (!val) return;
  CUSTOM.tags.push(val);
  saveCustomOptions(CUSTOM);
  regState.tags.push(val);
  renderTagGrid();
  input.value = "";
  document.getElementById("reg-tag-add").style.display = "none";
}

/* =========================================================
   카메라
   ========================================================= */
let cameraStream = null;
function resetCameraUI(){
  stopCamera();
  document.getElementById("camera-video").style.display = "none";
  document.getElementById("camera-preview-img").style.display = "none";
  document.getElementById("camera-placeholder").style.display = "flex";
  document.getElementById("btn-camera-start").style.display = "inline-block";
  document.getElementById("btn-camera-capture").style.display = "none";
  document.getElementById("btn-camera-retake").style.display = "none";
}
function stopCamera(){
  if (cameraStream){
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
}
async function startCamera(){
  const video = document.getElementById("camera-video");
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode:"environment", width:{ideal:640}, height:{ideal:480} }, audio:false
    });
    video.srcObject = cameraStream;
    video.style.display = "block";
    document.getElementById("camera-placeholder").style.display = "none";
    document.getElementById("btn-camera-start").style.display = "none";
    document.getElementById("btn-camera-capture").style.display = "inline-block";
  } catch(err){
    // 폴백: 시스템 카메라 앱
    document.getElementById("camera-file-fallback").click();
  }
}
async function capturePhoto(){
  const video = document.getElementById("camera-video");
  const canvas = document.getElementById("camera-canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  const raw = canvas.toDataURL("image/jpeg", 0.85);
  await applyCapturedPhoto(raw);
  stopCamera();
}
async function applyCapturedPhoto(rawDataUrl){
  const compressed = await compressPhoto(rawDataUrl);
  regState.photo = compressed;
  const img = document.getElementById("camera-preview-img");
  img.src = compressed;
  img.style.display = "block";
  document.getElementById("camera-video").style.display = "none";
  document.getElementById("camera-placeholder").style.display = "none";
  document.getElementById("btn-camera-capture").style.display = "none";
  document.getElementById("btn-camera-start").style.display = "none";
  document.getElementById("btn-camera-retake").style.display = "inline-block";
}
function retakePhoto(){
  regState.photo = null;
  resetCameraUI();
}
function handleFileFallback(event){
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    await applyCapturedPhoto(reader.result);
  };
  reader.readAsDataURL(file);
  event.target.value = "";
}

/* =========================================================
   등록 제출
   ========================================================= */
function submitRegister(){
  regState.name = document.getElementById("reg-name").value.trim();
  regState.brand = document.getElementById("reg-brand").value.trim();
  regState.model = document.getElementById("reg-model").value.trim();
  regState.details = document.getElementById("reg-details").value.trim();

  const missing = [];
  if (!regState.floor || !regState.room) missing.push("습득 장소");
  if (regState.colors.length === 0) missing.push("색상");
  if (!regState.category) missing.push("물품 분류");

  if (missing.length){
    showModal("⚠️", `다음 항목을 확인해주세요:<br><b>${missing.join(", ")}</b>`);
    return;
  }

  const ticketNo = Store.nextTicketNo();
  const item = {
    id: "it_" + Date.now(),
    ticketNo,
    name: regState.name,
    floor: regState.floor,
    room: regState.room,
    date: regState.date || todayStr(),
    colors: regState.colors,
    category: regState.category,
    material: regState.material,
    size: regState.size,
    brand: regState.brand,
    model: regState.model,
    tags: regState.tags,
    details: regState.details,
    photo: regState.photo,
    status: "stored", // stored -> claim_requested -> done
    createdAt: Date.now(),
    claimedAt: null
  };

  const res = Store.add(item);
  if (!res.ok){
    showModal("❌", "저장 공간이 부족해요.<br>관리자에게 문의해주세요.");
    return;
  }

  const warn = res.photoDropped ? "<br><small>(저장 공간 부족으로 사진은 제외됐어요)</small>" : "";
  showModal("📦", `등록이 완료됐어요!<br><span class="modal-highlight">${ticketNo}</span>이 보관 번호예요.${warn}`, ()=>{
    navTo("home");
  });
}

/* =========================================================
   찾기 (아키네이터식 적응형 스무고개)
   ========================================================= */
const FindFlow = {
  candidates: [],
  askedKeys: [],

  ATTRS: [
    { key:"category", label:"물품 분류가 무엇인가요?", getValues:(it)=> it.category ? [it.category] : [] },
    { key:"floor",    label:"어느 층에서 습득/분실됐나요?", getValues:(it)=> it.floor ? [it.floor] : [] },
    { key:"room",     label:"층 내 어느 장소였나요?", getValues:(it)=> it.room ? [it.room] : [] },
    { key:"colors",   label:"물건의 색상은 무엇인가요?", getValues:(it)=> it.colors || [] },
    { key:"material", label:"재질은 무엇인가요?", getValues:(it)=> it.material ? [it.material] : [] },
    { key:"size",     label:"대략적인 크기는 어느 정도인가요?", getValues:(it)=> it.size ? [it.size] : [] },
    { key:"tags",     label:"해당하는 특이사항이 있나요?", getValues:(it)=> it.tags || [] }
  ],

  start(){
    this.candidates = Store.all().filter(it => it.status !== "done");
    this.askedKeys = [];
    this.next();
  },

  // 남은 후보를 가장 잘 나누는(값 종류가 여럿인) 속성을 다음 질문으로 선택
  pickNextAttr(){
    for (const attr of this.ATTRS){
      if (this.askedKeys.includes(attr.key)) continue;
      const valueSet = new Set();
      let anyHas = false;
      this.candidates.forEach(it => attr.getValues(it).forEach(v => { valueSet.add(v); anyHas = true; }));
      if (anyHas && valueSet.size > 1) return attr;
    }
    return null;
  },

  next(){
    if (this.candidates.length === 0){ this.renderEmpty(); return; }
    if (this.candidates.length <= 3){ this.renderResults(); return; }

    const attr = this.pickNextAttr();
    if (!attr){ this.renderResults(); return; }

    const valueCount = {};
    this.candidates.forEach(it => attr.getValues(it).forEach(v => { valueCount[v] = (valueCount[v]||0) + 1; }));
    const values = Object.keys(valueCount).sort((a,b)=> valueCount[b]-valueCount[a]);

    const body = document.getElementById("find-body");
    body.innerHTML = `
      <div class="verify-question-text">${esc(attr.label)}</div>
      <p class="hint-text">현재 후보 ${this.candidates.length}개 중에서 좁혀볼게요</p>
      <div class="option-grid" id="find-options"></div>
    `;
    const optGrid = document.getElementById("find-options");
    optGrid.innerHTML = values.map(v => `<button type="button" class="option-btn" data-v="${esc(v)}">${esc(v)}</button>`).join("")
      + `<button type="button" class="option-btn option-btn-unknown" data-skip="1">🤷 모르겠어요 (이 질문 건너뛰기)</button>`;

    optGrid.querySelectorAll(".option-btn:not(.option-btn-unknown)").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const v = btn.dataset.v;
        this.candidates = this.candidates.filter(it => attr.getValues(it).includes(v));
        this.askedKeys.push(attr.key);
        this.next();
      });
    });
    optGrid.querySelector(".option-btn-unknown").addEventListener("click", ()=>{
      this.askedKeys.push(attr.key);
      this.next();
    });
  },

  renderResults(){
    const body = document.getElementById("find-body");
    body.innerHTML = `
      <div class="verify-question-text">🔎 이런 물건이 있어요</div>
      <p class="hint-text">비슷한 물건을 눌러서 사진과 정보를 확인해보세요</p>
      <div id="find-result-list"></div>
    `;
    const list = document.getElementById("find-result-list");
    list.innerHTML = this.candidates.map((it, idx) => `
      <div class="result-card" data-idx="${idx}">
        <div class="result-thumb">${it.photo ? `<img src="${it.photo}">` : "📦"}</div>
        <div class="result-info">
          <div class="result-no">${esc(it.ticketNo)}</div>
          ${esc(it.category)} · ${esc((it.colors||[]).join("/"))} · ${esc(it.floor)} ${esc(it.room)}
        </div>
      </div>
    `).join("");
    list.querySelectorAll(".result-card").forEach(el=>{
      el.addEventListener("click", ()=> this.showDetail(Number(el.dataset.idx)));
    });
  },

  showDetail(idx){
    const it = this.candidates[idx];
    const photoHtml = it.photo ? `<img class="modal-photo" src="${it.photo}">` : "";
    const details = [
      it.name ? `물품명: ${esc(it.name)}` : null,
      `분류: ${esc(it.category)}`,
      `색상: ${esc((it.colors||[]).join(", "))}`,
      `장소: ${esc(it.floor)} ${esc(it.room)}`,
      it.material ? `재질: ${esc(it.material)}` : null,
      it.size ? `크기: ${esc(it.size)}` : null,
      it.brand ? `브랜드: ${esc(it.brand)}` : null,
      (it.tags && it.tags.length) ? `특이사항: ${esc(it.tags.join(", "))}` : null,
      it.details ? `기타: ${esc(it.details)}` : null
    ].filter(Boolean).join("<br>");

    showModal("📦", `
      ${photoHtml}
      <span class="modal-highlight">${esc(it.ticketNo)}</span>
      <div style="text-align:left; font-size:14px; line-height:1.8;">${details}</div>
    `);
    // 모달 안에 확인 버튼을 추가로 넣기 위해 닫기 버튼 옆에 삽입
    const closeBtn = document.getElementById("modalCloseBtn");
    let claimBtn = document.getElementById("modalClaimBtn");
    if (!claimBtn){
      claimBtn = document.createElement("button");
      claimBtn.id = "modalClaimBtn";
      claimBtn.className = "submit-btn";
      claimBtn.style.marginTop = "10px";
      closeBtn.insertAdjacentElement("beforebegin", claimBtn);
    }
    claimBtn.textContent = "이 물건이 맞아요 ✅";
    claimBtn.onclick = () => this.claim(it.id);
  },

  claim(id){
    Store.update(id, { status:"claim_requested", claimedAt: Date.now() });
    const it = Store.all().find(x => x.id === id);
    const claimBtn = document.getElementById("modalClaimBtn");
    if (claimBtn) claimBtn.remove();
    showModal("🙋", `<span class="modal-highlight">${esc(it.ticketNo)}</span>번 물건을 찾으러 오셨다고<br>담당자에게 말씀해주세요.<br>확인 후 바로 내어드려요.`, ()=>{
      navTo("home");
    });
  },

  renderEmpty(){
    document.getElementById("find-body").innerHTML = `
      <div class="verify-question-text">📭 비슷한 물건이 없어요</div>
      <p class="hint-text">아직 보관소에 등록되지 않았을 수 있어요. 담당자에게 직접 문의해주세요.</p>
    `;
  }
};
function startFindFlow(){
  navTo("find");
  FindFlow.start();
}

/* =========================================================
   관리자: PIN
   ========================================================= */
let pinBuffer = "";
function openAdmin(){
  pinBuffer = "";
  renderPinDots();
  navTo("admin-pin");
}
function renderPinDots(){
  document.querySelectorAll("#pinDisplay .pin-dot").forEach((el,i)=>{
    el.classList.toggle("filled", i < pinBuffer.length);
  });
}
function pinPress(d){
  if (pinBuffer.length >= 4) return;
  pinBuffer += String(d);
  renderPinDots();
  if (pinBuffer.length === 4) verifyPin();
}
function pinBackspace(){
  pinBuffer = pinBuffer.slice(0, -1);
  renderPinDots();
}
async function verifyPin(){
  const hash = await sha256(pinBuffer);
  if (hash === CONFIG.pinHash){
    navTo("admin");
    AdminPanel.render("all");
  } else {
    const disp = document.getElementById("pinDisplay");
    disp.style.animation = "none";
    setTimeout(()=> disp.style.animation = "", 10);
    pinBuffer = "";
    setTimeout(renderPinDots, 250);
  }
}

/* =========================================================
   관리자: 패널
   ========================================================= */
const AdminPanel = {
  currentTab: "all",
  tabs: [
    { key:"all", label:"전체" },
    { key:"waiting", label:"수령 요청" },
    { key:"stored", label:"보관 중" },
    { key:"done", label:"수령 완료" }
  ],
  render(tab){
    this.currentTab = tab;
    document.getElementById("admin-tabs").innerHTML = this.tabs.map(t => `
      <button type="button" class="admin-tab ${t.key===tab?'active':''}" data-tab="${t.key}">${t.label}</button>
    `).join("");
    document.querySelectorAll(".admin-tab").forEach(el=>{
      el.addEventListener("click", ()=> this.render(el.dataset.tab));
    });

    let items = Store.all().sort((a,b)=> b.createdAt - a.createdAt);
    if (tab === "waiting") items = items.filter(it => it.status === "claim_requested");
    if (tab === "stored") items = items.filter(it => it.status === "stored");
    if (tab === "done") items = items.filter(it => it.status === "done");

    const badgeMap = { stored:["보관 중","badge-stored"], claim_requested:["수령 요청","badge-waiting"], done:["수령 완료","badge-done"] };
    const list = document.getElementById("admin-list");
    list.innerHTML = items.length ? items.map(it=>{
      const [label, cls] = badgeMap[it.status];
      return `
        <div class="admin-row">
          <div class="admin-thumb">${it.photo ? `<img src="${it.photo}">` : "📦"}</div>
          <div class="admin-info">
            <span class="admin-no">${esc(it.ticketNo)}</span>
            <span class="admin-badge ${cls}">${label}</span><br>
            ${esc(it.category)} · ${esc((it.colors||[]).join("/"))} · ${esc(it.floor)} ${esc(it.room)}
          </div>
          <div class="admin-actions-inline">
            ${it.status !== "done" ? `<button style="background-color:#4ade80;" data-done="${it.id}">완료</button>` : ""}
            <button style="background-color:#f87171;" data-del="${it.id}">삭제</button>
          </div>
        </div>`;
    }).join("") : `<p style="text-align:center; color:#64748b; padding:30px 0;">항목이 없어요</p>`;

    list.querySelectorAll("[data-done]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        Store.update(btn.dataset.done, { status:"done" });
        this.render(this.currentTab);
      });
    });
    list.querySelectorAll("[data-del]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        if (!confirm("정말 삭제할까요?")) return;
        Store.remove(btn.dataset.del);
        this.render(this.currentTab);
      });
    });

    this.renderStorage();
  },
  renderStorage(){
    const bytes = Store.usageBytes();
    const limitBytes = 5 * 1024 * 1024; // localStorage 대략적 한도 가정치
    const pct = Math.min(100, Math.round(bytes / limitBytes * 100));
    document.getElementById("storageLabel").textContent = `${(bytes/1024).toFixed(0)}KB / 약 5MB (${pct}%)`;
    document.getElementById("storageBar").style.width = pct + "%";
  }
};

function exportLocalBackup(){
  const data = { items: Store.all(), customOptions: CUSTOM };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lostitems_backup_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function backupToServer(){
  const btn = document.getElementById("backupBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "전송 중...";
  try {
    const res = await fetch(CONFIG.backupUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: CONFIG.deviceId, data: Store.all(), timestamp: Date.now() })
    });
    if (!res.ok) throw new Error("bad status");
    btn.textContent = "✅ 백업 완료";
  } catch(e){
    btn.textContent = "❌ 실패 (인터넷 확인)";
  } finally {
    setTimeout(()=>{ btn.disabled = false; btn.textContent = original; }, 2500);
  }
}

/* =========================================================
   초기화
   ========================================================= */
document.addEventListener("DOMContentLoaded", ()=>{
  updateHomeCount();
  resetRegisterForm();
  resetIdleTimer();
});
