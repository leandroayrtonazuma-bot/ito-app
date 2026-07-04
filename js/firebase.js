// ============================================================
// Firebase 初期化 & 共有モジュール
// ------------------------------------------------------------
// ・Firebase の初期化を1か所にまとめています。
// ・各ページ（index / player / admin）は、このファイルから
//   `db`（Firestore インスタンス）と、共通で使う定数・関数を読み込みます。
// ・Firestore の各操作関数（collection, onSnapshot など）は、
//   使う側のファイルで CDN から直接 import しています（構成を軽くするため）。
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// firebase-config.js（自分で作成するファイル）から設定を読み込む
import { firebaseConfig } from "../firebase-config.js";

// Firebase アプリを初期化
const app = initializeApp(firebaseConfig);

// Firestore データベースへの参照（各ページで使い回す）
export const db = getFirestore(app);

// ------------------------------------------------------------
// アプリ全体で使う定数
// ------------------------------------------------------------

// 部屋の初期一覧（初回アクセス時、Firestore の meta/rooms が無ければこれで作成する）。
// 以降の部屋の追加・削除は管理画面から行う（meta/rooms ドキュメントの roomIds が正）。
export const DEFAULT_ROOM_IDS = ["A", "B", "C", "D", "E"];

// お題リスト。「次のゲーム」を押すたびに、この順で次のお題へ進みます。
// 自由に追加・編集して構いません。
export const TOPICS = [
  "好きな飲み物",
  "好きな食べ物",
  "行きたい国",
  "理想の休日",
  "好きなアニメ",
  "無人島に持っていくもの",
  "幸せを感じる瞬間",
  "尊敬する人物",
  "テンションが上がる瞬間",
  "生まれ変わったらなりたいもの",
];

// 配布する数字の範囲（ito は 1〜100）
export const NUMBER_MIN = 1;
export const NUMBER_MAX = 100;

// ゲームの状態を表す文字列（Firestore に保存する値）
export const STATUS = {
  WAITING: "waiting", // 待機中（まだ数字を配っていない）
  PLAYING: "playing", // プレイ中（数字を配布済み）
};

// ------------------------------------------------------------
// 便利関数
// ------------------------------------------------------------

// URL のクエリから ?room= の値を取得する（例: ?room=A → "A"）
// 部屋は動的に追加・削除されるため、ここでは形式だけをチェックする
// （実在するかどうかは、各画面が Firestore を読んだ時点で判断する）
const ROOM_ID_PATTERN = /^[A-Z0-9]{1,10}$/;
export function getRoomIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const room = (params.get("room") || "").toUpperCase().trim();
  return ROOM_ID_PATTERN.test(room) ? room : null;
}

// まだ使われていない部屋IDを1つ決める（A〜Zの空いている文字 → 尽きたら時刻ベースのコード）
export function nextRoomId(existingIds) {
  const used = new Set(existingIds);
  for (let code = 65; code <= 90; code++) {
    const id = String.fromCharCode(code);
    if (!used.has(id)) return id;
  }
  return "R" + Date.now().toString(36).toUpperCase();
}

// localStorage に保存するときのキー（ルームごとに参加者IDを保持）
export function playerStorageKey(roomId) {
  return `ito_player_${roomId}`;
}

// 管理者が「参加者として参加」した端末・ルームの組み合わせを覚えておくキー。
// 立っていると、参加者画面（player.html）で管理者専用ボタンを表示する。
export function adminFlagKey(roomId) {
  return `ito_admin_${roomId}`;
}

// ルーム名の初期値（管理者が未設定のときに表示する名前）
// 参加者にはこの名前だけが見えます（記号 A〜E は内部・URL 用）。
export function defaultRoomName(roomId) {
  return `ルーム ${roomId}`;
}

// ------------------------------------------------------------
// 数字を「小さい＝青／大きい＝赤」の色に変換する
// ------------------------------------------------------------
// 1〜100 を 0〜1 に正規化し、色相を 210°(青) → 0°(赤) へ動かします。
// プレイヤー画面の大きい数字と、管理画面の参加者一覧で共通利用します。
function numberHue(n) {
  const t = (n - NUMBER_MIN) / (NUMBER_MAX - NUMBER_MIN);
  const clamped = Math.max(0, Math.min(1, t));
  return 210 * (1 - clamped); // 小さいほど 210(青)、大きいほど 0(赤)
}

// 単色（管理画面の一覧の数字など、普通の color 用）
export function numberColor(n) {
  if (n === null || n === undefined) return "";
  return `hsl(${Math.round(numberHue(n))}, 80%, 62%)`;
}

// グラデーション（プレイヤー画面の大きい数字＝文字クリップ用の background-image）
export function numberGradient(n) {
  if (n === null || n === undefined) return "";
  const h = Math.round(numberHue(n));
  return `linear-gradient(135deg, hsl(${h}, 92%, 74%), hsl(${h}, 82%, 54%))`;
}
