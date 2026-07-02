// ============================================================
// 参加画面（index.html）のロジック
// ------------------------------------------------------------
// 流れ:
//   1. 部屋を選ぶ（A〜E。各部屋の現在人数をリアルタイム表示）
//   2. 名前を入力して「参加する」を押す → その部屋に参加者を登録
//   3. 参加者IDを localStorage に保存し、プレイヤー画面へ移動
//
//   ※ QR/URL は1つ（index.html）に統一。開くと部屋選択が出ます。
//     互換のため ?room=A のような直リンクもそのまま使えます
//     （その場合は部屋選択を飛ばして名前入力から始まります）。
// ============================================================

import {
  db,
  ROOM_IDS,
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
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ------------------------------------------------------------
// DOM 取得
// ------------------------------------------------------------
const roomSelect = document.getElementById("roomSelect");
const roomGrid = document.getElementById("roomGrid");
const joinStep = document.getElementById("joinStep");
const roomLabel = document.getElementById("roomLabel");
const joinForm = document.getElementById("joinForm");
const nameInput = document.getElementById("nameInput");
const joinButton = document.getElementById("joinButton");
const backButton = document.getElementById("backButton");
const toast = document.getElementById("toast");

// 現在選択中の部屋（部屋選択 or URLの ?room= で決まる）
let selectedRoom = null;
// URLで部屋が直接指定されて来たか（その場合は「選び直す」を隠す）
let cameFromUrl = false;

// ------------------------------------------------------------
// 初期表示の振り分け
// ------------------------------------------------------------
init();

function init() {
  const urlRoom = getRoomIdFromUrl();

  if (urlRoom) {
    // 直リンク（?room=A）で来た場合
    // すでにこの部屋で参加済みなら、そのままプレイヤー画面へ
    if (localStorage.getItem(playerStorageKey(urlRoom))) {
      goToPlayerScreen(urlRoom);
      return;
    }
    cameFromUrl = true;
    openJoinStep(urlRoom);
  } else {
    // 通常（部屋未指定）: どこかの部屋に参加済みなら復帰させる
    const joined = ROOM_IDS.find((r) => localStorage.getItem(playerStorageKey(r)));
    if (joined) {
      goToPlayerScreen(joined);
      return;
    }
    openRoomSelect();
  }
}

// ------------------------------------------------------------
// ステップ1: 部屋選択
// ------------------------------------------------------------
function openRoomSelect() {
  selectedRoom = null;
  joinStep.hidden = true;
  roomSelect.hidden = false;
  buildRoomGrid();
}

// 部屋ボタンを生成し、それぞれの現在人数をリアルタイム表示する
function buildRoomGrid() {
  roomGrid.innerHTML = "";

  ROOM_IDS.forEach((id) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "room-choice";
    btn.innerHTML =
      '<span class="room-choice__letter">' + id + "</span>" +
      '<span class="room-choice__count" id="count-' + id + '">…</span>';
    btn.addEventListener("click", () => openJoinStep(id));
    roomGrid.appendChild(btn);

    // 各部屋の参加人数をリアルタイム監視（players の件数）
    const playersRef = collection(db, "rooms", id, "players");
    onSnapshot(
      playersRef,
      (snap) => {
        const el = document.getElementById("count-" + id);
        if (el) el.innerHTML = "<b>" + snap.size + "</b> 人";
      },
      (err) => {
        console.warn("人数の取得に失敗:", id, err);
        const el = document.getElementById("count-" + id);
        if (el) el.textContent = "–";
      }
    );
  });
}

// ------------------------------------------------------------
// ステップ2: 名前入力
// ------------------------------------------------------------
function openJoinStep(id) {
  selectedRoom = id;
  roomLabel.textContent = id;

  roomSelect.hidden = true;
  joinStep.hidden = false;

  // URL直リンクで来たときは「選び直す」を出さない
  backButton.hidden = cameFromUrl;

  // 前回この部屋で使った名前があれば復元
  const savedName = localStorage.getItem("ito_name_" + id);
  if (savedName) nameInput.value = savedName;

  nameInput.focus();
}

// 「← 部屋を選び直す」
backButton.addEventListener("click", () => {
  openRoomSelect();
});

// ------------------------------------------------------------
// 参加処理
// ------------------------------------------------------------
joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedRoom) {
    openRoomSelect();
    return;
  }

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
    await ensureRoomExists(selectedRoom);

    // 2. 参加者を players サブコレクションに追加
    const playersRef = collection(db, "rooms", selectedRoom, "players");
    const newPlayer = await addDoc(playersRef, {
      name: name,
      number: null, // まだ数字は配られていない
      joinedAt: serverTimestamp(),
    });

    // 3. 参加者ID・名前を localStorage に保存（プレイヤー画面で使う）
    localStorage.setItem(playerStorageKey(selectedRoom), newPlayer.id);
    localStorage.setItem("ito_name_" + selectedRoom, name);

    // 4. プレイヤー画面へ移動
    goToPlayerScreen(selectedRoom);
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
function goToPlayerScreen(room) {
  window.location.href = "player.html?room=" + room;
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
