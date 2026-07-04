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
//
//   ※ ?new=1 を付けると、この端末が既に参加済みでも自動復帰させず、
//     必ず部屋選択から始めます（PCでのデバッグ用。「参加者としてひらく.html」が使用）。
//     通常のQRアクセスにはこのパラメータは付かないため、参加者の自動復帰は従来通りです。
// ============================================================

import {
  db,
  DEFAULT_ROOM_IDS,
  TOPICS,
  STATUS,
  getRoomIdFromUrl,
  playerStorageKey,
  adminFlagKey,
  defaultRoomName,
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
// 管理者画面の「参加者として参加」から来たか（?admin=1）
// 立っていれば、参加完了時にこの端末・ルームを「管理者プレイ中」として記録する
const isAdminJoin = new URLSearchParams(window.location.search).get("admin") === "1";

// 部屋一覧の管理元（meta/rooms ドキュメントの roomIds が正。管理画面で増減する）
const metaRef = doc(db, "meta", "rooms");

// 部屋一覧（meta/rooms）の購読解除・部屋ボタンの購読解除をまとめて持っておく
// （部屋選択画面を離れる/作り直すたびに全部解除してから作り直す）
// ※ init() から同期的に呼ばれ得るため、init() 呼び出しより前で宣言しておく
let roomGridUnsubscribe = null;
const roomButtons = new Map(); // roomId -> { btn, unsubscribeRoom, unsubscribePlayers }

// ------------------------------------------------------------
// 初期表示の振り分け
// ------------------------------------------------------------
init();

async function init() {
  const urlRoom = getRoomIdFromUrl();
  // ?new=1: 既に参加済みでも自動復帰させず、必ず部屋選択から始める（PCデバッグ用）
  const forceNew = new URLSearchParams(window.location.search).get("new") === "1";

  if (urlRoom) {
    // 直リンク（?room=A）で来た場合
    // すでにこの部屋で参加済みなら、そのままプレイヤー画面へ
    if (!forceNew && localStorage.getItem(playerStorageKey(urlRoom))) {
      if (isAdminJoin) localStorage.setItem(adminFlagKey(urlRoom), "1");
      goToPlayerScreen(urlRoom);
      return;
    }
    cameFromUrl = true;
    openJoinStep(urlRoom);
  } else {
    // 通常（部屋未指定）: どこかの部屋に参加済みなら復帰させる
    if (!forceNew) {
      const ids = await fetchRoomIds();
      const joined = ids.find((r) => localStorage.getItem(playerStorageKey(r)));
      if (joined) {
        goToPlayerScreen(joined);
        return;
      }
    }
    openRoomSelect();
  }
}

// meta/rooms から現在の部屋ID一覧を取得する（無ければ初期値で作成しておく）
async function fetchRoomIds() {
  const snap = await getDoc(metaRef);
  if (snap.exists() && Array.isArray(snap.data().roomIds)) {
    return snap.data().roomIds;
  }
  await setDoc(metaRef, { roomIds: DEFAULT_ROOM_IDS }, { merge: true });
  return DEFAULT_ROOM_IDS;
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
// 部屋の追加・削除（管理画面操作）にもリアルタイムで追従する
function buildRoomGrid() {
  teardownRoomGrid();
  roomGrid.innerHTML = "";

  roomGridUnsubscribe = onSnapshot(metaRef, (snap) => {
    const ids = (snap.exists() && snap.data().roomIds) || DEFAULT_ROOM_IDS;
    syncRoomButtons(ids);
  });
}

// 部屋選択画面を離れるときに、全ての購読を解除する
function teardownRoomGrid() {
  if (roomGridUnsubscribe) {
    roomGridUnsubscribe();
    roomGridUnsubscribe = null;
  }
  roomButtons.forEach((entry) => {
    entry.unsubscribeRoom();
    entry.unsubscribePlayers();
  });
  roomButtons.clear();
}

// 現在の部屋ID一覧（ids）に合わせて、ボタンを追加・削除する
function syncRoomButtons(ids) {
  ids.forEach((id) => {
    if (roomButtons.has(id)) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "room-choice";
    // 表示はルーム名（管理者が変更可能）。記号は見せない。
    const nameEl = document.createElement("span");
    nameEl.className = "room-choice__name";
    nameEl.textContent = defaultRoomName(id);
    const countEl = document.createElement("span");
    countEl.className = "room-choice__count";
    countEl.innerHTML = "…";
    btn.appendChild(nameEl);
    btn.appendChild(countEl);
    btn.addEventListener("click", () => openJoinStep(id));
    roomGrid.appendChild(btn);

    // ルーム名をリアルタイム監視（管理者が変更したら即反映）
    const unsubscribeRoom = onSnapshot(doc(db, "rooms", id), (snap) => {
      const name = (snap.exists() && snap.data().roomName) || defaultRoomName(id);
      nameEl.textContent = name;
    });

    // 各部屋の参加人数をリアルタイム監視（players の件数）
    const unsubscribePlayers = onSnapshot(
      collection(db, "rooms", id, "players"),
      (snap) => {
        countEl.innerHTML = "<b>" + snap.size + "</b> 人";
      },
      (err) => {
        console.warn("人数の取得に失敗:", id, err);
        countEl.textContent = "–";
      }
    );

    roomButtons.set(id, { btn, unsubscribeRoom, unsubscribePlayers });
  });

  // 一覧から消えた部屋（管理画面で削除された）→ ボタンを消す
  roomButtons.forEach((entry, id) => {
    if (ids.includes(id)) return;
    entry.unsubscribeRoom();
    entry.unsubscribePlayers();
    entry.btn.remove();
    roomButtons.delete(id);
  });
}

// ------------------------------------------------------------
// ステップ2: 名前入力
// ------------------------------------------------------------
function openJoinStep(id) {
  teardownRoomGrid(); // 部屋選択画面の購読は不要になるので止める
  selectedRoom = id;
  // まず初期名を表示し、実際のルーム名を取得して差し替える
  roomLabel.textContent = defaultRoomName(id);
  getDoc(doc(db, "rooms", id))
    .then((snap) => {
      if (selectedRoom !== id) return; // 途中で選び直された場合は無視
      roomLabel.textContent =
        (snap.exists() && snap.data().roomName) || defaultRoomName(id);
    })
    .catch(() => {});

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
    // 管理者の「参加者として参加」から来た場合、この端末・ルームを記録しておく
    if (isAdminJoin) localStorage.setItem(adminFlagKey(selectedRoom), "1");

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
      roomName: defaultRoomName(id), // ルーム名（管理者が変更可能）
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
