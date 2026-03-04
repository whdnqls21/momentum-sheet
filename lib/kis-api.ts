import { getToken, invalidateToken, wasTokenRecentlyIssued } from './kis-auth';
import { acquireSlot } from './rate-limiter';
import { KIS_BASE_URL } from './constants';

interface KisResponse {
  rt_cd: string;   // '0' = 성공
  msg_cd: string;
  msg1: string;
  output1?: any;
  output2?: any;
  output?: any;
  [key: string]: any;
}

async function buildHeaders(trId: string) {
  const token = await getToken();
  return {
    'Content-Type': 'application/json; charset=utf-8',
    authorization: `Bearer ${token}`,
    appkey: process.env.KIS_APP_KEY!,
    appsecret: process.env.KIS_APP_SECRET!,
    tr_id: trId,
    custtype: 'P',
  };
}

export async function kisGet(
  path: string,
  trId: string,
  params: Record<string, string>
): Promise<KisResponse> {
  await acquireSlot();

  const url = new URL(path, KIS_BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  let headers = await buildHeaders(trId);
  let lastError: Error | null = null;

  // 1회 재시도
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url.toString(), { headers, cache: 'no-store' });
      const data: KisResponse = await res.json().catch(() => ({ rt_cd: '1', msg_cd: '', msg1: `HTTP ${res.status}` }));

      // 토큰 만료: HTTP 500이어도 body에 EGW00123이면 재발급 후 재시도
      const msgCd = data?.msg_cd || '';
      const msg1 = data?.msg1 || '';
      if (attempt === 0 && (msgCd === 'EGW00123' || msg1.includes('token'))) {
        if (await wasTokenRecentlyIssued()) {
          console.log(`[KIS API] 최근 발급 토큰으로 EGW00123 수신, 1초 후 동일 토큰 재시도`);
          await new Promise(r => setTimeout(r, 1000));
          await acquireSlot();
          continue;
        }
        console.log(`[KIS API] 토큰 만료 감지 (${msgCd}), 재발급 후 재시도`);
        await invalidateToken();
        headers = await buildHeaders(trId);
        await acquireSlot();
        continue;
      }

      if (!res.ok) throw new Error(`KIS API ${res.status}: ${res.statusText}`);
      if (data.rt_cd !== '0') throw new Error(`KIS API 에러: [${msgCd}] ${msg1}`);

      return data;
    } catch (err) {
      lastError = err as Error;
      console.error(`[KIS API] ${trId} 시도 ${attempt + 1}/2 실패:`, lastError.message);
      if (attempt === 0) {
        await acquireSlot();
      }
    }
  }

  throw lastError || new Error(`KIS API 호출 실패: ${trId}`);
}

export async function kisPost(
  path: string,
  trId: string,
  body: Record<string, any>
): Promise<KisResponse> {
  await acquireSlot();

  const url = `${KIS_BASE_URL}${path}`;
  const headers = await buildHeaders(trId);

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`KIS API POST ${res.status}: ${res.statusText}`);
  }

  const data: KisResponse = await res.json();

  if (data.rt_cd !== '0') {
    throw new Error(`KIS API 에러: [${data.msg_cd}] ${data.msg1}`);
  }

  return data;
}
