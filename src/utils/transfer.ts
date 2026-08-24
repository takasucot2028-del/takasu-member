// ============================================
// 口座振替（CSS収納代行）データ出力と振替結果帳票
// ============================================
import * as XLSX from 'xlsx';
import type { Member, BillingRecord, GroupBilling, Course } from '../types';
import { BILLING_STATUS_LABELS, PAYMENT_METHOD_LABELS } from './constants';

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

// === CSS加入者一覧からCSS番号を会員に紐付け（氏名照合・携帯で補助） ===
export interface CssMatchResult {
  updates: { memberId: string; cssNumber: string; memberNumber: string; name: string }[];
  unmatched: string[];   // 一致する会員が見つからない加入者名
  ambiguous: string[];   // 候補が複数あり特定できない
}

// ひらがな→カタカナ＋空白除去（会員のカナ＝ひらがな、CSS＝カタカナの差を吸収）
const toKatakana = (s: string) => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
const normKana = (s: string) => toKatakana(s).replace(/[\s　]/g, '');
const normKanji = (s: string) => s.replace(/[\s　]/g, '');

export function matchCssNumbers(buffer: ArrayBuffer, members: Member[]): CssMatchResult {
  const wb = XLSX.read(buffer, { type: 'array' });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const dig = (v: unknown) => String(v ?? '').replace(/[^0-9]/g, '');
  // 会員索引: 漢字（姓+名）／カナ（セイ+メイ・カタカナ正規化）
  const byKanji: Record<string, Member[]> = {};
  const byKana: Record<string, Member[]> = {};
  members.filter(m => !m.isWithdrawn).forEach(m => {
    (byKanji[normKanji(m.lastName + m.firstName)] ||= []).push(m);
    const kk = normKana(`${m.lastNameKana || ''}${m.firstNameKana || ''}`);
    if (kk) (byKana[kk] ||= []).push(m);
  });

  const updates: CssMatchResult['updates'] = [];
  const unmatched: string[] = [];
  const ambiguous: string[] = [];
  const seen = new Set<string>();

  rows.slice(1).forEach(r => {
    const code = String(r[1] ?? '').trim();
    const fullName = String(r[3] ?? '').trim();       // 例「遠藤　梨々花・有紗」
    const fullKana = String(r[2] ?? '').trim();       // 例「エンドウ　リリカ・アリサ」
    const phone = dig(r[19]);
    if (!code || !fullName) return;
    const parts = fullName.split(/[\s　]+/);
    if (parts.length < 2) { unmatched.push(`${code}: ${fullName}`); return; }
    const lastName = parts[0];
    const firstNames = parts.slice(1).join('').split('・').filter(Boolean);
    const kparts = fullKana.split(/[\s　]+/);
    const lastKana = kparts[0] || '';
    const firstKanas = (kparts.slice(1).join('') || '').split('・');
    firstNames.forEach((fn, i) => {
      let cands = (byKanji[normKanji(lastName + fn)] || []).filter(m => !seen.has(m.id));
      if (cands.length === 0 && lastKana && firstKanas[i]) {
        cands = (byKana[normKana(lastKana + firstKanas[i])] || []).filter(m => !seen.has(m.id));
      }
      if (cands.length > 1 && phone) {
        const byPhone = cands.filter(m => dig(m.phone) === phone || dig(m.guardianPhone) === phone);
        if (byPhone.length >= 1) cands = byPhone;
      }
      if (cands.length === 0) unmatched.push(`${lastName} ${fn}（CSS番号 ${code}）`);
      else if (cands.length > 1) ambiguous.push(`${lastName} ${fn}（CSS番号 ${code}・候補${cands.length}名）`);
      else {
        const m = cands[0]; seen.add(m.id);
        updates.push({ memberId: m.id, cssNumber: code, memberNumber: m.memberNumber, name: `${m.lastName} ${m.firstName}` });
      }
    });
  });
  return { updates, unmatched, ambiguous };
}

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

  // 会員の情報を集計先（家庭）に紐づける
  const attach = (a: Agg, m?: Member) => {
    if (!m) return;
    a.memberIds.add(m.id);
    if (!a.postal) { a.postal = m.postalCode || ''; a.address = m.address || ''; a.email = m.email || ''; a.phone = m.phone || ''; }
  };

  // 継続会費（当月分・特別徴収-adj-含む）
  billing.forEach(r => {
    const m = byId[r.memberId];
    const primary = String(m?.cssNumber ?? '').trim();
    // 地域クラブ参加費の引落口座。専用CSSが未設定なら主CSSを使う。
    const communityCss = String(m?.cssNumberCommunity ?? '').trim() || primary;
    // 就学援助補助は地域クラブ参加費からの控除（毎月2,000円）。地域クラブ額から差し引く。
    const communityNet = (r.monthlyCommunity || 0) - (r.subsidy || 0);
    const annual = r.annualFee || 0;
    const sanka = (r.monthlyClassroom || 0) + (r.specialFee || 0);
    const insurance = r.insuranceFee || 0;
    const consigned = r.monthlyConsigned || 0;

    // 地域クラブ以外の費目 → 主CSS番号
    if (primary && (annual + sanka + insurance + consigned) > 0) {
      const a = aggFor(primary);
      attach(a, m);
      a.annual += annual;
      a.sanka += sanka;
      a.insurance += insurance;
      a.consigned += consigned;
      if ((r.specialFee || 0) > 0 && r.specialNote) a.biko.push(r.specialNote);
    }
    // 地域クラブ参加費（純額）→ 地域クラブ用CSS番号（未設定なら主CSS）
    if (communityCss && communityNet > 0) {
      const a = aggFor(communityCss);
      attach(a, m);
      a.community += communityNet;
    }
  });

  // 当月に引き落とす団体請求（引落日が対象年月）
  groupBillings
    .filter(g => (g.dueDate || '').slice(0, 7) === yearMonth && g.status !== 'completed' && g.status !== 'failed')
    .forEach(g => {
      const m = byId[g.memberId];
      const code = String(m?.cssNumber ?? '').trim();
      if (!code) return; // CSS番号なしは振替不可のため出力対象外
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

// === 教室別集計表（当月の口座振替を教室ごとに、会員明細つきで集計） ===
export interface CourseTallyMember {
  memberNumber: string; name: string; area: string; cssNumber: string;
  fee: number;        // その教室の当月会費（振替額）
  annual: number;     // 年会費（会員単位・当月）
  insurance: number;  // 保険料（会員単位・当月）
  special: number;    // 特別徴収（会員単位・当月）
  total: number;      // fee + annual + insurance + special
}
export interface CourseTallyRow {
  courseId: string; name: string; paymentMethod: string;
  count: number; total: number; members: CourseTallyMember[];
  subFee: number; subAnnual: number; subInsurance: number; subSpecial: number;
}

// 当月に実際に口座振替（引落）がある教室だけを、会員明細つきで集計する。
// 会員単位で当月引落の有無を判定し（毎月払いは毎月、3期/1期/スケジュール制は請求月のみ）、
// 1人でも引落がある教室を表示する。請求月以外の教室は表示しない。
// 各会員の年会費・保険料・特別徴収は当月の請求データから併記（複数教室の会員は各教室に再掲）。
export function buildCourseTally(
  yearMonth: string, members: Member[], courses: Course[],
  schedule: Record<string, number[]>, billing: BillingRecord[]
): CourseTallyRow[] {
  const month = parseInt(yearMonth.split('-')[1], 10);
  const byId = new Map(courses.map(c => [c.id, c]));

  // 会員単位の年会費・保険料・特別徴収（当月の請求データを合算。-adj- の特別徴収も含む）
  const extra = new Map<string, { annual: number; insurance: number; special: number }>();
  billing.forEach(r => {
    const e = extra.get(r.memberId) || { annual: 0, insurance: 0, special: 0 };
    e.annual += r.annualFee || 0;
    e.insurance += r.insuranceFee || 0;
    e.special += r.specialFee || 0;
    extra.set(r.memberId, e);
  });

  const feeBearing = (pm: string) => pm === 'monthly' || pm === 'term3' || pm === 'term1' || pm === 'scheduled';
  const roster = new Map<string, CourseTallyMember[]>();
  const others: CourseTallyMember[] = []; // 口座振替対象の所属教室が無い会員

  members
    .filter(m => !m.isWithdrawn && m.memberType !== 'group')
    .forEach(m => {
      // 入会月より前の月は請求しない（請求生成と同じ判定）
      if (m.registeredAt && m.registeredAt.slice(0, 7) > yearMonth) return;
      const ex = extra.get(m.id) || { annual: 0, insurance: 0, special: 0 };
      const primary = String(m.cssNumber ?? '').trim();
      const communityCss = String(m.cssNumberCommunity ?? '').trim() || primary;

      // 参加している口座振替対象の教室と、当月の教室会費（請求月以外は0）
      const memCourses = (m.courseIds || [])
        .map(cid => byId.get(cid))
        .filter((c): c is Course => !!c && feeBearing(c.paymentMethod))
        .map(c => {
          const billed = c.paymentMethod === 'monthly' || (schedule[c.id] || []).includes(month);
          const fee = billed ? (m.areaType === 'in_town' ? c.feeInTown : c.feeOutOfTown) : 0;
          return { c, fee };
        });

      // その会員の当月振替合計（教室会費＋年会費＋保険料＋特別徴収）。0なら掲載しない。
      const transfer = memCourses.reduce((s, x) => s + x.fee, 0) + ex.annual + ex.insurance + ex.special;
      if (transfer <= 0) return;

      const base = {
        memberNumber: m.memberNumber,
        name: `${m.lastName} ${m.firstName}`.trim(),
        area: m.areaType === 'in_town' ? '町内' : '町外',
      };
      if (memCourses.length > 0) {
        // 参加教室ごとに掲載（年会費・保険料・特別徴収は各教室に再掲）
        memCourses.forEach(({ c, fee }) => {
          const css = c.category === 'community' ? communityCss : primary;
          const list = roster.get(c.id) || [];
          list.push({
            ...base, cssNumber: css, fee,
            annual: ex.annual, insurance: ex.insurance, special: ex.special,
            total: fee + ex.annual + ex.insurance + ex.special,
          });
          roster.set(c.id, list);
        });
      } else {
        // 口座振替対象の所属教室が無い会員（年会費・保険料・特別徴収のみ）
        others.push({
          ...base, cssNumber: primary, fee: 0,
          annual: ex.annual, insurance: ex.insurance, special: ex.special,
          total: ex.annual + ex.insurance + ex.special,
        });
      }
    });

  // 教室マスタの並び順で、振替がある会員がいる教室のみ（会員は会員番号順）
  const rows: CourseTallyRow[] = courses
    .filter(c => roster.has(c.id))
    .map(c => {
      const ms = roster.get(c.id)!.sort((a, b) => a.memberNumber.localeCompare(b.memberNumber));
      return {
        courseId: c.id, name: c.name, paymentMethod: c.paymentMethod,
        count: ms.length, total: ms.reduce((s, x) => s + x.total, 0), members: ms,
        subFee: ms.reduce((s, x) => s + x.fee, 0),
        subAnnual: ms.reduce((s, x) => s + x.annual, 0),
        subInsurance: ms.reduce((s, x) => s + x.insurance, 0),
        subSpecial: ms.reduce((s, x) => s + x.special, 0),
      };
    });

  if (others.length) {
    others.sort((a, b) => a.memberNumber.localeCompare(b.memberNumber));
    rows.push({
      courseId: '__other__', name: '所属教室なし（年会費・保険料・特別徴収）', paymentMethod: '',
      count: others.length, total: others.reduce((s, x) => s + x.total, 0), members: others,
      subFee: 0,
      subAnnual: others.reduce((s, x) => s + x.annual, 0),
      subInsurance: others.reduce((s, x) => s + x.insurance, 0),
      subSpecial: others.reduce((s, x) => s + x.special, 0),
    });
  }
  return rows;
}

// 教室別集計表を印刷用ウィンドウで開く（ブラウザの「PDFに保存」で出力）。
// 教室ごとに口座振替する会員一覧と各会員の振替内容を表示する。
// 日本語フォントをそのまま使えるよう、外部PDFライブラリではなく印刷方式を採用。
export function openCourseSummaryPdf(yearMonth: string, rows: CourseTallyRow[]): boolean {
  const esc = (s: string) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  const [y, m] = yearMonth.split('-');
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  const totalAmount = rows.reduce((s, r) => s + r.total, 0);
  const today = new Date().toLocaleDateString('ja-JP');

  const yen = (n: number) => (n ? n.toLocaleString() + '円' : '—');
  const monthLabel = `${y}年${parseInt(m, 10)}月`;
  const sections = rows.map((r, i) => {
    const memberRows = r.members.map(mem =>
      `<tr><td>${esc(mem.memberNumber)}</td><td>${esc(mem.name)}</td>` +
      `<td class="c">${mem.area}</td>` +
      `<td class="c">${mem.cssNumber ? esc(mem.cssNumber) : '<span class="miss">未設定</span>'}</td>` +
      `<td class="r">${yen(mem.fee)}</td><td class="r">${yen(mem.annual)}</td>` +
      `<td class="r">${yen(mem.insurance)}</td><td class="r">${yen(mem.special)}</td>` +
      `<td class="r tot">${mem.total.toLocaleString()}円</td></tr>`
    ).join('');
    return `<div class="course${i < rows.length - 1 ? ' brk' : ''}">
      <h1>教室別 口座振替明細　<span class="pm">${monthLabel}</span></h1>
      <h2>${esc(r.name)}${r.courseId === '__other__' ? '' : `<span class="pm">（${esc(PAYMENT_METHOD_LABELS[r.paymentMethod] || r.paymentMethod)}）</span>`}</h2>
      <table>
        <thead><tr>
          <th>会員番号</th><th>氏名</th><th class="c">区分</th><th class="c">CSS番号</th>
          <th class="r">教室会費</th><th class="r">年会費</th><th class="r">保険料</th><th class="r">特別徴収</th><th class="r">合計</th>
        </tr></thead>
        <tbody>${memberRows}</tbody>
        <tfoot><tr>
          <td colspan="4">小計　${r.count}名</td>
          <td class="r">${yen(r.subFee)}</td><td class="r">${yen(r.subAnnual)}</td>
          <td class="r">${yen(r.subInsurance)}</td><td class="r">${yen(r.subSpecial)}</td>
          <td class="r tot">${r.total.toLocaleString()}円</td>
        </tr></tfoot>
      </table>
      <div class="foot">出力日: ${today}　／　一般社団法人たかすスポーツクラブ</div>
    </div>`;
  }).join('');
  const empty = rows.length === 0 ? '<p class="muted">当月に請求される教室会費はありません。</p>' : '';

  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<title>教室別集計表_${y}年${parseInt(m, 10)}月</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Yu Gothic","Meiryo",sans-serif; color:#1e2a32; margin:20px; }
  h1 { font-size:17px; margin:0 0 8px; }
  h1 .pm { font-size:13px; color:#5e6e78; font-weight:normal; }
  h2 { font-size:15px; margin:0 0 6px; padding-bottom:3px; border-bottom:2px solid #12324a; }
  h2 .pm { font-size:12px; color:#5e6e78; font-weight:normal; }
  .course { margin-bottom:20px; }
  .course.brk { page-break-after: always; }
  table { border-collapse:collapse; width:100%; font-size:12px; }
  th,td { border:1px solid #c9d2d8; padding:5px 7px; }
  th { background:#12324a; color:#fff; text-align:left; }
  td.r,th.r { text-align:right; }
  td.c,th.c { text-align:center; }
  td.tot { font-weight:bold; }
  tbody tr:nth-child(even) td { background:#f4f7f9; }
  tfoot td { font-weight:bold; background:#e8eef2; }
  .miss { color:#c0392b; }
  .muted { color:#8a97a0; }
  .foot { color:#8a97a0; font-size:10px; margin-top:6px; }
  .note { color:#5e6e78; font-size:11px; margin-top:12px; line-height:1.6; }
  .btns { margin-bottom:16px; }
  button { font-size:13px; padding:8px 16px; margin-right:8px; cursor:pointer; }
  @media print { .btns, .note { display:none; } body { margin:0; } }
</style></head><body>
  <div class="btns">
    <button onclick="window.print()">印刷 / PDFに保存</button>
    <button onclick="window.close()">閉じる</button>
  </div>
  <div class="note">
    ※ 教室ごとにページを分けて印刷されます（教室担当者への配布用）。当月に何らかの口座振替がある会員を、参加教室ごとに掲載します（教室会費が請求月以外の教室は教室会費「—」で、その会員の年会費・保険料・特別徴収を表示）。所属教室が無い会員は「所属教室なし」ページに掲載します。<br>
    ※ 年会費・保険料・特別徴収は会員単位（当月）です。複数教室に参加する会員は各教室ページに再掲されるため、教室をまたいだ単純合算は二重計上になります。<br>
    ※ CSS番号は引落口座（地域クラブは地域クラブ用CSS／未設定なら主CSS）。「未設定」の会員は口座振替できないため会員詳細で設定してください。
  </div>
  ${sections}${empty}
  <script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>
</body></html>`;
  void totalCount; void totalAmount;

  const w = window.open('', '_blank');
  if (!w) return false; // ポップアップブロック
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  return true;
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
    '就学援助補助': r.subsidy ? -r.subsidy : 0,
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
