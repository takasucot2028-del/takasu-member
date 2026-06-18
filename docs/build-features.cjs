/* 機能一覧概要 .docx ジェネレーター（マニュアルと同体裁） */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, PageBreak,
} = require('docx');

const JP = 'Yu Gothic';
const CW = 9360;

const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });

function P(runs, opts = {}) {
  const children = (Array.isArray(runs) ? runs : [runs]).map(r =>
    typeof r === 'string' ? new TextRun(r) : new TextRun(r));
  return new Paragraph({ children, spacing: { after: 120, line: 276 }, ...opts });
}
const bold = (text) => ({ text, bold: true });
function bullet(text) {
  const children = Array.isArray(text)
    ? text.map(r => (typeof r === 'string' ? new TextRun(r) : new TextRun(r)))
    : [new TextRun(text)];
  return new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 60, line: 264 }, children });
}

const cb = { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' };
const borders = { top: cb, bottom: cb, left: cb, right: cb };
function tcell(text, width, { headerCell = false, align = AlignmentType.LEFT, fill } = {}) {
  const runs = (Array.isArray(text) ? text : [text]).map(t =>
    new TextRun(typeof t === 'string' ? { text: t, bold: headerCell } : { bold: headerCell, ...t }));
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    shading: fill ? { fill, type: ShadingType.CLEAR } : (headerCell ? { fill: 'D6E4F0', type: ShadingType.CLEAR } : undefined),
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    children: [new Paragraph({ alignment: align, spacing: { after: 0, line: 252 }, children: runs })],
  });
}
function table(widths, rows) {
  return new Table({
    width: { size: CW, type: WidthType.DXA }, columnWidths: widths,
    rows: rows.map((cells, ri) => new TableRow({
      tableHeader: ri === 0,
      children: cells.map((c, ci) => {
        const opt = (c && typeof c === 'object' && !Array.isArray(c) && 'text' in c) ? c : { text: c };
        return tcell(opt.text, widths[ci], { headerCell: ri === 0, align: opt.align, fill: opt.fill });
      }),
    })),
  });
}
const spacer = () => new Paragraph({ spacing: { after: 80 }, children: [] });

const children = [];

