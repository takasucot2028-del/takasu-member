/* 事務局運用マニュアル .docx ジェネレーター */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, TabStopType, TabStopPosition,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, PageBreak,
} = require('docx');

const JP = 'Yu Gothic';
const CW = 9360; // content width (US Letter, 1" margins)

// ---- helpers ----
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });

function P(runs, opts = {}) {
  const children = (Array.isArray(runs) ? runs : [runs]).map(r =>
    typeof r === 'string' ? new TextRun(r) : new TextRun(r));
  return new Paragraph({ children, spacing: { after: 120, line: 276 }, ...opts });
}
const bold = (text) => ({ text, bold: true });

function bullet(text, level = 0) {
  const children = Array.isArray(text)
    ? text.map(r => (typeof r === 'string' ? new TextRun(r) : new TextRun(r)))
    : [new TextRun(text)];
  return new Paragraph({ numbering: { reference: 'bullets', level }, spacing: { after: 60, line: 264 }, children });
}
function num(text, ref = 'steps') {
  const children = Array.isArray(text)
    ? text.map(r => (typeof r === 'string' ? new TextRun(r) : new TextRun(r)))
    : [new TextRun(text)];
  return new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 60, line: 264 }, children });
}

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function tcell(text, width, { headerCell = false, align = AlignmentType.LEFT, fill } = {}) {
  const runs = (Array.isArray(text) ? text : [text]).map(t =>
    new TextRun(typeof t === 'string' ? { text: t, bold: headerCell } : { bold: headerCell, ...t }));
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: fill ? { fill, type: ShadingType.CLEAR } : (headerCell ? { fill: 'D6E4F0', type: ShadingType.CLEAR } : undefined),
    margins: { top: 60, bottom: 60, left: 110, right: 110 },
    children: [new Paragraph({ alignment: align, spacing: { after: 0, line: 252 }, children: runs })],
  });
}

function table(widths, rows) {
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((cells, ri) =>
      new TableRow({
        tableHeader: ri === 0,
        children: cells.map((c, ci) => {
          const opt = (c && typeof c === 'object' && !Array.isArray(c) && 'text' in c) ? c : { text: c };
          return tcell(opt.text, widths[ci], { headerCell: ri === 0, align: opt.align, fill: opt.fill });
        }),
      })),
  });
}
const spacer = () => new Paragraph({ spacing: { after: 80 }, children: [] });

// ---- content ----
const children = [];

