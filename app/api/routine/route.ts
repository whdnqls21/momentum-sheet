import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RoutineItem {
  time: string;
  tag: 'sw' | 'sec' | 'bb';
  label: string;
  action: string;
  sheet: string;
  sheetPath: string;
  done: boolean;
  highlight: boolean;
  warn?: boolean;
}

// ── KST 날짜/시간 유틸 ──
function getKST() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();
  const day = now.getUTCDay(); // 0=일 ~ 6=토
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();

  // 오늘 날짜 (YYYY-MM-DD)
  const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;

  // 이번 주 월요일
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(year, month, date + mondayOffset));
  const mondayStr = monday.toISOString().slice(0, 10);

  // 이번 달 1일
  const firstOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;

  // 월말 여부 (오늘 포함 남은 영업일 3일 이내)
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const isMonthEnd = date >= lastDay - 2;

  const isWeekend = day === 0 || day === 6;
  const isFriday = day === 5;

  return { year, month, date, day, hour, minute, todayStr, mondayStr, firstOfMonth, isMonthEnd, isWeekend, isFriday };
}

export async function GET() {
  try {
    const kst = getKST();

    // 1. 보유 종목 (sell_date IS NULL)
    const { data: openJournal } = await supabase
      .from('journal')
      .select('strategy, ticker_code, ticker_name, buy_price, buy_qty, buy_amount')
      .is('sell_date', null);

    const holdings: Record<string, { ticker_name: string; ticker_code: string } | null> = {
      swing: null,
      sector: null,
      bollinger: null,
    };

    if (openJournal) {
      for (const j of openJournal) {
        if (j.strategy === 'swing' || j.strategy === 'sector' || j.strategy === 'bollinger') {
          holdings[j.strategy] = { ticker_name: j.ticker_name, ticker_code: j.ticker_code };
        }
      }
    }

    // 2. 스크리닝 이력
    const [swingRes, sectorRes, bollingerRes] = await Promise.all([
      // 스윙: 이번 주 월요일 이후 스크리닝 여부
      supabase
        .from('screening_history')
        .select('id, screen_date, selected_ticker, selected_name')
        .eq('strategy', 'swing')
        .gte('screen_date', kst.mondayStr)
        .limit(1),
      // 섹터: month_num = 현재월 (월초에 실행하므로)
      supabase
        .from('screening_history')
        .select('id, screen_date, selected_ticker, selected_name')
        .eq('strategy', 'sector')
        .eq('year', kst.year)
        .eq('month_num', kst.month + 1) // getUTCMonth() is 0-based, month_num is 1-based
        .limit(1),
      supabase
        .from('screening_history')
        .select('id, screen_date, selected_ticker, selected_name')
        .eq('strategy', 'bollinger')
        .eq('screen_date', kst.todayStr)
        .limit(1),
    ]);

    const screeningStatus = {
      swing: {
        done: !!(swingRes.data && swingRes.data.length > 0),
        selectedName: swingRes.data?.[0]?.selected_name || null,
      },
      sector: {
        done: !!(sectorRes.data && sectorRes.data.length > 0),
        selectedName: sectorRes.data?.[0]?.selected_name || null,
      },
      bollinger: {
        done: !!(bollingerRes.data && bollingerRes.data.length > 0),
        selectedName: bollingerRes.data?.[0]?.selected_name || null,
      },
    };

    // 3. 루틴 생성
    const routines: RoutineItem[] = [];

    if (kst.isWeekend) {
      return NextResponse.json({
        routines: [],
        holdings,
        screeningStatus,
        dayOfWeek: kst.day,
        isWeekend: true,
        kstHour: kst.hour,
        kstMinute: kst.minute,
      });
    }

    const isMonday = kst.day === 1;

    // ── 볼린저 루틴 ──
    // 볼린저 스크리닝 (매일 08:00~)
    if (screeningStatus.bollinger.done) {
      routines.push({
        time: '08:00~',
        tag: 'bb',
        label: '볼린저',
        action: '✅ 볼린저 스크리닝 완료',
        sheet: '볼린저',
        sheetPath: '/bollinger',
        done: true,
        highlight: false,
      });
    } else {
      routines.push({
        time: '08:00~',
        tag: 'bb',
        label: '볼린저',
        action: '⚠ [스크리닝 실행] 매수 신호 확인 → 08:50 매수',
        sheet: '볼린저',
        sheetPath: '/bollinger',
        done: false,
        highlight: false,
        warn: true,
      });
    }

    // 보유 중이면 보유종목 확인 (장중)
    if (holdings.bollinger) {
      routines.push({
        time: '장중',
        tag: 'bb',
        label: '볼린저',
        action: '[보유종목 확인] MA20 돌파 / %B 확인',
        sheet: '볼린저',
        sheetPath: '/bollinger',
        done: false,
        highlight: false,
      });
    }

    // ── 섹터 루틴 ──
    // 이번 달 타겟 없음 → 스크리닝 필요
    if (!screeningStatus.sector.done && !holdings.sector) {
      routines.push({
        time: '08:00~',
        tag: 'sec',
        label: '섹터',
        action: `⚠ [섹터 스크리닝] ${kst.month + 1}월 진입 대상 확정`,
        sheet: '섹터로테이션',
        sheetPath: '/sector',
        done: false,
        highlight: false,
        warn: true,
      });
    }

    // 타겟 있음 + 미보유 → RSI 대기
    if (screeningStatus.sector.done && !holdings.sector && screeningStatus.sector.selectedName) {
      routines.push({
        time: '08:00~',
        tag: 'sec',
        label: '섹터',
        action: `[RSI 새로고침] RSI < 50 확인 → 08:50 매수 (${screeningStatus.sector.selectedName})`,
        sheet: '섹터로테이션',
        sheetPath: '/sector',
        done: false,
        highlight: false,
      });
    }

    // 월말 섹터 매도
    if (kst.isMonthEnd && holdings.sector) {
      routines.push({
        time: '15:20',
        tag: 'sec',
        label: '섹터',
        action: `보유 종목 종가 매도 확인 (${holdings.sector.ticker_name})`,
        sheet: '섹터로테이션',
        sheetPath: '/sector',
        done: false,
        highlight: false,
      });
    }

    // ── 스윙 루틴 ──
    // 금요일 스윙 매도
    if (kst.isFriday && holdings.swing) {
      routines.push({
        time: '15:20',
        tag: 'sw',
        label: '스윙',
        action: `보유 종목 종가 매도 확인 (${holdings.swing.ticker_name})`,
        sheet: '단기스윙',
        sheetPath: '/swing',
        done: false,
        highlight: false,
      });
    }

    // 스윙 스크리닝 상태
    if (screeningStatus.swing.done) {
      routines.push({
        time: '월 08:00~',
        tag: 'sw',
        label: '스윙',
        action: screeningStatus.swing.selectedName
          ? `✅ 이번 주 완료: ${screeningStatus.swing.selectedName} — 08:50 매수`
          : '✅ 이번 주 완료: 매수 후보 없음',
        sheet: '단기스윙',
        sheetPath: '/swing',
        done: true,
        highlight: false,
      });
    } else if (isMonday) {
      routines.push({
        time: '08:00~',
        tag: 'sw',
        label: '스윙',
        action: '⚠ [스크리닝 실행] PASS+60↑ 확인 → 08:50 매수',
        sheet: '단기스윙',
        sheetPath: '/swing',
        done: false,
        highlight: false,
        warn: true,
      });
    } else {
      routines.push({
        time: '월 08:00~',
        tag: 'sw',
        label: '스윙',
        action: '⚠ 스윙 스크리닝 필요',
        sheet: '단기스윙',
        sheetPath: '/swing',
        done: false,
        highlight: false,
        warn: true,
      });
    }

    // 시간순 정렬
    const timeOrder: Record<string, number> = {
      '08:00~': 1,
      '월 08:00~': 1,
      '장중': 2,
      '15:20': 3,
    };
    routines.sort((a, b) => (timeOrder[a.time] || 99) - (timeOrder[b.time] || 99));

    // 하이라이트: 미완료 중 첫 항목
    const firstPending = routines.find(r => !r.done);
    if (firstPending) firstPending.highlight = true;

    return NextResponse.json({
      routines,
      holdings,
      screeningStatus,
      dayOfWeek: kst.day,
      isWeekend: false,
      kstHour: kst.hour,
      kstMinute: kst.minute,
    });
  } catch (err: any) {
    console.error('[Routine API] 에러:', err.message);
    return NextResponse.json({ error: err.message || '루틴 조회 실패' }, { status: 500 });
  }
}
