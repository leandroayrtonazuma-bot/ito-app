# ito 専用 Web アプリ

大学の交流イベント向けの、ボードゲーム **ito** の「数字配布・お題表示」用 Web アプリです。
参加者は **QRコードを読み取り → 名前を入れて参加ボタン** だけでプレイに参加できます。

- フロントエンドのみ（HTML / CSS / Vanilla JS）
- データはリアルタイム同期（Firebase Firestore の `onSnapshot`）
- **GitHub Pages にアップロードするだけで動作**
- スマホ最優先のダークテーマUI

---

## 画面構成

| ファイル | 役割 | URL 例 |
| --- | --- | --- |
| `index.html` | 参加画面（名前入力→参加） | `index.html?room=A` |
| `player.html` | プレイヤー画面（お題・数字表示） | `player.html?room=A` |
| `admin.html` | 管理画面（配布・進行） | `admin.html` |

ルームは初期状態で **A・B・C・D・E の5部屋**です。
（変更したい場合は `js/firebase.js` の `ROOM_IDS` を編集してください）

---

## ディレクトリ構成

```
ito-app/
├── index.html                  参加画面
├── player.html                 プレイヤー画面
├── admin.html                  管理画面
├── css/
│   └── style.css               共通スタイル
├── js/
│   ├── firebase.js             Firebase 初期化・共通定数
│   ├── index.js                参加画面のロジック
│   ├── player.js               プレイヤー画面のロジック
│   └── admin.js                管理画面のロジック
├── firebase-config.example.js  Firebase 設定のサンプル
├── firebase-config.js          ← 自分で作成（サンプルをコピー・非公開）
├── .gitignore
└── README.md
```

---

## セットアップ手順

### 1. Firebase プロジェクトを作成する

