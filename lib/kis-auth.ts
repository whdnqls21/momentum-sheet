import { KIS_BASE_URL } from './constants';
import { supabase } from './supabase';

/** 만료 1시간 전까지 유효하면 재사용 */
function isValid(expiresAt: number): boolean {
  return Date.now() < expiresAt - 3600 * 1000;
}

export async function getToken(): Promise<string> {
  // DB에서 토큰 조회
  const { data: row } = await supabase
    .from('kis_token')
    .select('access_token, expires_at, issued_at')
    .eq('id', 1)
    .single();

  if (row) {
    const expiresAt = new Date(row.expires_at).getTime();
    const issuedAt = row.issued_at ? new Date(row.issued_at).getTime() : 0;

    // expires_at 기준 유효
    if (isValid(expiresAt)) {
      console.log('[KIS Auth] DB 토큰 사용, 만료:', row.expires_at);
      return row.access_token;
    }

    // issued_at 기준 최근 발급 (24시간 유효)
    if (issuedAt > 0) {
      const estimatedExpiry = issuedAt + 23 * 3600 * 1000;
      if (Date.now() < estimatedExpiry) {
        console.log('[KIS Auth] issued_at 기준 토큰 사용, 발급:', row.issued_at);
        return row.access_token;
      }
    }
  }

  // 새로 발급
  return issueAndSave();
}

async function issueAndSave(): Promise<string> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;

  if (!appKey || !appSecret) {
    throw new Error('KIS_APP_KEY / KIS_APP_SECRET 환경변수가 설정되지 않았습니다.');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          appkey: appKey,
          appsecret: appSecret,
        }),
      });

      if (!res.ok) {
        throw new Error(`토큰 발급 실패: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();

      if (!data.access_token) {
        throw new Error(`토큰 응답 이상: ${JSON.stringify(data)}`);
      }

      const expiresAt = Date.now() + data.expires_in * 1000;

      // Supabase UPSERT
      const { error: upsertError } = await supabase
        .from('kis_token')
        .upsert({
          id: 1,
          access_token: data.access_token,
          expires_at: new Date(expiresAt).toISOString(),
          issued_at: new Date().toISOString(),
        });

      if (upsertError) {
        console.error('[KIS Auth] Supabase 저장 실패:', upsertError.message);
      }

      console.log('[KIS Auth] 토큰 발급 성공, 만료:', new Date(expiresAt).toLocaleString('ko-KR'));
      return data.access_token;
    } catch (err) {
      lastError = err as Error;
      console.error(`[KIS Auth] 토큰 발급 시도 ${attempt + 1}/3 실패:`, lastError.message);
      if (attempt < 2) await delay(1000);
    }
  }

  throw lastError || new Error('토큰 발급 실패');
}

/** 최근 60초 이내 발급된 토큰인지 DB에서 확인 */
export async function wasTokenRecentlyIssued(withinMs = 60_000): Promise<boolean> {
  const { data: row } = await supabase
    .from('kis_token')
    .select('issued_at')
    .eq('id', 1)
    .single();

  if (!row?.issued_at) return false;
  const issuedAt = new Date(row.issued_at).getTime();
  return issuedAt > 0 && (Date.now() - issuedAt) < withinMs;
}

/** DB 토큰 무효화 (expires_at을 과거로 설정) */
export async function invalidateToken() {
  await supabase
    .from('kis_token')
    .update({ expires_at: new Date(0).toISOString() })
    .eq('id', 1);
  console.log('[KIS Auth] DB 토큰 무효화 완료');
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}