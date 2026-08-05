// 스마트 분실물 키오스크 - 로컬 서버
// 실행: node server.js
// 태블릿에서: node server.js  →  HAKiosk 앱으로 http://<태블릿IP>:8080 접속
// 안드로이드 스튜디오/별도 앱 빌드 불필요. 순수 정적 파일 + data.json 파일 입출력만 담당.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
const DATA_PATH = path.join(__dirname, 'data.json');
const PUBLIC_DIR = __dirname;

// 초기 시드 백업 (전체 초기화 시 이 값으로 되돌림). 서버 최초 기동 시 현재 data.json을 시드로 고정.
let SEED = null;
function loadSeedOnce() {
  if (SEED === null) {
    SEED = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  }
}

function readData() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// 4자리 보관 코드 생성 (기존 항목과 중복되지 않게)
function genCode(existingItems) {
  const used = new Set(existingItems.map((i) => i.code));
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (used.has(code));
  return code;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res, urlPath) {
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  filePath = path.join(PUBLIC_DIR, path.normalize(filePath).replace(/^(\.\.[\/\\])+/, ''));
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // 키오스크 태블릿 브라우저가 이전 버전의 html/js/css를 캐시해서
      // 최신 코드를 반영하지 못하는 문제를 막기 위해 캐시를 금지한다.
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache'
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  loadSeedOnce();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  try {
    // ---- API ----
    if (p === '/api/data' && req.method === 'GET') {
      return sendJSON(res, 200, readData());
    }

    if (p === '/api/items' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.name) return sendJSON(res, 400, { error: '물품명이 필요합니다.' });
      const data = readData();
      const item = {
        id: genId(),
        code: genCode(data.items),
        name: body.name,
        floor: body.floor || null,
        room: body.room || null,
        date: body.date || null,
        colors: Array.isArray(body.colors) ? body.colors : [],
        category: body.category || null,
        material: body.material || null,
        size: body.size || null,
        brand: body.brand || null,
        model: body.model || null,
        tags: Array.isArray(body.tags) ? body.tags : [],
        notes: body.notes || null,
        contents: body.contents || null,
        hiddenMark: body.hiddenMark || null,
        photo: body.photo || null,
        claimed: false,
        claimedBy: null,
        claimedAt: null,
        createdAt: new Date().toISOString()
      };
      data.items.push(item);
      writeData(data);
      return sendJSON(res, 201, { item });
    }

    // 본인확인 통과 후 수령 처리
    const claimMatch = p.match(/^\/api\/items\/([^/]+)\/claim$/);
    if (claimMatch && req.method === 'POST') {
      const body = await readBody(req);
      const data = readData();
      const item = data.items.find((i) => i.id === claimMatch[1]);
      if (!item) return sendJSON(res, 404, { error: '항목을 찾을 수 없습니다.' });
      item.claimed = true;
      item.claimedBy = body.claimantName || null;
      item.claimedAt = new Date().toISOString();
      writeData(data);
      return sendJSON(res, 200, { item });
    }

    // 관리자: 항목 수정 (부분 업데이트)
    const itemMatch = p.match(/^\/api\/items\/([^/]+)$/);
    if (itemMatch && req.method === 'PATCH') {
      const body = await readBody(req);
      const data = readData();
      const item = data.items.find((i) => i.id === itemMatch[1]);
      if (!item) return sendJSON(res, 404, { error: '항목을 찾을 수 없습니다.' });
      const editable = ['name', 'floor', 'room', 'date', 'colors', 'category', 'material', 'size', 'brand', 'model', 'tags', 'notes', 'contents', 'hiddenMark', 'claimed', 'claimedBy'];
      editable.forEach((k) => { if (k in body) item[k] = body[k]; });
      if (item.claimed === false) { item.claimedBy = null; item.claimedAt = null; }
      if (item.claimed === true && !item.claimedAt) { item.claimedAt = new Date().toISOString(); }
      writeData(data);
      return sendJSON(res, 200, { item });
    }

    // 관리자: 항목 삭제
    if (itemMatch && req.method === 'DELETE') {
      const data = readData();
      const before = data.items.length;
      data.items = data.items.filter((i) => i.id !== itemMatch[1]);
      if (data.items.length === before) return sendJSON(res, 404, { error: '항목을 찾을 수 없습니다.' });
      writeData(data);
      return sendJSON(res, 200, { ok: true });
    }

    // 자가성장형 값 추가 (카테고리/재질/태그/장소 등)
    if (p === '/api/meta' && req.method === 'POST') {
      const body = await readBody(req); // { field: 'categories', value: '...' } 또는 { field: 'rooms', floor: '2층', value: '...' }
      const data = readData();
      if (body.field === 'rooms') {
        if (!body.floor || !body.value) return sendJSON(res, 400, { error: 'floor, value 필요' });
        if (!data.meta.rooms[body.floor]) data.meta.rooms[body.floor] = [];
        if (!data.meta.rooms[body.floor].includes(body.value)) data.meta.rooms[body.floor].push(body.value);
      } else {
        if (!Array.isArray(data.meta[body.field])) return sendJSON(res, 400, { error: '알 수 없는 field' });
        if (!body.value) return sendJSON(res, 400, { error: 'value 필요' });
        if (!data.meta[body.field].includes(body.value)) data.meta[body.field].push(body.value);
      }
      writeData(data);
      return sendJSON(res, 200, { meta: data.meta });
    }

    // 전체 초기화 (발표/테스트용) - 서버 최초 기동 시점 데이터로 복원
    if (p === '/api/reset' && req.method === 'POST') {
      writeData(JSON.parse(JSON.stringify(SEED)));
      return sendJSON(res, 200, { ok: true });
    }

    if (p.startsWith('/api/')) {
      return sendJSON(res, 404, { error: 'Unknown API route' });
    }

    // ---- 정적 파일 ----
    return serveStatic(req, res, p);
  } catch (err) {
    return sendJSON(res, 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`스마트 분실물 키오스크 서버 실행 중: http://${HOST}:${PORT}`);
  console.log('태블릿/PC의 실제 IP로 접속하려면 위 IP를 네트워크 IP로 바꿔서 HAKiosk 등에 등록하세요.');
});
