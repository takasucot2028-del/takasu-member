// 会員種別
export type MemberType = 'general' | 'junior' | 'group';

// 支払方式（none = 徴収なし：自動請求の対象外、所属登録のみ）
export type PaymentMethod = 'monthly' | 'term3' | 'term1' | 'ticket' | 'none';

// 教室カテゴリ（継続会費の費目区分）
// classroom = 教室 / consigned = 教室（委託） / community = 教室（地域クラブ）
export type CourseCategory = 'classroom' | 'consigned' | 'community';

// 翌年度の継続意思（年度更新）
export type NextYearStatus = '' | 'continue' | 'withdraw';

// 請求ステータス
export type BillingStatus = 'pending' | 'billed' | 'completed' | 'failed';

// 町内外区分
export type AreaType = 'in_town' | 'out_of_town';

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
  insuranceEnrolled?: boolean;    // スポーツ安全保険 加入フラグ
  insuranceEnrolledAt?: string;   // 保険加入日（YYYY-MM-DD）
  nextYearStatus?: NextYearStatus; // 翌年度の継続意思
}

// 会員登録フォーム
export interface MemberFormData extends Omit<Member, 'id' | 'memberNumber' | 'isWithdrawn' | 'registeredAt'> {
  password: string;
}

// 請求レコード
export interface BillingRecord {
  id: string;
  memberId: string;
  memberNumber: string;
  memberName: string;
  yearMonth: string;
  dueDate: string;
  annualFee: number;
  insuranceFee: number;
  courseFee: number;
  adjustmentFee: number;
  adjustmentNote: string;
  total: number;
  status: BillingStatus;
  isRetry: boolean;
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

// API レスポンス共通
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