1. [Firebase コンソール](https://console.firebase.google.com/) にアクセスしてログイン
2. 「**プロジェクトを追加**」をクリック
3. プロジェクト名（例：`ito-event`）を入力して作成
   - Google アナリティクスは無効でも構いません

### 2. Firestore を有効化する

1. 左メニュー「**構築 → Firestore Database**」を開く
2. 「**データベースの作成**」をクリック
3. モードは「**本番環境モードで開始**」を選択（後でルールを設定します）
4. ロケーションは `asia-northeast1（東京）` などお近くを選択

### 3. Web アプリを登録して設定値を取得する

1. Firebase コンソールの「**プロジェクトの設定（歯車アイコン）**」を開く
2. 「マイアプリ」で **`</>`（ウェブ）** アイコンをクリックしてアプリを登録
3. 表示される `firebaseConfig` の値をコピー
4. プロジェクト内の `firebase-config.example.js` を **コピーして `firebase-config.js` を作成**
5. `firebase-config.js` の各値を、コピーした値に書き換える

```js
// firebase-config.js（例）
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "ito-event.firebaseapp.com",
  projectId: "ito-event",
  storageBucket: "ito-event.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef...",
};
```

> `firebase-config.js` は `.gitignore` で除外されており、GitHub には公開されません。

### 4. Firestore セキュリティルールを設定する

「Firestore Database → **ルール**」タブに、以下を貼り付けて「公開」します。

このアプリはログイン（認証）を使わない **イベント用の簡易構成**です。
下記は「`rooms` 配下だけ読み書き可能／それ以外は禁止」の最小限ルールです。

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // rooms とその配下（players）は誰でも読み書き可
    // ※ イベント当日だけ使う前提の簡易ルールです
    match /rooms/{roomId} {
      allow read, write: if true;

      match /players/{playerId} {
        allow read, write: if true;
      }
    }

    // それ以外は全面禁止
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

> **注意（安全性について）**
> 上記は「URL を知っている人なら誰でも読み書きできる」ルールです。
> 交流イベントの一時利用には十分ですが、以下をおすすめします。
> - **イベント終了後は Firestore のデータを削除**する
> - 長期運用する場合は Firebase Authentication（匿名認証など）を導入し、
>   ルールを `if request.auth != null` などに強化する

---

## ローカルで動作確認する

ES Modules を使用しているため、`file://` で直接開くと動きません。
簡易サーバーで開いてください（どちらか）。

```bash
# Python がある場合
python -m http.server 8000

# Node.js がある場合
npx serve
```

ブラウザで以下を開きます。

- 参加画面：`http://localhost:8000/index.html?room=A`
- 管理画面：`http://localhost:8000/admin.html`

---

## GitHub Pages で公開する手順

1. GitHub で新しいリポジトリを作成（例：`ito-app`）
2. このフォルダの中身をすべてアップロード（`firebase-config.js` も含める）
   - `git` を使う場合の例：
     ```bash
     git init
     git add .
     git commit -m "ito app"
     git branch -M main
     git remote add origin https://github.com/ユーザー名/ito-app.git
     git push -u origin main
     ```
   - ※ `.gitignore` により `firebase-config.js` は push されません。
     GitHub Pages を動かすには設定値が必要なため、**別途アップロード**するか、
     一時的に `.gitignore` から外してください（キーの公開に注意）。
3. リポジトリの「**Settings → Pages**」を開く
4. 「Build and deployment」の Source を「**Deploy from a branch**」にする
5. Branch を `main` / フォルダを `/ (root)` にして「Save」
6. 数分後、`https://ユーザー名.github.io/ito-app/` で公開されます

公開後の各URL例：

- 参加：`https://ユーザー名.github.io/ito-app/index.html?room=A`
- 管理：`https://ユーザー名.github.io/ito-app/admin.html`

---

## QRコード運用方法

1. 管理画面（`admin.html`）を開く
2. 各ルームカードの「**参加用リンクをコピー**」を押す
   - `.../index.html?room=A` のような、ルーム付きURLがコピーされます
3. コピーしたURLを **QRコード生成サービス**（例：無料のQR作成サイト）に貼り付けて画像化
4. 部屋ごとに QR を印刷して掲示
   - ルームA の机には room=A の QR、ルームB には room=B …という具合

参加者は QR を読み取るだけで、その部屋の参加画面へ直接入れます。

---

## 当日の遊び方（運営フロー）

1. 参加者：QR を読み取り、名前を入れて「参加する」
2. 全員そろったら、管理画面で対象ルームの「**数字配布**」を押す
   - 参加者全員に **1〜100 の重複なし** の数字がランダムで配られます
3. 参加者は、自分の数字を見て（他人に見せずに）、お題に沿って小さい順に並べます
4. 1ゲーム終わったら「**次のゲーム**」を押す
   - 全員の数字がリセットされ、**次のお題**になり、**新しい数字が配布**されます

管理者が押すボタンはこの **2つだけ** です。

---

## お題を編集したい

`js/firebase.js` の `TOPICS` 配列を編集してください。
「次のゲーム」を押すたびに、この順番で次のお題へ進みます（末尾まで行くと先頭に戻ります）。

```js
export const TOPICS = [
  "好きな飲み物",
  "好きな食べ物",
  // ここに自由に追加・変更
];
```

---

## データ構造（Firestore）

```
rooms/{roomId}
  ├─ roomId:       "A"
  ├─ currentTopic: "好きな飲み物"
  ├─ topicIndex:   0            (お題リストの位置)
  ├─ gameRound:    1            (周回数)
  ├─ status:       "waiting" | "playing"
  ├─ createdAt:    <timestamp>
  └─ players/{playerId}
       ├─ name:     "たろう"
       ├─ number:   73 | null
       └─ joinedAt: <timestamp>
```

---

## よくあるトラブル

| 症状 | 原因・対処 |
| --- | --- |
| 画面が真っ白 / 読み込めない | `file://` で開いている。簡易サーバー経由で開く（上記参照） |
| `firebase-config.js` が無いエラー | サンプルをコピーして `firebase-config.js` を作成する |
| 参加しても数字が出ない | 管理画面で「数字配布」を押していない／別ルームを見ている |
| 権限エラー（permission-denied） | Firestore のセキュリティルールが未設定。上記ルールを公開する |
| 数字が全員同じ／重複する | 100人を超えると重複回避のため上限で丸められます（ito は通常この人数に達しません） |
