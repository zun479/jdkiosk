// jd-kiosk 백업 서버 (Cloudflare Worker)
// 엔드포인트:
//   POST /backup  - 태블릿이 전체 데이터(JSON)를 보내면 KV에 저장
//   GET  /backup  - 저장된 최신 백업 전체를 반환 (복원용)
//   GET  /status  - 가벼운 상태만 반환 (itemCount, maxItemCount, lastSyncAt, backupCount)
//                   태블릿이 "내 로컬 데이터가 날아갔는지" 확인할 때 이걸 씀
//
// 모든 요청은 Authorization: Bearer <AUTH_TOKEN> 헤더가 있어야 함.

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store'
  };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: corsHeaders() });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!env.AUTH_TOKEN || token !== env.AUTH_TOKEN) {
      return json({ error: 'unauthorized' }, 401);
    }

    const url = new URL(request.url);

    if (url.pathname === '/backup' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: '잘못된 JSON입니다.' }, 400);
      }
      const itemCount = Array.isArray(body.items) ? body.items.length : 0;

      const metaRaw = await env.KIOSK_BACKUP.get('meta');
      const prevMeta = metaRaw ? JSON.parse(metaRaw) : { maxItemCount: 0, backupCount: 0 };

      const newMeta = {
        itemCount,
        maxItemCount: Math.max(prevMeta.maxItemCount || 0, itemCount),
        lastSyncAt: new Date().toISOString(),
        backupCount: (prevMeta.backupCount || 0) + 1
      };

      await env.KIOSK_BACKUP.put('latest', JSON.stringify(body));
      await env.KIOSK_BACKUP.put('meta', JSON.stringify(newMeta));

      return json({ ok: true, meta: newMeta });
    }

    if (url.pathname === '/backup' && request.method === 'GET') {
      const data = await env.KIOSK_BACKUP.get('latest');
      if (!data) return json({ error: '저장된 백업이 없습니다.' }, 404);
      return new Response(data, { headers: corsHeaders() });
    }

    if (url.pathname === '/status' && request.method === 'GET') {
      const metaRaw = await env.KIOSK_BACKUP.get('meta');
      const meta = metaRaw ? JSON.parse(metaRaw) : { itemCount: 0, maxItemCount: 0, lastSyncAt: null, backupCount: 0 };
      return json(meta);
    }

    return json({ error: 'Not found' }, 404);
  }
};
