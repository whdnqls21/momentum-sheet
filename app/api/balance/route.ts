import { NextResponse } from 'next/server';
import { kisGet } from '@/lib/kis-api';
import { KIS_TR_IDS } from '@/lib/constants';
import type { BalanceResponse, Holding } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cano = process.env.KIS_CANO;
    const acntPrdtCd = process.env.KIS_ACNT_PRDT_CD || '01';

    if (!cano) {
      return NextResponse.json({ error: 'KIS_CANO 환경변수 미설정' }, { status: 500 });
    }

    const params: Record<string, string> = {
      CANO: cano,
      ACNT_PRDT_CD: acntPrdtCd,
      AFHR_FLPR_YN: 'N',
      INQR_DVSN: '01',
      UNPR_DVSN: '01',
      FUND_STTL_ICLD_YN: 'N',
      FNCG_AMT_AUTO_RDPT_YN: 'N',
      PRCS_DVSN: '00',
      CTX_AREA_FK100: '',
      CTX_AREA_NK100: '',
    };

    const data = await kisGet(
      '/uapi/domestic-stock/v1/trading/inquire-balance',
      KIS_TR_IDS.BALANCE,
      params
    );

    // output1: 종목별 배열
    const holdings: Holding[] = (data.output1 || [])
      .filter((item: any) => parseInt(item.hldg_qty) > 0)
      .map((item: any) => ({
        code: item.pdno,
        name: item.prdt_name,
        qty: parseInt(item.hldg_qty),
        avgPrice: Math.round(parseFloat(item.pchs_avg_pric)),
        currentPrice: parseInt(item.prpr),
        evalAmt: parseInt(item.evlu_amt),
        pnl: parseInt(item.evlu_pfls_amt),
        pnlRate: parseFloat(item.evlu_pfls_rt),
        change: parseFloat(item.fltt_rt),
      }));

    // output2: 계좌 요약 (배열의 첫 번째)
    const summary = data.output2?.[0] || {};

    const response: BalanceResponse = {
      summary: {
        cashBalance: parseInt(summary.dnca_tot_amt || '0'),
        d2Balance: parseInt(summary.prvs_rcdl_excc_amt || '0'),
        totalPurchase: parseInt(summary.pchs_amt_smtl_amt || '0'),
        totalEval: parseInt(summary.evlu_amt_smtl_amt || '0'),
        totalPnl: parseInt(summary.evlu_pfls_smtl_amt || '0'),
        totalPnlRate:
          parseInt(summary.pchs_amt_smtl_amt || '0') > 0
            ? (parseInt(summary.evlu_pfls_smtl_amt || '0') /
                parseInt(summary.pchs_amt_smtl_amt || '0')) *
              100
            : 0,
      },
      holdings,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err: any) {
    console.error('[API /balance] 에러:', err.message);
    return NextResponse.json(
      { error: err.message || '잔고 조회 실패' },
      { status: 500 }
    );
  }
}
