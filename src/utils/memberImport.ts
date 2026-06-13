// ============================================
// 既存会員データの一括インポート用ユーティリティ
// Excel/CSV を解析し、登録可能な会員データ配列に変換する。
// 実際の登録は呼び出し側で data 層の registerNewMember を行う。
// ============================================
import * as XLSX from 'xlsx';
import { COURSES } from './constants';
import type { MemberType, AreaType } from '../types';

// インポートテンプレートの列見出し（この順序・名称で出力／読込する）
export const IMPORT_HEADERS = [
  '会員種別', '姓', '名', 'セイ', 'メイ', '生年月日', '郵便番号', '住所', '町内外', '電話番号',
  'メールアドレス', 'パスワード', '教室（カンマ区切り）',
  '通学先', '保護者姓', '保護者名', '保護者セイ', '保護者メイ', '保護者電話', '保護者メール',
  '団体名', '代表者氏名', '加入人数',
  'CSS番号', '保険加入', '保険加入日',
] as const;

// インポート時のパスワード未指定者に割り当てる暫定パスワード（要・各自変更）
export const DEFAULT_IMPORT_PASSWORD = 'takasu-sc';

const TYPE_MAP: Record<string, MemberType> = {
  '一般': 'general', '一般会員': 'general',
  'ジュニア': 'junior', 'ジュニア会員': 'junior',
  '団体': 'group', '団体会員': 'group',
};
const AREA_MAP: Record<string, AreaType> = { '町内': 'in_town', '町外': 'out_of_town' };

// 教室名からスペース（全角含む）を除いた形をキーにした逆引き表（照合の表記ゆれ吸収用）
const COURSE_BY_NORM: Record<string, string> = Object.fromEntries(
  COURSES.map(c => [c.name.replace(/\s+/g, ''), c.id])
);

export interface ImportMember extends Record<string, unknown> {
  password: string;
}

export interface ParseResult {
  members: ImportMember[];
  errors: string[];
}

// 空テンプレート（見出しのみ）をダウンロードさせる
export function downloadTemplate(): void {
  const ws = XLSX.utils.aoa_to_sheet([IMPORT_HEADERS as unknown as string[]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '会員インポート');
  XLSX.writeFile(wb, '会員インポートテンプレート.xlsx');
}

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v).trim();
}

// Excel のシリアル日付値（例 42622）を YYYY-MM-DD に変換。
// Excel/CSV の日付セルは数値で渡ることがあるため、生年月日はこの関数で正規化する。
function excelSerialToISO(serial: number): string {
  // Excel の基準日 1899-12-30 から 1970-01-01 までの日数 = 25569
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 「保険加入」列の真偽判定。ON/有/加入/TRUE/1/○ などを加入(true)とみなす。
function boolFrom(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return ['on', '有', '加入', 'true', '1', '○', '◯', 'yes', 'はい'].includes(s);
}

function dateStr(v: unknown): string {
  if (v === undefined || v === null || v === '') return '';
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const day = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  if (typeof v === 'number') return excelSerialToISO(v);
  return String(v).trim();
}

// 教室名はスペースを含む（例「鷹栖REDWOLVES 男子U15」）ため、区切りは
// カンマ類（半角/全角カンマ・読点）のみとし、スペースでは区切らない。
// 照合時は前後・内部のスペース（全角含む）を無視して比較し、表記ゆれを吸収する。
function parseCourses(raw: string): { ids: string[]; unknown: string[] } {
  const ids: string[] = [];
  const unknown: string[] = [];
  raw.split(/[,，、]+/).map(s => s.trim()).filter(Boolean).forEach(name => {
    const id = COURSE_BY_NORM[name.replace(/\s+/g, '')];
    if (id) ids.push(id);
    else unknown.push(name);
  });
  return { ids, unknown };
}

// ファイル（ArrayBuffer）を解析して会員データ配列とエラー一覧を返す
export function parseWorkbook(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const members: ImportMember[] = [];
  const errors: string[] = [];

  rows.forEach((row, i) => {
    const lineNo = i + 2; // ヘッダー行 + 1始まり
    const typeRaw = str(row['会員種別']);
    const lastName = str(row['姓']);
    const firstName = str(row['名']);

    // 完全な空行はスキップ
    if (!typeRaw && !lastName && !firstName && !str(row['団体名'])) return;

    const memberType = TYPE_MAP[typeRaw];
    if (!memberType) {
      errors.push(`${lineNo}行目: 会員種別「${typeRaw}」が不正です（一般／ジュニア／団体）`);
      return;
    }

    const areaRaw = str(row['町内外']) || '町内';
    const areaType = AREA_MAP[areaRaw];
    if (!areaType) {
      errors.push(`${lineNo}行目: 町内外「${areaRaw}」が不正です（町内／町外）`);
      return;
    }

    // 必須チェック（団体は氏名の代わりに団体名・代表者）
    if (memberType === 'group') {
      if (!str(row['団体名'])) { errors.push(`${lineNo}行目: 団体名が未入力です`); return; }
    } else {
      if (!lastName || !firstName) { errors.push(`${lineNo}行目: 姓・名が未入力です`); return; }
    }
    if (!str(row['メールアドレス'])) { errors.push(`${lineNo}行目: メールアドレスが未入力です`); return; }

    // 教室の解決（団体は教室なし）
    let courseIds: string[] = [];
    if (memberType !== 'group') {
      const { ids, unknown } = parseCourses(str(row['教室（カンマ区切り）']));
      if (unknown.length > 0) {
        errors.push(`${lineNo}行目: 未知の教室名「${unknown.join('、')}」`);
        return;
      }
      courseIds = ids;
    }

    const password = str(row['パスワード']) || str(row['電話番号']).replace(/[^0-9]/g, '') || DEFAULT_IMPORT_PASSWORD;

    members.push({
      memberType,
      lastName, firstName,
      lastNameKana: str(row['セイ']),
      firstNameKana: str(row['メイ']),
      birthDate: dateStr(row['生年月日']),
      postalCode: str(row['郵便番号']),
      address: str(row['住所']),
      areaType,
      phone: str(row['電話番号']),
      email: str(row['メールアドレス']),
      password,
      courseIds,
      school: str(row['通学先']),
      guardianLastName: str(row['保護者姓']),
      guardianFirstName: str(row['保護者名']),
      guardianLastNameKana: str(row['保護者セイ']),
      guardianFirstNameKana: str(row['保護者メイ']),
      guardianPhone: str(row['保護者電話']),
      guardianEmail: str(row['保護者メール']),
      groupName: str(row['団体名']),
      representativeName: str(row['代表者氏名']),
      memberCount: parseInt(str(row['加入人数']), 10) || (memberType === 'group' ? 1 : 0),
      cssNumber: str(row['CSS番号']),
      insuranceEnrolled: boolFrom(row['保険加入']),
      insuranceEnrolledAt: dateStr(row['保険加入日']),
    });
  });

  return { members, errors };
}
