// ============================================
// 口座振替（CSS収納代行）データ出力と振替結果帳票
// ============================================
import * as XLSX from 'xlsx';
import type { Member, BillingRecord, GroupBilling } from '../types';
import { BILLING_STATUS_LABELS } from './constants';

// たかすスポーツクラブの団体コード（CSS収納代行が発行・全行共通の固定値）
export const CSS_TEAM_CODE = 940005766;
// X列（前回確定額など）の既定値。実データでは "000000000000"。
const CSS_X_ZERO = '000000000000';

// CSS「加入者一覧」様式の列（この順序で出力する）
export const CSS_COLUMNS = [
  '団体コード', '加入者コード', '加入者名カナ', '加入者名', '請求状態',
  '年会費', '参加費', '保険料', '参加費（地域クラブ）', '参加費（委託）',
  '銀行コード', '支店コード', '預金種目', '口座番号', '口座名義人',
  '新規コード', '郵便番号', '住所', 'メールアドレス', '携帯電話番号', '備考',
  '年会費X', '参加費X', '保険料X', '参加費（地域クラブ）X', '参加費（委託）X', '最終振替年月',
];

interface Agg {
  code: string;
  memberIds: Set<string>;
  annual: number;     // 年会費
  sanka: number;      // 参加費（月会費(教室) + 特別徴収 + 団体請求）
  insurance: number;  // 保険料
  community: number;  // 参加費（地域クラブ）
  consigned: number;  // 参加費（委託）
  biko: string[];     // 備考（特別徴収・団体請求の内容）
  postal: string; address: string; email: string; phone: string;
}

// CSS番号（家庭）ごとに集計。継続会費＋特別徴収＋当月の団体請求を合算する。
export function buildCssRows(
  yearMonth: string,
  members: Member[],
  billing: BillingRecord[],
  groupBillings: GroupBilling[]
): (string | number)[][] {
  const byId: Record<string, Member> = {};
  members.forEach(m => { byId[m.id] = m; });

  const map: Record<string, Agg> = {};
  const aggFor = (code: string): Agg => {
    if (!map[code]) {
      map[code] = {
        code, memberIds: new Set(), annual: 0, sanka: 0, insurance: 0, community: 0, consigned: 0,
        biko: [], postal: '', address: '', email: '', phone: '',
      };
    }
    return map[code];
  };

  // 継続会費（当月分・特別徴収-adj-含む）
  billing.forEach(r => {
    const m = byId[r.memberId];
    const code = (m?.cssNumber || '').trim();
    const a = aggFor(code);
    if (m) {
      a.memberIds.add(m.id);
      if (!a.postal) { a.postal = m.postalCode || ''; a.address = m.address || ''; a.email = m.email || ''; a.phone = m.phone || ''; }
    }
    a.annual += r.annualFee || 0;
    a.sanka += (r.monthlyClassroom || 0) + (r.specialFee || 0);
    a.insurance += r.insuranceFee || 0;
    a.community += r.monthlyCommunity || 0;
    a.consigned += r.monthlyConsigned || 0;
    if ((r.specialFee || 0) > 0 && r.specialNote) a.biko.push(r.specialNote);
  });

  // 当月に引き落とす団体請求（引落日が対象年月）
  groupBillings
    .filter(g => (g.dueDate || '').slice(0, 7) === yearMonth && g.status !== 'completed' && g.status !== 'failed')
    .forEach(g => {
      const m = byId[g.memberId];
      const code = (m?.cssNumber || '').trim();
      const a = aggFor(code);
      if (m) a.memberIds.add(m.id);
      a.sanka += g.amount || 0;
      a.biko.push(g.itemName || '団体請求');
    });

  // 加入者名（連名）とカナを作る
  const nameOf = (a: Agg): { name: string; kana: string } => {
    const ms = [...a.memberIds].map(id => byId[id]).filter(Boolean) as Member[];
    if (ms.length === 0) return { name: '', kana: '' };
    const allIndividual = ms.every(m => m.memberType !== 'group');
    const lastNames = new Set(ms.map(m => m.lastName));
    if (allIndividual && lastNames.size === 1) {
      // 兄弟など同姓 → 「姓　名1・名2」（姓名の区切りは全角スペース）
      const name = `${ms[0].lastName}　${ms.map(m => m.firstName).join('・')}`;
      const kana = `${ms[0].lastNameKana || ''}　${ms.map(m => m.firstNameKana || '').join('・')}`;
      return { name, kana };
    }
    const name = ms.map(m => (m.memberType === 'group' ? (m.groupName || '') : `${m.lastName}　${m.firstName}`)).join('・');
    const kana = ms.map(m => (m.memberType === 'group' ? '' : `${m.lastNameKana || ''}　${m.firstNameKana || ''}`)).join('・');
    return { name, kana };
  };

  const rows: (string | number)[][] = [CSS_COLUMNS.slice()];
  Object.values(map).forEach(a => {
    const { name, kana } = nameOf(a);
    rows.push([
      CSS_TEAM_CODE,      // 団体コード（固定）
      a.code,             // 加入者コード（CSS番号）
      kana,               // 加入者名カナ
      name,               // 加入者名
      0,                  // 請求状態
      a.annual,           // 年会費（0でも数値）
      a.sanka,            // 参加費（教室＋特別徴収＋団体）
      a.insurance,        // 保険料
      a.community,        // 参加費（地域クラブ）
      a.consigned,        // 参加費（委託）
      '', '', '', '', '', // 銀行コード〜口座名義人（CSSが保持・コードで照合）
      0,                  // 新規コード
      a.postal, a.address, a.email, a.phone,
      a.biko.join(' / '), // 備考
      CSS_X_ZERO, CSS_X_ZERO, CSS_X_ZERO, CSS_X_ZERO, CSS_X_ZERO, // X列
      '',                 // 最終振替年月
    ]);
  });
  return rows;
}

export function downloadCssExport(
  yearMonth: string, members: Member[], billing: BillingRecord[], groupBillings: GroupBilling[]
): number {
  const rows = buildCssRows(yearMonth, members, billing, groupBillings);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '加入者一覧');
  XLSX.writeFile(wb, `口座振替データ_${yearMonth}.xlsx`);
  return rows.length - 1; // データ件数
}

// 振替結果帳票（会員ごとの内訳と状態）
export function downloadResultReport(yearMonth: string, billing: BillingRecord[]): void {
  const rows = billing.map(r => ({
    '会員番号': r.memberNumber,
    '氏名': r.memberName,
    '年会費': r.annualFee,
    '月会費(教室)': r.monthlyClassroom,
    '月会費(委託)': r.monthlyConsigned,
    '月会費(地域クラブ)': r.monthlyCommunity,
    '保険料': r.insuranceFee,
    '特別徴収': r.specialFee,
    '特別徴収備考': r.specialNote,
    '合計': r.total,
    '引落日': r.dueDate,
    '振替結果': BILLING_STATUS_LABELS[r.status] || r.status,
    '再請求': r.isRetry ? '○' : '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `振替結果_${yearMonth}`);
  XLSX.writeFile(wb, `振替結果帳票_${yearMonth}.xlsx`);
}
