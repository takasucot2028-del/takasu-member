// 会員種別
export type MemberType = 'general' | 'junior' | 'group';

// 支払方式（none = 徴収なし：自動請求の対象外、所属登録のみ）
export type PaymentMethod = 'monthly' | 'term3' | 'term1' | 'ticket' | 'none';

// 教室カテゴリ（継続会費の費目区分）
// classroom = 教室 / consigned = 教室（委託） / community = 教室（地域クラブ）
export type CourseCategory = 'classroom' | 'consigned' | 'community';

// 翌年度の継続意思（年度更新）
export type NextYearStatus = '' | 'continue' | 'withdraw';

// 請求ステータス（carried = 引落不能を翌月へ繰越済）
export type BillingStatus = 'pending' | 'billed' | 'completed' | 'failed' | 'carried';

// 町内外区分
export type AreaType = 'in_town' | 'out_of_town';

// 性別（未設定可）
export type Gender = '' | 'male' | 'female';

// 教室マスタ
export interface Course {
  id: string;
  name: string;
  paymentMethod: PaymentMethod;
  category: CourseCategory;
  feeInTown: number;
  feeOutOfTown: number;
  note: string;
}

// 会員情報
export interface Member {
  id: string;
  memberNumber: string;
  memberType: MemberType;
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  birthDate: string;
  gender?: Gender;
  postalCode: string;
  address: string;
  areaType: AreaType;
  phone: string;
  email: string;
  courseIds: string[];
  isWithdrawn: boolean;
  registeredAt: string;
  // ジュニア会員
  school?: string;
  guardianLastName?: string;
  guardianFirstName?: string;
  guardianLastNameKana?: string;
  guardianFirstNameKana?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  // 団体会員
  groupName?: string;
  representativeName?: string;
  memberCount?: number;
  // 口座振替・保険・年度更新（事務局管理）
  cssNumber?: string;             // CSS番号（口座振替番号・家庭=兄弟で共通）
  schoolAidRecipient?: boolean;   // 就学援助受給世帯（地域クラブ参加費から毎月2,000円控除）
  insuranceEnrolled?: boolean;    // スポーツ安全保険 加入フラグ
  insuranceEnrolledAt?: string;   // 保険加入日（YYYY-MM-DD）
  nextYearStatus?: NextYearStatus; // 翌年度の継続意思
}

// 会員登録フォーム
export interface MemberFormData extends Omit<Member, 'id' | 'memberNumber' | 'isWithdrawn' | 'registeredAt'> {
  password: string;
}

// 請求レコード（継続会費）。費目は会員ごとの内訳列。
export interface BillingRecord {
  id: string;
  memberId: string;
  memberNumber: string;
  memberName: string;
  yearMonth: string;
  dueDate: string;
  annualFee: number;         // 年会費
  monthlyClassroom: number;  // 月会費（教室）
  monthlyConsigned: number;  // 月会費（委託）
  monthlyCommunity: number;  // 月会費（地域クラブ）
  insuranceFee: number;      // 保険料
  specialFee: number;        // 特別徴収
  specialNote: string;       // 特別徴収の備考
  subsidy: number;           // 就学援助補助（地域クラブ参加費の控除額・正の数。total から差引く）
  total: number;
  status: BillingStatus;
  isRetry: boolean;          // 引落不能の繰越（再請求）を含む
  carriedTo: string;         // 繰越先の対象年月（status=carried のとき）
}

// 団体請求
export interface GroupBilling {
  id: string;
  memberId: string;
  memberNumber: string;
  groupName: string;
  itemName: string;
  amount: number;
  dueDate: string;
  status: BillingStatus;
}

// ログインレスポンス
export interface AuthResponse {
  success: boolean;
  token?: string;
  member?: Member;        // 後方互換（単一・世帯の先頭）
  members?: Member[];     // 世帯（同一メールを共有する会員一覧）
  role?: 'member' | 'admin';
  error?: string;
}

// 請求スケジュール（3期・1期払い教室の請求月）。courseId -> 請求月(1-12)の配列。
// 年度ごとに事務局が設定する。3期払いは3つ、1期払いは1つを想定。
export type BillingSchedule = Record<string, number[]>;

// API レスポンス共通
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
