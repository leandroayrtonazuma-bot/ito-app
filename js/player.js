// ============================================================
// プレイヤー画面（player.html）のロジック
// ------------------------------------------------------------
// やること:
//   1. 参加者IDを localStorage から取得（無ければ参加画面へ戻す）
//   2. 部屋のお題・状態を onSnapshot でリアルタイム表示
//   3. 自分の数字を onSnapshot でリアルタイム表示
//   4. 数字の「隠す/表示」を切り替える（端末内だけの状態）
// ============================================================

import {
  db,
  getRoomIdFromUrl,
  playerStorageKey,
  defaultRoomName,
  numberGradient,
} from "./firebase.js";

import {
  doc,
  collection,
  onSnapshot,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ------------------------------------------------------------
// DOM 取得
// ------------------------------------------------------------
const roomLabel = document.getElementById("roomLabel");
const playerName = document.getElementById("playerName");
const topicEl = document.getElementById("topic");
const numberArea = document.getElementById("numberArea");
const numberValue = document.getElementById("numberValue");
const waitingMsg = document.getElementById("waitingMsg");
const toggleButton = document.getElementById("toggleButton");
const peekHint = document.getElementById("peekHint");
const leaveButton = document.getElementById("leaveButton");
const memberList = document.getElementById("memberList");
const toast = document.getElementById("toast");

// 退出処理中フラグ（onSnapshot の自動リダイレクトと二重発火させないため）
let isLeaving = false;

// ------------------------------------------------------------
// 前提チェック（部屋 & 参加者ID）
// ------------------------------------------------------------
const roomId = getRoomIdFromUrl();
if (!roomId) {
  // 部屋が不明 → 参加画面へ
  window.location.replace("index.html");
}

const playerId = localStorage.getItem(playerStorageKey(roomId));
if (!playerId) {
  // まだ参加していない → 参加画面へ（room を引き継ぐ）
  window.location.replace(`index.html?room=${roomId}`);
}

// 画面上部の表示（ルーム名は部屋ドキュメント購読で差し替える）
roomLabel.textContent = defaultRoomName(roomId);
playerName.textContent = localStorage.getItem(`ito_name_${roomId}`) || "";

// ------------------------------------------------------------
// 表示状態（この端末内だけで持つ）
// ------------------------------------------------------------
let isHidden = false; // 数字を隠しているか
let currentNumber = null; // 今表示している数字
let lastSeenNumber = null; // 直前に受け取った数字（配り直し検知用）

// ------------------------------------------------------------
// 部屋ドキュメントの購読（お題・状態）
// ------------------------------------------------------------
const roomRef = doc(db, "rooms", roomId);
onSnapshot(
  roomRef,
  (snap) => {
    if (!snap.exists()) {
      topicEl.textContent = "…";
      return;
    }
    const data = snap.data();
    // ルーム名（管理者が変更したら反映）
    roomLabel.textContent = data.roomName || defaultRoomName(roomId);
    // お題（空なら「お題なし」）
    topicEl.textContent = data.currentTopic ? data.currentTopic : "お題なし";
  },
  (err) => {
    console.error("部屋の購読に失敗:", err);
    showToast("通信エラーが発生しました");
  }
);

// ------------------------------------------------------------
// 自分の参加者ドキュメントの購読（数字）
// ------------------------------------------------------------
const playerRef = doc(db, "rooms", roomId, "players", playerId);
onSnapshot(
  playerRef,
  (snap) => {
    if (!snap.exists()) {
      // 退出ボタンによる削除中なら、こちらでは何もしない（退出処理側で遷移する）
      if (isLeaving) return;
      // 自分のデータが消えた（部屋がリセットされた等）→ 参加画面へ
      localStorage.removeItem(playerStorageKey(roomId));
      window.location.replace(`index.html?room=${roomId}`);
      return;
    }
    const data = snap.data();
    // 名前が更新されている可能性に備えて反映
    if (data.name) playerName.textContent = data.name;
    updateNumber(data.number);
  },
  (err) => {
    console.error("自分のデータの購読に失敗:", err);
    showToast("通信エラーが発生しました");
  }
);

// ------------------------------------------------------------
// 同じ部屋のメンバー一覧の購読（名前のみ。数字は取得・表示しない）
// ------------------------------------------------------------
const playersRef = collection(db, "rooms", roomId, "players");
onSnapshot(
  playersRef,
  (snap) => {
    memberList.innerHTML = "";
    const others = snap.docs.filter((d) => d.id !== playerId);

    if (others.length === 0) {
      const li = document.createElement("li");
      li.className = "member-list__empty";
      li.textContent = "他の参加者はまだいません";
      memberList.appendChild(li);
      return;
    }

    others.forEach((d) => {
      const li = document.createElement("li");
      li.className = "member-list__item";
      li.textContent = d.data().name || "（名前未設定）";
      memberList.appendChild(li);
    });
  },
  (err) => {
    console.error("メンバー一覧の購読に失敗:", err);
  }
);

// ------------------------------------------------------------
// 数字表示の更新
// ------------------------------------------------------------
function updateNumber(number) {
  currentNumber = number;

  const hasNumber = number !== null && number !== undefined;

  if (!hasNumber) {
    // まだ数字が配られていない
    numberValue.textContent = "--";
    numberValue.style.backgroundImage = ""; // 既定のグラデーションに戻す
    numberArea.classList.remove("number-area--hidden");
    waitingMsg.hidden = false;
    toggleButton.hidden = true;
    peekHint.hidden = true;
    lastSeenNumber = null;
    return;
  }

  // 新しい数字が配られたら、自動的に「表示」状態にリセット
  if (number !== lastSeenNumber) {
    isHidden = false;
    lastSeenNumber = number;
    // 新しい数字の到着を軽く知らせる
    numberArea.classList.remove("pop");
    void numberArea.offsetWidth; // アニメーション再生のためリフロー
    numberArea.classList.add("pop");
  }

  waitingMsg.hidden = true;
  toggleButton.hidden = false;
  peekHint.hidden = false;

  renderNumber();
}

// 現在の isHidden 状態に応じて数字か「???」を表示
function renderNumber() {
  if (isHidden) {
    numberValue.textContent = "???";
    numberValue.style.backgroundImage = ""; // 隠す時は既定表示に戻す（CSS が muted 色にする）
    numberArea.classList.add("number-area--hidden");
    toggleButton.textContent = "数字を表示";
  } else {
    numberValue.textContent = String(currentNumber);
    // 小さい＝青／大きい＝赤。CSS の文字クリップに合わせて background-image を差し替える。
    numberValue.style.backgroundImage = numberGradient(currentNumber);
    numberArea.classList.remove("number-area--hidden");
    toggleButton.textContent = "数字を隠す";
  }
}

// ------------------------------------------------------------
// 表示/非表示の切替
// ------------------------------------------------------------
toggleButton.addEventListener("click", () => {
  isHidden = !isHidden;
  renderNumber();
});

// 数字エリアをタップしても切り替えられるように（使いやすさ向上）
numberArea.addEventListener("click", () => {
  if (currentNumber === null || currentNumber === undefined) return;
  isHidden = !isHidden;
  renderNumber();
});

// ------------------------------------------------------------
// 退出（この端末を空にして、別の人として参加し直す）
// ------------------------------------------------------------
// 誤タップ防止のため2回タップ式（ネイティブの confirm ダイアログは使わない）。
let leaveArmed = false;
let leaveResetTimer = null;

leaveButton.addEventListener("click", async () => {
  // 1回目のタップ: 確認状態にして、3秒後に自動で元へ戻す
  if (!leaveArmed) {
    leaveArmed = true;
    leaveButton.textContent = "もう一度タップで退出";
    clearTimeout(leaveResetTimer);
    leaveResetTimer = setTimeout(() => {
      leaveArmed = false;
      leaveButton.textContent = "退出する（別の人として参加）";
    }, 3000);
    return;
  }

  // 2回目のタップ: 実際に退出する
  clearTimeout(leaveResetTimer);
  isLeaving = true;
  leaveButton.disabled = true;
  leaveButton.textContent = "退出中…";

  try {
    // Firestore から自分の参加データを削除（人数・番号を残さない）
    await deleteDoc(playerRef);
  } catch (err) {
    console.error("退出時の削除に失敗:", err);
    // 削除に失敗しても、この端末の情報は消して先へ進む
  }

  // この端末の記憶を消す
  localStorage.removeItem(playerStorageKey(roomId));
  localStorage.removeItem(`ito_name_${roomId}`);

  // 部屋選択から始めたいので room 指定なしで参加画面へ
  window.location.replace("index.html");
});

// ------------------------------------------------------------
// トースト
// ------------------------------------------------------------
let toastTimer = null;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("toast--show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("toast--show");
  }, 2600);
}
