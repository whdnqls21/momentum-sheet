import { NextResponse } from 'next/server';
import { kisGet } from '@/lib/kis-api';
import { INFINITE_BUY_STOCKS, INFINITE_BUY_PARAMS, KIS_TR_IDS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** RSI(14) 계산 — Wilder's Smoothing */
function calcRSI14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  const changes = closes.slice(1).map((p, i) => p - closes[i]);

  let avgGain = changes.slice(0, 14).filter(c => c > 0).reduce((a, b) => a + b, 0) / 14;
  let avgLoss = changes.slice(0, 14).filter(c => c < 0).map(Math.abs).reduce((a, b) => a + b, 0) / 14;

  for (let i = 14; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * 13 + gain) / 14;
    avgLoss = (avgLoss * 13 + loss) / 14;
  }

  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export async function GET() {
  try {
    // 먼저 아무 종목이나 현재가 조회해서 환율 가져오기
    const firstStock = INFINITE_BUY_STOCKS[0];
    const priceRes = await kisGet(
      '/uapi/overseas-price/v1/quotations/price-detail',
      KIS_TR_IDS.OS_PRICE_DETAIL,
      { AUTH: '', EXCD: firstStock.excd, SYMB: firstStock.ticker },
    );
    const exchangeRate = parseFloat(priceRes.output?.t_rate) || 1440;
    const totalFundUSD = Math.round((INFINITE_BUY_PARAMS.totalFundKRW / exchangeRate) * 100) / 100;
    const slotAmountUSD = Math.round((totalFundUSD / INFINITE_BUY_PARAMS.totalSlots) * 100) / 100;

    const results: Record<string, unknown> = {};

    for (const stock of INFINITE_BUY_STOCKS) {
      await sleep(100);

      // 현재가 상세
      const detail = await kisGet(
        '/uapi/overseas-price/v1/quotations/price-detail',
        KIS_TR_IDS.OS_PRICE_DETAIL,
        { AUTH: '', EXCD: stock.excd, SYMB: stock.ticker },
      );
      await sleep(100);

      const price = parseFloat(detail.output?.last) || 0;
      const high52 = parseFloat(detail.output?.h52p) || 0;
      const low52 = parseFloat(detail.output?.l52p) || 0;

      // 기간별시세 (최근 30일)
      const dailyRes = await kisGet(
        '/uapi/overseas-price/v1/quotations/dailyprice',
        KIS_TR_IDS.OS_DAILY_PRICE,
        { AUTH: '', EXCD: stock.excd, SYMB: stock.ticker, GUBN: '0', BYMD: '', MODP: '1' },
      );
      await sleep(100);

      const dailyArr: Array<{ clos: string }> = dailyRes.output2 || [];
      // 오래된순으로 변환하여 RSI 계산
      const closes = dailyArr.map(d => parseFloat(d.clos)).filter(v => v > 0).reverse();
      const rsi14 = calcRSI14(closes);

      // 1M 수익률 (약 20거래일)
      const month1Return = closes.length >= 21
        ? ((closes[closes.length - 1] - closes[closes.length - 21]) / closes[closes.length - 21]) * 100
        : null;

      const dropFromHigh = high52 > 0 ? ((price - high52) / high52) * 100 : 0;
      const sharesPerSlot = Math.floor(slotAmountUSD / price);
      const buyable = sharesPerSlot >= 1;

      // 점수 계산
      // 52주 고점 대비 하락률 (40%) — 하락률 클수록 높은 점수
      const maxDrop = 50; // 50% 이상 하락은 100점
      const dropScore = Math.min(Math.abs(dropFromHigh) / maxDrop * 100, 100) * 0.4;

      // RSI(14) (30%) — 낮을수록 높은 점수
      const rsiScore = rsi14 !== null ? (100 - rsi14) * 0.3 : 0;

      // 1칸 매수 가능 여부 (20%)
      const buyableScore = buyable ? 100 * 0.2 : 0;

      // 최근 1M 낙폭 (10%) — 낙폭 클수록 높은 점수
      const monthScore = month1Return !== null
        ? Math.min(Math.abs(Math.min(month1Return, 0)) / 30 * 100, 100) * 0.1
        : 0;

      const score = Math.round(dropScore + rsiScore + buyableScore + monthScore);

      results[stock.ticker.toLowerCase()] = {
        ticker: stock.ticker,
        price,
        high52,
        low52,
        dropFromHigh: Math.round(dropFromHigh * 10) / 10,
        rsi14: rsi14 !== null ? Math.round(rsi14 * 10) / 10 : null,
        sharesPerSlot,
        month1Return: month1Return !== null ? Math.round(month1Return * 10) / 10 : null,
        score,
        buyable,
      };
    }

    // 추천 결정: buyable인 종목 중 점수 높은 쪽
    const candidates = Object.values(results) as Array<{
      ticker: string; score: number; buyable: boolean;
      dropFromHigh: number; rsi14: number | null;
    }>;
    const buyableCandidates = candidates.filter(c => c.buyable);

    let recommendation: { ticker: string; reason: string } | null = null;
    if (buyableCandidates.length > 0) {
      const best = buyableCandidates.sort((a, b) => b.score - a.score)[0];
      recommendation = {
        ticker: best.ticker,
        reason: `52주 고점 대비 ${best.dropFromHigh > 0 ? '+' : ''}${best.dropFromHigh}%, RSI ${best.rsi14 ?? 'N/A'}, 1칸 매수 가능`,
      };
    }

    return NextResponse.json({
      ...results,
      recommendation,
      params: {
        totalFundKRW: INFINITE_BUY_PARAMS.totalFundKRW,
        exchangeRate,
        totalFundUSD,
        slotAmountUSD,
      },
    });
  } catch (err: unknown) {
    console.error('[Infinite Recommend] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
