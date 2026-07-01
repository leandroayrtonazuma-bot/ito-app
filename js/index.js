// ============================================================
// 参加画面（index.html）のロジック
// ------------------------------------------------------------
// やること:
//   1. URL の ?room= から参加する部屋を判定する
//   2. 名前を入力して「参加する」を押したら、その部屋に参加者を登録
//   3. 登録した参加者IDを localStorage に保存し、プレイヤー画面へ移動
// ============================================================

import {
  db,
  TOPICS,
  STATUS,
  getRoomIdFromUrl,
  playerStorageKey,
} from "./firebase.js";

import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ------------------------------------------------------------
// DOM 取得
// ------------------------------------------------------------
const roomBadge = document.getElementById("roomBadge");
const roomLabel = document.getElementById("roomLabel");
const joinForm = document.getElementById("joinForm");
const nameInput = document.getElementById("nameInput");
const joinButton = document.getElementById("joinButton");
const errorBox = document.getElementById("errorBox");
const toast = document.getElementById("toast");

// URL からルームIDを取得（例: ?room=A → "A"）
const roomId = getRoomIdFromUrl();

// ------------------------------------------------------------
// 画面の初期表示を切り替え
// ------------------------------------------------------------
if (!roomId) {
  // room が無い/無効 → エラー表示
  errorBox.hidden = false;
} else {
  // room が有効 → フォーム表示
  roomLabel.textContent = roomId;
  roomBadge.hidden = false;
  joinForm.hidden = false;

  // すでにこの部屋で参加済みなら、そのままプレイヤー画面へ
  const existingPlayerId = localStorage.getItem(playerStorageKey(roomId));
  if (existingPlayerId) {
    goToPlayerScreen();
  }

  // 名前入力欄に自動でフォーカス（スマホでは環境により無効な場合あり）
  nameInput.focus();
}

// ------------------------------------------------------------
// 参加処理
// ------------------------------------------------------------
joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();
  if (!name) {
    showToast("名前を入力してください");
    nameInput.focus();
    return;
  }

  // 二重送信防止
  setLoading(true);

  try {
    // 1. 部屋ドキュメントがなければ作成（既にあれば中身は保持）
    await ensureRoomExists(roomId);

    // 2. 参加者を players サブコレクションに追加
    const playersRef = collection(db, "rooms", roomId, "players");
    const newPlayer = await addDoc(playersRef, {
      name: name,
      number: null, // まだ数字は配られていない
      joinedAt: serverTimestamp(),
    });

    // 3. 参加者ID・名前を localStorage に保存（プレイヤー画面で使う）
    localStorage.setItem(playerStorageKey(roomId), newPlayer.id);
    localStorage.setItem(`ito_name_${roomId}`, name);

    // 4. プレイヤー画面へ移動
    goToPlayerScreen();
  } catch (err) {
    console.error("参加に失敗しました:", err);
    showToast("参加に失敗しました。通信環境を確認してください");
    setLoading(false);
  }
});

// ------------------------------------------------------------
// 補助関数
// ------------------------------------------------------------

// 部屋ドキュメントが無ければ、初期状態で作成する。
// 既にある場合は何もしない（お題や進行状況を上書きしないため）。
async function ensureRoomExists(id) {
  const roomRef = doc(db, "rooms", id);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) {
    await setDoc(roomRef, {
      roomId: id,
      currentTopic: TOPICS[0], // 最初のお題
      topicIndex: 0, // お題リストの何番目か
      gameRound: 0, // ゲームの周回数（0 = まだ配布前）
      status: STATUS.WAITING, // 待機中
      createdAt: serverTimestamp(),
    });
  }
}

// プレイヤー画面へ遷移
function goToPlayerScreen() {
  window.location.href = `player.html?room=${roomId}`;
}

// ボタンのローディング表示切り替え
function setLoading(loading) {
  joinButton.disabled = loading;
  joinButton.textContent = loading ? "参加中…" : "参加する";
}

// 画面下部に一時メッセージを表示
let toastTimer = null;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("toast--show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("toast--show");
  }, 2600);
}
