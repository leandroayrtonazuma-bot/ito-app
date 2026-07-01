// ============================================================
// Firebase 設定ファイル（サンプル）
// ------------------------------------------------------------
// 使い方:
//   1. このファイルをコピーして「firebase-config.js」という名前で
//      同じ場所（プロジェクト直下）に置いてください。
//   2. 下の各値を、あなたの Firebase プロジェクトの値に書き換えてください。
//      値は Firebase コンソール →「プロジェクトの設定」→「マイアプリ」
//      →「SDK の設定と構成」からコピーできます。
//
//   ※ firebase-config.js は .gitignore で除外しているため、
//      GitHub には公開されません（キーの流出防止）。
//      ただし GitHub Pages で公開する場合はブラウザに読み込まれるため、
//      完全な秘匿はできません。必ず Firestore セキュリティルールで
//      アクセス制御してください（README 参照）。
// ============================================================

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};