// 表紙
children.push(new Paragraph({ spacing: { before: 1800, after: 200 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: 'たかすスポーツクラブ', size: 36, bold: true })] }));
children.push(new Paragraph({ spacing: { after: 120 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '会員管理システム', size: 56, bold: true, color: '1F4E79' })] }));
children.push(new Paragraph({ spacing: { after: 1200 }, alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '事務局 運用マニュアル', size: 44, bold: true })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '一般社団法人たかすスポーツクラブ', size: 24 })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '事務局用', size: 24 })] }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// 目次
children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('目次')] }));
children.push(new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-2' }));
children.push(new Paragraph({ children: [new PageBreak()] }));

// 1. はじめに
children.push(H1('1. はじめに'));
children.push(P('本マニュアルは、たかすスポーツクラブ会員管理システムの「事務局側」機能の操作方法をまとめたものです。会員の登録・修正は会員自身がスマートフォン等から行いますが、名簿管理・請求管理・口座振替データの作成は事務局が本システムで行います。'));
children.push(H2('1.1 システムの全体像'));
children.push(P('本システムは1つのWebサイトでありながらURLによって2つの画面に分かれています。'));
children.push(table([2300, 7060], [
  ['区分', '役割'],
  [bold('会員側'), '会員本人がログインして、登録情報の確認・修正、参加教室の選択を行います。新規入会の申込もここから行います。'],
  [bold('事務局側'), '事務局スタッフがログインして、会員名簿・請求・口座振替などを管理します（本マニュアルの対象）。'],
]));
children.push(spacer());
children.push(P([bold('動作環境：'), 'パソコン・スマートフォンのWebブラウザ（Chrome / Edge / Safari など）で利用できます。専用アプリのインストールは不要です。']));
children.push(P([bold('保存先：'), '入力したデータはインターネット上（Googleのスプレッドシート）に保存され、複数のスタッフが同じデータを共有します。']));

// 2. ログイン
children.push(H1('2. ログインとログアウト'));
children.push(H2('2.1 事務局ログイン'));
children.push(num('システムのURLを開き、画面下部の「会員ログインへ」ではなく事務局用のログイン画面（アドレス末尾が /#/admin）を開きます。'));
children.push(num('メールアドレスとパスワードを入力し、「ログイン」を押します。'));
children.push(num('ログインに成功すると「会員一覧」画面が表示されます。'));
children.push(spacer());
children.push(P([bold('初期アカウント：'), 'admin@takasu-sc.jp ／ パスワード admin123']));
children.push(P([{ text: '※セキュリティのため、初期パスワードは早めに変更してください。アカウントの追加・変更は事務局システム管理者（GAS／スプレッドシート管理者）が行います。', italics: true }]));
children.push(H2('2.2 ログアウト'));
children.push(P('画面右上の「ログアウト」を押すと終了します。共用パソコンでは作業後に必ずログアウトしてください。'));

// 3. 画面構成
children.push(H1('3. 画面構成（メニュー）'));
children.push(P('ログインすると画面上部に以下のメニューが並びます。スマートフォンでは上部に横スクロールで表示されます。'));
children.push(table([2200, 7160], [
  ['メニュー', '主な役割'],
  [bold('会員一覧'), '会員の検索・閲覧、Excel出力、一括インポート、年度更新'],
  [bold('教室別名簿'), '教室ごとの参加者名簿の表示・Excel出力'],
  [bold('保険管理'), 'スポーツ安全保険の新規加入者の確認・一括設定'],
  [bold('継続会費'), '毎月の会費請求データの生成・管理（中心的な画面）'],
  [bold('団体請求'), '団体会員への大会参加費などの個別請求'],
  [bold('口座振替'), '口座振替データ（CSS様式）の出力・CSS番号の管理'],
  [bold('引落不能'), '引き落としできなかった請求の管理・繰越'],
]));

// 4. 会員管理
children.push(H1('4. 会員管理'));
children.push(H2('4.1 会員一覧'));
children.push(P('「会員一覧」では、登録されているすべての会員を一覧・検索できます。'));
children.push(bullet([bold('検索：'), '上部の検索欄に氏名・フリガナ・会員番号・団体名の一部を入力すると絞り込めます。']));
children.push(bullet([bold('退会者の表示：'), '通常は在籍会員のみ表示されます。「退会者を表示」にチェックを入れると退会者も含めて表示されます（退会者は薄いグレーで表示）。']));
children.push(bullet([bold('状態：'), '各会員に「在籍」または「退会」のバッジが付きます。']));
children.push(bullet([bold('詳細：'), '右端の「詳細」を押すとその会員の詳細画面へ移動します。']));
children.push(H3('Excel出力'));
children.push(P('「Excel出力」を押すと、現在表示されている（検索で絞り込んだ）会員の名簿がExcelファイルでダウンロードされます。会員番号・種別・氏名・フリガナ・区分・電話・メール・状態・登録日が出力されます。'));
children.push(H3('一括インポート（既存会員データの取り込み）'));
children.push(P('紙やExcelで管理していた会員を一度にまとめて登録する機能です。主に移行時に使用します。'));
children.push(num('「一括インポート」→「テンプレート出力」で、入力用のExcelテンプレートをダウンロードします。'));
children.push(num('テンプレートに会員情報を記入し、保存します。'));
children.push(num('「ファイルを選択」でそのファイルを選ぶと、登録可能な件数・エラー・重複スキップの件数が表示されます。'));
children.push(num('内容を確認し「○件を登録」を押すと取り込みが完了します。'));
children.push(spacer());
children.push(P([bold('重複の自動スキップ：'), 'メールアドレス・氏名・生年月日が既存会員と一致する行は二重登録防止のため自動でスキップされます。兄弟など同じメールでも氏名・生年月日が異なれば別人として登録されます。']));
children.push(P([bold('パスワードの初期値：'), 'テンプレートのパスワード欄が未記入の場合、電話番号（数字）が初期パスワードになります。電話番号もなければ「takasu-sc」が設定されます（各会員に変更を案内してください）。']));
children.push(H3('年度更新（一括繰越）'));
children.push(P('年度の切り替え時に、退会希望者の退会処理と継続者の繰越を一括で行う機能です。'));
children.push(num('「年度更新」を押し、新年度（西暦）を入力します。'));
children.push(num('実行内容（退会予定の人数など）を確認します。'));
children.push(num('「年度更新を実行」を押します。'));
children.push(spacer());
children.push(P('実行すると次の処理が行われます。'));
children.push(bullet([bold('翌年度の意思が「退会」'), 'の会員を退会処理します。']));
children.push(bullet('継続・未回答の会員は在籍を維持し、保険加入者の加入日を新年度の4月1日に更新します。'));
children.push(bullet('全員の「翌年度の意思」をリセット（未回答に戻す）します。'));
children.push(P([{ text: '※退会処理を含む重要な操作です。実行前に必ず退会希望者の人数を確認してください。一度実行すると元に戻せません。', bold: true, color: 'B00000' }]));

children.push(H2('4.2 会員詳細'));
children.push(P('会員一覧から「詳細」を押すと、その会員の情報を確認・編集できます。'));
children.push(H3('閲覧できる情報'));
children.push(P('会員番号・種別、氏名・フリガナ、生年月日、性別、住所、町内外区分、電話、メール、登録日のほか、会員種別に応じて以下が表示されます。'));
children.push(bullet([bold('ジュニア会員：'), '通学先、保護者氏名、保護者電話']));
children.push(bullet([bold('団体会員：'), '団体名、代表者、加入人数']));
children.push(bullet('CSS番号（口座振替番号）、保険加入状況、就学援助の有無、翌年度の意思、年会費・保険料、参加教室'));
children.push(H3('編集'));
children.push(P('「編集」を押すと各項目を修正できます。修正後「保存」で確定、「キャンセル」で破棄します。'));
children.push(P([bold('事務局のみが管理する項目（画面下部「口座振替・保険」欄）：')]));
children.push(table([3100, 6260], [
  ['項目', '説明'],
  [bold('CSS番号'), '口座振替の番号。家庭（世帯）共通で使用します。これが未設定だと口座振替データに出力されません。'],
  [bold('地域クラブ用CSS番号'), '（任意）地域クラブの参加費だけを別口座から引き落とす場合に設定します。未設定なら主CSS番号が使われます。'],
  [bold('就学援助受給世帯'), 'チェックを入れると、地域クラブ参加費から毎月2,000円が自動控除されます。会員側には表示されません。'],
  [bold('スポーツ安全保険に加入'), 'ジュニア・団体会員の保険加入状況と加入日。一般会員は保険対象外のため表示されません。'],
  [bold('翌年度の意思'), '継続／退会／未回答。年度更新の判定に使われます。'],
]));
children.push(spacer());
children.push(P([bold('参加教室：'), '一般・ジュニア会員は、編集画面で参加する教室にチェックを付けて管理します。']));
children.push(H3('退会処理・復帰'));
children.push(P('「退会処理」を押すと確認のうえ退会状態になります。退会者の詳細画面では「復帰」ボタンで在籍に戻せます。'));

children.push(H2('4.3 新規入会のお知らせメール'));
children.push(P('会員側から新しい入会登録があると、事務局のメールアドレス宛に自動で通知メールが届きます。メールには会員番号・氏名・会員種別・電話・メール・登録日が記載されます。新規入会に気づいたら、会員詳細でCSS番号や教室などの事務局管理項目を設定してください。'));
children.push(P([{ text: '※通知先のメールアドレスはシステム管理者が設定します。一括インポートで取り込んだ会員には通知は送られません。', italics: true }]));

// 5. 教室別名簿
children.push(H1('5. 教室別名簿'));
children.push(P('教室ごとの参加者名簿を表示・出力できます。'));
children.push(num('「教室別名簿」を開き、プルダウンから教室を選びます。'));
children.push(num('その教室の参加者一覧と人数が表示されます。'));
children.push(num('「Excel出力」を押すと、選択中の教室の名簿がExcelでダウンロードされます。'));
children.push(spacer());
children.push(P('ジュニア会員が含まれる教室では、Excelに通学先・保護者氏名・保護者電話も出力されるため、緊急連絡網や出欠管理に利用できます。'));

// 6. 保険管理
children.push(H1('6. 保険管理'));
children.push(P('スポーツ安全保険の加入を管理します。保険対象はジュニア会員・団体会員で、一般会員は対象外です。'));
children.push(H2('6.1 新規保険加入者の確認'));
children.push(P('画面上部で対象の「年月」を選ぶと、その月に保険へ加入した会員の一覧と合計保険料が表示されます。'));
children.push(P([{ text: '重要：', bold: true }, 'ここに表示された会員の保険料は、', bold('翌月の請求'), 'で計上します。たとえば4月に加入した会員は5月の継続会費に保険料が乗ります（保険料の計上は継続会費管理が自動で行います）。']));
children.push(P('「Excel出力」で新規保険加入者の一覧を出力できます。'));
children.push(H2('6.2 保険加入の一括インポート'));
children.push(num('「テンプレート出力」で入力用Excelをダウンロードします。'));
children.push(num('会員番号と保険加入日を記入します。'));
children.push(num('ファイルをアップロードし、対象件数を確認して「○件を保険加入に設定」を押します。'));
children.push(P('該当する会員の保険加入がONになり、加入日が設定されます。会員番号が見つからない行は処理されず、件数が表示されます。'));
children.push(table([2400, 6960], [
  ['会員種別', '保険料'],
  ['一般会員', '対象外（0円）'],
  ['ジュニア会員', '800円／人'],
  ['団体会員', '800円 × 加入人数'],
]));

// 7. 継続会費
children.push(H1('7. 継続会費管理'));
children.push(P('毎月の会費請求を作成・管理する、もっとも中心的な画面です。会員ごとに「その月にいくら引き落とすか」を確定させます。'));
children.push(H2('7.1 毎月の基本操作'));
children.push(num('上部で対象の「年月」を選びます。'));
children.push(num('「請求データ生成」を押すと、その月の請求が自動計算されて一覧に表示されます。'));
children.push(num('内容を確認し、必要に応じて特別徴収などを追加します。'));
children.push(num('口座振替の処理後、各請求の状態を更新します（後述）。'));
children.push(P([{ text: '引落日は原則として毎月27日です。手続き（教室変更など）の締切は毎月10日です。', bold: true }]));
children.push(H2('7.2 請求データ生成の自動計算ルール'));
children.push(P('「請求データ生成」を押すと、在籍する一般・ジュニア会員について以下が自動で計算されます。団体会員は対象外です（団体請求で管理）。'));
children.push(table([2600, 6760], [
  ['費目', '計上ルール'],
  [bold('年会費'), '継続会員は4月に計上。年度途中の入会者は入会した翌月に計上。'],
  [bold('月会費（教室）'), '参加教室のうち「教室」区分の参加費。'],
  [bold('月会費（委託）'), '水泳教室など「委託」区分の参加費。'],
  [bold('月会費（地域クラブ）'), '地域クラブの参加費。町内・町外で金額が異なる教室があります。'],
  [bold('保険料'), '保険加入者の保険料。継続は4月、年度途中加入は加入の翌月に計上。'],
  [bold('就学援助補助'), '就学援助受給世帯は地域クラブ参加費から毎月2,000円を控除（マイナス計上）。'],
]));
children.push(spacer());
children.push(P([bold('支払方式による計上タイミング：'), '毎月払いの教室は毎月計上されます。3期払い・1期払いの教室は「請求月設定」で指定した月にだけ計上されます。チケット制・徴収なしの教室は請求されません。']));
children.push(P([bold('入会前の月：'), '会員の登録月より前の月には請求は作られません。']));
children.push(P([{ text: '※「請求データ生成」を押し直すと、その月の自動計算分は最新内容で作り直されます。ただし手動で追加した特別徴収は保持されます。', italics: true }]));
children.push(H2('7.3 請求月設定（3期・1期払い）'));
children.push(P('3期払い・1期払いの教室について、どの月に請求するかを設定します。'));
children.push(num('「請求月設定」を押します。'));
children.push(num('教室ごとに、請求する月をカンマ区切りで入力します（例：3期払いは「5,8,1」、1期払いは「6」）。'));
children.push(num('「保存」を押します。'));
children.push(P('初期値では3期払いは5月・8月・1月に設定されています。1期払いは未設定のため、事務局が引落月を入力してください。毎月払いの教室は設定不要です。'));
children.push(table([2400, 2400, 4560], [
  ['期', '対象月', '引き落とし日（目安）'],
  ['第1期', '5〜7月', '6月29日'],
  ['第2期', '8〜12月', '9月28日'],
  ['第3期', '1〜3月', '1月27日'],
]));
children.push(H2('7.4 特別徴収の追加'));
children.push(P('大会参加費・ユニフォーム代など、通常の会費以外を個別に請求する機能です。'));
children.push(num('一覧の各会員の行にある「特別徴収」、または上部の「特別徴収追加」を押します。'));
children.push(num('（上部から追加する場合は）対象会員を選びます。'));
children.push(num('金額・備考・引落日を入力して「登録」を押します。'));
children.push(P([{ text: '特別徴収は通常の請求とは別に保持され、「請求データ生成」を押し直しても消えません。同じ会員に追加すると金額は加算されます。', italics: true }]));
children.push(H2('7.5 請求ステータスの管理'));
children.push(P('各請求は、口座振替の進み具合に応じて状態を更新します。一覧右端のボタンで操作します。'));
children.push(table([2200, 2300, 4860], [
  ['状態', '意味', '操作'],
  ['未請求', '生成直後の状態', '「請求済」を押すと請求済へ'],
  ['請求済', '振替データを金融機関へ提出済', '結果に応じて「完了」または「不能」を押す'],
  ['引落完了', '引き落としが成功した', '—（完了）'],
  ['引落不能', '引き落としできなかった', '翌月の生成時に自動で繰り越される'],
]));
children.push(spacer());
children.push(P([bold('繰越（再請求）：'), '前月に「引落不能」だった請求は、翌月の「請求データ生成」時に同じ費目のまま当月へ合算され、「再請求」として黄色で表示されます。']));
children.push(P([bold('Excel出力：'), '「Excel出力」で、その月の請求明細（費目ごとの内訳・合計・状態）をダウンロードできます。']));

// 8. 団体請求
children.push(H1('8. 団体請求管理'));
children.push(P('団体会員に対して、大会参加費・追加保険料などを個別に請求します。継続会費とは別管理です。'));
children.push(H2('8.1 新規登録'));
children.push(num('「新規登録」を押します。'));
children.push(num('団体・請求項目・金額・支払日を入力します。'));
children.push(num('「登録」を押します。'));
children.push(H2('8.2 ステータスとExcel出力'));
children.push(P('継続会費と同様に「未請求 → 請求済 → 引落完了／引落不能」で管理します。引落不能になったものは「引落不能管理」にも表示されます。「Excel出力」で団体請求の一覧を出力できます。'));

// 9. 口座振替
children.push(H1('9. 口座振替'));
children.push(P('金融機関に提出する口座振替データ（CSS様式）を作成し、CSS番号を管理する画面です。'));
children.push(H2('9.1 口座振替データの出力'));
children.push(num('上部で対象の「年月」を選びます。当月の継続会費の件数・金額と団体請求の件数・金額が表示されます。'));
children.push(num('「口座振替データ出力（CSS様式）」を押すと、CSS番号（家庭）ごとに合算した振替データがダウンロードされます。'));
children.push(P('その月に引き落とす継続会費（特別徴収を含む）と、引落日が当月の団体請求が、CSS番号ごとにまとめて出力されます。地域クラブ参加費は「地域クラブ用CSS番号」（未設定なら主CSS番号）の口座から引き落とされます。'));
children.push(P([{ text: '注意：CSS番号が未設定の会員がいると、その分は口座振替できません。画面に赤色で対象者が表示されるので、会員詳細でCSS番号を設定してから出力してください。', bold: true, color: 'B00000' }]));
children.push(H2('9.2 振替結果帳票の出力'));
children.push(P('「振替結果帳票出力」を押すと、当月の請求状況を一覧にした帳票をダウンロードできます。引き落とし結果の確認・記録に使います。'));
children.push(H2('9.3 CSS番号の一括設定'));
children.push(P('金融機関から受け取ったCSS加入者一覧（Excel）を取り込み、会員にCSS番号をまとめて設定できます。'));
children.push(num('CSS加入者一覧のExcelファイルをアップロードします。'));
children.push(num('加入者名で会員が自動照合され（携帯番号でも補助照合）、照合できた件数が表示されます。'));
children.push(num('「○件にCSS番号を設定」を押して反映します。'));
children.push(P('氏名が一致しない（未照合）会員や、候補が複数ある会員は手動対応が必要なため、一覧で表示されます。これらは会員詳細で個別に設定してください。'));
children.push(H2('9.4 当月の継続会費プレビュー'));
children.push(P('画面下部に当月の継続会費が一覧表示され、各会員のCSS番号の設定状況（未設定は赤色）と合計・状態を確認できます。'));

// 10. 引落不能
children.push(H1('10. 引落不能管理'));
children.push(P('引き落としできなかった請求（個人・団体）をまとめて確認できます。'));
children.push(bullet('「継続会費」「団体請求」で状態を「引落不能」にした請求がここに集まります。'));
children.push(bullet('個人請求の引落不能は、翌月の「請求データ生成」時に自動で当月へ繰り越されます（再請求）。'));
children.push(bullet('入金が確認できた場合などは、各行の「引落完了に変更」で手動で完了にできます。'));
children.push(P('件数バッジが赤色のときは未処理の引落不能があることを示します。0件なら緑色で表示されます。'));

// 11. 費用早見表
children.push(H1('11. 費用早見表'));
children.push(H2('11.1 年会費'));
children.push(table([4680, 4680], [
  ['区分', '年会費'],
  ['一般会員', '1,000円'],
  ['ジュニア会員（町内）', '0円'],
  ['ジュニア会員（町外）', '500円'],
  ['団体会員', '1,000円'],
]));
children.push(H2('11.2 保険料'));
children.push(table([4680, 4680], [
  ['区分', '保険料'],
  ['一般会員', '対象外'],
  ['ジュニア会員', '800円／人'],
  ['団体会員', '800円 × 加入人数'],
]));
children.push(H2('11.3 教室一覧と参加費'));
children.push(P('参加費は「町内／町外」の順です。支払方式は、毎月払い・3期払い・1期払い・チケット制・徴収なしの5種類です。'));
children.push(table([3700, 1900, 1380, 2380], [
  ['教室名', '支払方式', '町内', '町外'],
  ['スポーツやってみ隊', '3期払い', '5,000', '5,000'],
  ['運動遊び隊', '3期払い', '5,000', '5,000'],
  ['小学生水泳教室', '1期払い', '2,000', '2,000'],
  ['水泳教室（大人）', '徴収なし', '—', '—'],
  ['幼児水泳教室', '1期払い', '2,000', '2,000'],
  ['ダンス教室', '3期払い', '6,000', '6,000'],
  ['英会話教室', '毎月払い', '5,000', '5,000'],
  ['鷹栖REDWOLVES 男子U15', '毎月払い', '2,000', '4,000'],
  ['鷹栖REDWOLVES 女子U15', '毎月払い', '2,000', '4,000'],
  ['鷹栖REDWOLVES 男女U12', '徴収なし', '—', '—'],
  ['鷹栖北野バドミントン少年団', '徴収なし', '—', '—'],
  ['鷹栖バレーボールクラブ', '毎月払い', '2,000', '4,000'],
  ['鷹栖ソフトテニスクラブ', '毎月払い', '2,000', '4,000'],
  ['鷹栖剣道クラブ', '毎月払い', '2,000', '4,000'],
  ['NexusBC', '団体請求', '7,000', '9,000'],
  ['TakasuXC', '毎月払い', '2,000', '4,000'],
  ['マルチスポーツクラブ', '毎月払い', '1,000', '2,000'],
  ['鷹栖剣道少年団', '徴収なし', '—', '—'],
  ['鷹栖北野クロスカントリースキー少年団', '徴収なし', '—', '—'],
  ['鷹栖北野野球少年団', '徴収なし', '—', '—'],
  ['海洋クラブ', '徴収なし', '—', '—'],
  ['ソルリッサ', '徴収なし', '—', '—'],
  ['旭川ウィングスFC', '徴収なし', '—', '—'],
  ['コンディショニング', '徴収なし', '—', '—'],
  ['ヨガ教室', 'チケット制', '—', '—'],
  ['ストレッチ教室', 'チケット制', '—', '—'],
  ['たかスポレッチ', 'チケット制', '—', '—'],
  ['レッドコード教室', '1期払い', '3,000', '3,000'],
]));
children.push(P([{ text: '※「徴収なし」「団体請求」の教室でも、会員種別に応じた年会費・保険料は別途徴収されます。NexusBCは団体口座で一括徴収（団体請求）します。', italics: true }]));

// 12. 月次フロー
children.push(H1('12. 月次運用フロー（目安）'));
children.push(P('毎月のおおまかな流れです。実際の金融機関の締切に合わせて調整してください。'));
children.push(num('～毎月10日：会員からの教室変更・各種手続きの締切。'));
children.push(num('中旬：「継続会費」で対象月を選び「請求データ生成」。特別徴収を追加。'));
children.push(num('中旬：「保険管理」で前月の新規保険加入者を確認（当月分の請求に保険料が乗っているか確認）。'));
children.push(num('中旬：「口座振替」でCSS番号未設定の会員がいないか確認し、「口座振替データ出力」。'));
children.push(num('生成した振替データを金融機関へ提出。請求の状態を「請求済」に更新。'));
children.push(num('毎月27日：引き落とし。'));
children.push(num('引き落とし後：結果に応じて各請求を「引落完了」または「引落不能」に更新。'));
children.push(num('「引落不能」は翌月の生成時に自動繰越。必要に応じて個別対応。'));
children.push(spacer());
children.push(P([bold('年度更新（年1回・年度替わり）：'), '「会員一覧」→「年度更新」で退会希望者の退会処理と継続者の繰越を一括実行します（4.1参照）。']));

// 13. 困ったとき
children.push(H1('13. 困ったとき・注意点'));
children.push(table([3300, 6060], [
  ['症状・場面', '対処'],
  ['口座振替データが0件・空になる', '会員データの読み込み完了前に押された可能性があります。少し待ってから再度出力してください。CSS番号が全員未設定でも0件になります。'],
  ['ある会員が振替データに出てこない', '会員詳細でCSS番号が設定されているか確認してください。未設定だと出力されません。'],
  ['保険料が請求に乗らない', '保険対象はジュニア・団体のみです。会員詳細で「保険に加入」がONか、加入日が正しいかを確認してください。計上は加入の翌月（継続は4月）です。'],
  ['3期・1期払いの請求が出ない', '「請求月設定」でその教室の請求月が設定されているか確認してください。1期払いは初期未設定です。'],
  ['請求を作り直したい', '「請求データ生成」を押し直すと自動計算分は作り直されます。手動の特別徴収は保持されます。'],
  ['間違えて退会処理した', '会員詳細の「復帰」で在籍に戻せます。'],
  ['新規入会に気づきたい', '事務局メールに自動通知が届きます。届かない場合はシステム管理者に通知先設定を確認してください。'],
]));
children.push(spacer());
children.push(P([{ text: '本マニュアルは現行システムの機能に基づいて作成しています。機能の追加・変更があった場合は内容が一部異なることがあります。', italics: true }]));

// ---- document ----
const doc = new Document({
  creator: 'たかすスポーツクラブ事務局',
  title: '会員管理システム 事務局運用マニュアル',
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
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: JP, color: '333333' },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 600, hanging: 280 } } } },
      ] },
      { reference: 'steps', levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 600, hanging: 320 } } } },
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
      children: [new TextRun({ text: 'たかすスポーツクラブ 会員管理システム 事務局運用マニュアル', size: 16, color: '888888' })],
    })] }) },
    footers: { default: new Footer({ children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '', size: 16 }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '888888' })],
    })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then(buffer => {
  const out = path.join(__dirname, '事務局運用マニュアル.docx');
  fs.writeFileSync(out, buffer);
  console.log('wrote', out, buffer.length, 'bytes');
});
