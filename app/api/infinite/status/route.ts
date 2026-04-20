import { NextResponse } from 'next/server';
import { kisGet } from '@/lib/kis-api';
import { supabase } from '@/lib/supabase';
import { KIS_TR_IDS, INFINITE_BUY_PARAMS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function GET() {
  try {
    // 활성 사이클 조회
    const { data: cycle, error: cycleErr } = await supabase
      .from('infinite_buy_cycle')
      .select('*')
      .eq('status', 'active')
      .order('cycle_num', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cycleErr) throw new Error(cycleErr.message);
    if (!cycle) {
      return NextResponse.json({ cycle: null, balance: null, todayOrders: null });
    }

    // 현재가 상세 (환율 포함)
    const detail = await kisGet(
      '/uapi/overseas-price/v1/quotations/price-detail',
      KIS_TR_IDS.OS_PRICE_DETAIL,
      { AUTH: '', EXCD: 'NAS', SYMB: cycle.ticker },
    );
    await sleep(100);

    const currentPrice = parseFloat(detail.output?.last) || 0;
    const exchangeRate = parseFloat(detail.output?.t_rate) || 1440;

    // 해외주식 잔고
    const balRes = await kisGet(
      '/uapi/overseas-stock/v1/trading/inquire-balance',
      KIS_TR_IDS.OS_BALANCE,
      {
        CANO: process.env.KIS_CANO!,
        ACNT_PRDT_CD: process.env.KIS_ACNT_PRDT_CD || '01',
        OVRS_EXCG_CD: 'NASD',
        TR_CRCY_CD: 'USD',
        CTX_AREA_FK200: '',
        CTX_AREA_NK200: '',
      },
    );

    const holdings: Array<{
      ovrs_pdno: string; pchs_avg_pric: string; ovrs_cblc_qty: string;
      frcr_pchs_amt1: string; ovrs_stck_evlu_amt: string;
      frcr_evlu_pfls_amt: string; evlu_pfls_rt: string; now_pric2: string;
    }> = balRes.output1 || [];

    const holding = holdings.find(h => h.ovrs_pdno === cycle.ticker);

    const avgPrice = holding ? parseFloat(holding.pchs_avg_pric) : 0;
    const quantity = holding ? parseInt(holding.ovrs_cblc_qty) : 0;
    const investedUSD = holding ? parseFloat(holding.frcr_pchs_amt1) : 0;
    const evalUSD = holding ? parseFloat(holding.ovrs_stck_evlu_amt) : 0;
    const profitUSD = holding ? parseFloat(holding.frcr_evlu_pfls_amt) : 0;
    const profitRate = holding ? parseFloat(holding.evlu_pfls_rt) : 0;

    const slotAmountUSD = cycle.slot_amount_usd || 0;

    // 매수가능금액 조회
    await sleep(100);
    const psRes = await kisGet(
      '/uapi/overseas-stock/v1/trading/inquire-psamount',
      KIS_TR_IDS.OS_BUYABLE,
      {
        CANO: process.env.KIS_CANO!,
        ACNT_PRDT_CD: process.env.KIS_ACNT_PRDT_CD || '01',
        OVRS_EXCG_CD: 'NASD',
        ITEM_CD: cycle.ticker,
        OVRS_ORD_UNPR: currentPrice.toString(),
      },
    );

    const availableUSD = parseFloat(psRes.output?.ord_psbl_frcr_amt) || 0;
    const maxBuyShares = parseInt(psRes.output?.max_ord_psbl_qty) || 0;

    // 오늘의 주문 계산
    type OrderItem = { type: string; price: number; shares: number; desc: string };
    let buyOrders: OrderItem[] = [];
    let condition = '';

    if (quantity === 0) {
      // 첫 매수: 현재가 LOC
      const shares = Math.floor(slotAmountUSD / currentPrice);
      buyOrders = [{ type: '현재가 LOC', price: currentPrice, shares: Math.max(shares, 1), desc: '첫 매수' }];
      condition = `보유 없음 → 현재가 LOC ${shares}주`;
    } else if (currentPrice > avgPrice) {
      // 현재가 > 평단가
      const sharesPerSlot = Math.floor(slotAmountUSD / currentPrice);
      if (sharesPerSlot >= 2) {
        const halfShares = Math.floor(sharesPerSlot / 2);
        buyOrders = [
          { type: '평단가 LOC', price: Math.round(avgPrice * 100) / 100, shares: halfShares, desc: '종가 ≤ 평단가일 때 체결' },
          { type: '확보용 LOC', price: Math.round(avgPrice * INFINITE_BUY_PARAMS.secureMultiplier * 100) / 100, shares: halfShares, desc: '급등장 확보' },
        ];
        condition = `현재가 > 평단가, 1칸 ${sharesPerSlot}주 → 5:5 분할 (${halfShares}주씩)`;
      } else {
        buyOrders = [
          { type: '확보용 LOC', price: Math.round(avgPrice * INFINITE_BUY_PARAMS.secureMultiplier * 100) / 100, shares: 1, desc: '1칸 2주 미만 → 확보용 1주' },
        ];
        condition = `현재가 > 평단가, 1칸($${slotAmountUSD})÷현재가($${currentPrice})=${sharesPerSlot}주 → 2주 미만 → 확보용 LOC 1주`;
      }
    } else if (currentPrice === avgPrice) {
      // 현재가 = 평단가 → 확보용 LOC
      const sharesPerSlot = Math.floor(slotAmountUSD / currentPrice);
      buyOrders = [{
        type: '확보용 LOC',
        price: Math.round(avgPrice * INFINITE_BUY_PARAMS.secureMultiplier * 100) / 100,
        shares: Math.max(sharesPerSlot, 1),
        desc: `평단가 × ${INFINITE_BUY_PARAMS.secureMultiplier}`,
      }];
      condition = `현재가 = 평단가 → 확보용 LOC ${Math.max(sharesPerSlot, 1)}주`;
    } else {
      // 현재가 < 평단가
      const shares = Math.floor(slotAmountUSD / currentPrice);
      buyOrders = [{ type: '현재가 LOC', price: currentPrice, shares: Math.max(shares, 1), desc: '평단가 낮추기' }];
      condition = `현재가 < 평단가 → 현재가 LOC ${Math.max(shares, 1)}주`;
    }

    // 매도 주문
    const targetSellPrice = Math.round(avgPrice * INFINITE_BUY_PARAMS.tpMultiplier * 100) / 100;
    const sellOrder = quantity > 0
      ? { type: '전량 익절', price: targetSellPrice, shares: quantity, desc: `평단가 × ${INFINITE_BUY_PARAMS.tpMultiplier} 전량` }
      : null;

    return NextResponse.json({
      cycle: {
        cycleNum: cycle.cycle_num,
        ticker: cycle.ticker,
        startDate: cycle.start_date,
        usedSlots: cycle.used_slots,
        totalSlots: cycle.total_slots,
        slotAmountUSD,
        initialFundKRW: cycle.initial_fund_krw,
        initialFundUSD: cycle.initial_fund_usd,
      },
      balance: {
        avgPrice,
        quantity,
        investedUSD,
        currentPrice,
        evalUSD,
        profitUSD,
        profitRate,
        availableUSD,
        maxBuyShares,
      },
      todayOrders: {
        condition,
        buyOrders,
        sellOrder,
      },
      exchangeRate,
    });
  } catch (err: unknown) {
    console.error('[Infinite Status] 에러:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
