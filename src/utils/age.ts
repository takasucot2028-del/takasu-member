// 年度（4月1日始まり）を基準にした満年齢を計算するユーティリティ。
// 「その年度の年齢」= その年度の4月1日時点の満年齢、と定義する。
// 値は保存せず、生年月日から表示のたびに算出する（常に最新になる）。

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (!m) return null;
  return { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) };
}

// 指定日（既定: 今日）が属する年度（西暦）。1〜3月は前年始まりの年度に属する。
export function currentFiscalYear(today: Date = new Date()): number {
  return today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
}

// 生年月日（YYYY-MM-DD）から「その年度の4月1日時点の満年齢」を返す。
// 生年月日が空・不正な場合や、基準日より前に生まれていない場合は null。
// タイムゾーンの影響を避けるため Date 同士の比較ではなく年月日の数値で計算する。
export function calcFiscalAge(birthDate: string, today: Date = new Date()): number | null {
  const b = parseYmd(birthDate);
  if (!b) return null;
  const fyYear = currentFiscalYear(today);
  // 基準日 = fyYear 年 4月1日。基準日時点でまだ誕生日を迎えていなければ1引く。
  let age = fyYear - b.y;
  const birthdayAfterApr1 = b.m > 4 || (b.m === 4 && b.d > 1);
  if (birthdayAfterApr1) age -= 1;
  return age < 0 ? null : age;
}

// 表示用ラベル（例: "15歳"）。算出できない場合は空文字。
export function fiscalAgeLabel(birthDate: string, today: Date = new Date()): string {
  const a = calcFiscalAge(birthDate, today);
  return a === null ? '' : `${a}歳`;
}