// 表紙
children.push(new Paragraph({ spacing: { before: 1800, after: 200 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: 'たかすスポーツクラブ', size: 36, bold: true })] }));
children.push(new Paragraph({ spacing: { after: 120 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '会員管理システム', size: 56, bold: true, color: '1F4E79' })] }));
children.push(new Paragraph({ spacing: { after: 1200 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '機能一覧（概要）', size: 44, bold: true })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '一般社団法人たかすスポーツクラブ', size: 24 })] }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// 目次
children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('目次')] }));
children.push(new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-2' }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// システム全体像
children.push(H1('システムの全体像'));
children.push(P('1つのWebシステムで、URLによって「会員側」と「事務局側」の2系統に分かれます。専用アプリのインストールは不要で、パソコン・スマートフォンのWebブラウザで動作します。入力したデータはGoogleスプレッドシートに保存され、複数のスタッフが同じデータを共有します。'));
children.push(table([3000, 6360], [
  ['区分', '利用者と役割'],
  [bold('会員側'), '会員本人が、登録・情報修正・参加教室の選択を行う'],
  [bold('事務局側'), '事務局スタッフが、名簿・請求・口座振替を管理する'],
]));

// 1. 会員側機能
children.push(H1('1. 会員側機能'));
children.push(table([2600, 2100, 4660], [
  ['機能', '画面', '概要'],
  ['新規会員登録', '/#/register', '一般／ジュニア／団体の区分で入会申込。登録時に事務局へ自動通知メールが届く'],
  ['会員ログイン', '/#/', 'メールアドレスとパスワードでログイン'],
  ['マイページ', '/#/mypage', '登録情報の確認・修正、参加教室の選択・変更、パスワード変更'],
]));

// 2. 事務局側機能
children.push(H1('2. 事務局側機能'));

children.push(H2('2-1. 会員管理'));
children.push(table([3000, 6360], [
  ['機能', '概要'],
  ['会員一覧・検索', '氏名・会員番号・団体名で検索、退会者の表示切替、Excel出力'],
  ['一括インポート', '既存会員をExcel／CSVで一括登録（重複は自動スキップ。データ移行用）'],
  ['年度更新', '退会希望者の退会処理と継続者の繰越を一括実行'],
  ['会員詳細・編集', '全項目の閲覧・編集、退会／復帰処理'],
  ['事務局専用項目', 'CSS番号、地域クラブ用CSS、就学援助、保険加入、翌年度意思の管理'],
]));

children.push(H2('2-2. 名簿・保険'));
children.push(table([3000, 6360], [
  ['機能', '概要'],
  ['教室別名簿', '教室ごとの参加者一覧・人数表示・Excel出力（ジュニアは保護者情報付き）'],
  ['保険管理', '新規保険加入者の確認（翌月の請求に計上）、保険加入の一括インポート'],
]));

children.push(H2('2-3. 請求・口座振替'));
children.push(table([3000, 6360], [
  ['機能', '概要'],
  ['継続会費管理', '月次請求の自動生成（年会費・月会費・保険料・就学援助控除）、特別徴収、請求月設定、ステータス管理、引落不能の自動繰越'],
  ['団体請求管理', '団体会員への大会参加費などの個別請求'],
  ['口座振替', 'CSS様式の振替データ出力（CSS番号ごとに合算）、CSS番号の一括設定、振替結果帳票、未設定警告'],
  ['引落不能管理', '引き落としできなかった請求の一覧・繰越・手動での完了処理'],
]));

// 3. 費用・運用の要点
children.push(H1('3. 費用・運用の要点'));
children.push(bullet([bold('会員種別：'), '一般（年会費1,000円）／ジュニア（町内0円・町外500円）／団体（1,000円）']));
children.push(bullet([bold('保険料：'), 'ジュニア800円／人、団体800円×加入人数（一般は対象外）']));
children.push(bullet([bold('教室：'), '全29種。支払方式は毎月払い・3期払い・1期払い・チケット制・徴収なしの5種']));
children.push(bullet([bold('支払い：'), '口座振替のみ。引落日は毎月27日、手続き締切は毎月10日']));
children.push(bullet([bold('就学援助：'), '受給世帯は地域クラブ参加費から毎月2,000円を控除']));

// 4. システム基盤・技術
children.push(H1('4. システム基盤・技術'));
children.push(table([3000, 6360], [
  ['項目', '内容'],
  ['フロントエンド', 'React 19 + TypeScript + Tailwind CSS（GitHub Pages で公開）'],
  ['バックエンド', 'Google Apps Script + Google スプレッドシート'],
  ['コスト', '完全無料構成'],
  ['自動メール', '新規入会通知（事務局宛）、会員へのログイン案内メール'],
]));
children.push(spacer());
children.push(P([{ text: '本概要は現行システムの機能に基づいて作成しています。機能の追加・変更により内容が一部異なることがあります。', italics: true }]));

const doc = new Document({
  creator: 'たかすスポーツクラブ事務局',
  title: '会員管理システム 機能一覧（概要）',
  styles: {
    default: { document: { run: { font: JP, size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, font: JP, color: '1F4E79' },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1F4E79', space: 4 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 25, bold: true, font: JP, color: '2E5C8A' },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 600, hanging: 280 } } } },
      ] },
    ],
  },
  sections: [{
    properties: { page: {
      size: { width: 12240, height: 15840 },
      margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    } },
    headers: { default: new Header({ children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 2 } },
      children: [new TextRun({ text: 'たかすスポーツクラブ 会員管理システム 機能一覧（概要）', size: 16, color: '888888' })],
    })] }) },
    footers: { default: new Footer({ children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '888888' })],
    })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then(buffer => {
  const out = path.join(__dirname, '機能一覧概要.docx');
  fs.writeFileSync(out, buffer);
  console.log('wrote', out, buffer.length, 'bytes');
});
