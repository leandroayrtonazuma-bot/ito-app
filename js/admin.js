// ============================================================
// 管理画面（admin.html）のロジック
// ------------------------------------------------------------
// やること:
//   1. 各ルームのカードを表示（参加人数・お題・状態をリアルタイム表示）
//   2. [数字配布] … 参加者全員に 1〜100 の重複なし数字をランダム配布
//   3. [次のゲーム] … 全員の数字を消去 → 次のお題へ → 新しい数字を配布
//
// 管理者が押すボタンはこの2つだけ、というシンプル設計です。
// ============================================================

import {
  db,
  ROOM_IDS,
  TOPICS,
  STATUS,
  NUMBER_MIN,
  NUMBER_MAX,
} from "./firebase.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  onSnapshot,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const roomList = document.getElementById("roomList");
const toast = document.getElementById("toast");

// 状態の日本語ラベル
const STATUS_LABEL = {
  [STATUS.WAITING]: "待機中",
  [STATUS.PLAYING]: "プレイ中",
};

// ------------------------------------------------------------
// 初期化: 各ルームのカードを作り、Firestore を購読する
// ------------------------------------------------------------
init();

async function init() {
  for (const roomId of ROOM_IDS) {
    // 部屋ドキュメントが無ければ初期状態で作成
    await ensureRoomExists(roomId);
    // カードを描画
    const card = buildRoomCard(roomId);
    roomList.appendChild(card);
    // 部屋の状態・参加人数を購読
    subscribeRoom(roomId, card);
  }
}

// 部屋ドキュメントが無ければ作成
async function ensureRoomExists(roomId) {
  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) {
    await setDoc(roomRef, {
      roomId,
      currentTopic: TOPICS[0],
      topicIndex: 0,
      gameRound: 0,
      status: STATUS.WAITING,
      createdAt: serverTimestamp(),
    });
  }
}

// ------------------------------------------------------------
// カードの DOM を組み立てる
// ------------------------------------------------------------
function buildRoomCard(roomId) {
  const card = document.createElement("section");
  card.className = "room-card fade-in";
  card.innerHTML = `
    <div class="room-card__head">
      <span class="room-badge">ルーム ${roomId}</span>
      <span class="status-pill" data-role="status">…</span>
    </div>

    <div class="room-card__stats">
      <div class="stat">
        <span class="stat__num" data-role="count">0</span>
        <span class="stat__label">参加人数</span>
      </div>
      <div class="stat stat--topic">
        <span class="stat__label">お題</span>
        <span class="stat__topic" data-role="topic">…</span>
      </div>
    </div>

    <div class="room-card__actions">
      <button class="btn btn--primary btn--block" data-role="distribute" type="button">
        数字配布
      </button>
      <button class="btn btn--accent btn--block" data-role="next" type="button">
        次のゲーム
      </button>
    </div>

    <button class="btn btn--ghost btn--block" data-role="copy" type="button">
      参加用リンクをコピー
    </button>
  `;

  // ボタンにイベントを設定
  card.querySelector('[data-role="distribute"]').addEventListener("click", (e) => {
    handleDistribute(roomId, e.currentTarget);
  });
  card.querySelector('[data-role="next"]').addEventListener("click", (e) => {
    handleNextGame(roomId, e.currentTarget);
  });
  card.querySelector('[data-role="copy"]').addEventListener("click", () => {
    copyJoinLink(roomId);
  });

  return card;
}

// ------------------------------------------------------------
// 部屋の状態・参加人数をリアルタイム購読
// ------------------------------------------------------------
function subscribeRoom(roomId, card) {
  const statusEl = card.querySelector('[data-role="status"]');
  const countEl = card.querySelector('[data-role="count"]');
  const topicEl = card.querySelector('[data-role="topic"]');

  // 部屋ドキュメント（お題・状態）
  onSnapshot(doc(db, "rooms", roomId), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    topicEl.textContent = data.currentTopic || "…";
    const label = STATUS_LABEL[data.status] || "待機中";
    statusEl.textContent = label;
    statusEl.classList.toggle("status-pill--playing", data.status === STATUS.PLAYING);
  });

  // 参加者サブコレクション（人数）
  onSnapshot(collection(db, "rooms", roomId, "players"), (snap) => {
    countEl.textContent = String(snap.size);
  });
}

// ------------------------------------------------------------
// [数字配布] 参加者全員に重複なしの数字を配る
// ------------------------------------------------------------
async function handleDistribute(roomId, button) {
  await distributeNumbers(roomId, button, { advanceTopic: false });
}

// ------------------------------------------------------------
// [次のゲーム] 数字を消去 → 次のお題 → 新しい数字を配布
// ------------------------------------------------------------
async function handleNextGame(roomId, button) {
  await distributeNumbers(roomId, button, { advanceTopic: true });
}

// 数字配布の共通処理
// options.advanceTopic が true なら、お題を次へ進める（＝次のゲーム）
async function distributeNumbers(roomId, button, options) {
  setButtonLoading(button, true);
  try {
    // 参加者を取得
    const playersRef = collection(db, "rooms", roomId, "players");
    const playersSnap = await getDocs(playersRef);

    if (playersSnap.empty) {
      showToast(`ルーム ${roomId} に参加者がいません`);
      return;
    }

    // 重複なしの数字を人数分だけ用意（1〜100 をシャッフルして先頭から取る）
    const count = playersSnap.size;
    const numbers = pickUniqueNumbers(count, NUMBER_MIN, NUMBER_MAX);

    // まとめて更新（バッチ）
    const batch = writeBatch(db);

    // 各参加者に数字を割り当て
    playersSnap.docs.forEach((playerDoc, i) => {
      batch.update(playerDoc.ref, { number: numbers[i] });
    });

    // 部屋ドキュメントの更新内容を決める
    const roomRef = doc(db, "rooms", roomId);
    const roomSnap = await getDoc(roomRef);
    const roomData = roomSnap.data() || {};

    const roomUpdate = {
      status: STATUS.PLAYING,
      gameRound: (roomData.gameRound || 0) + 1,
    };

    if (options.advanceTopic) {
      // 次のお題へ（リストの末尾まで行ったら先頭へ戻る）
      const nextIndex = ((roomData.topicIndex || 0) + 1) % TOPICS.length;
      roomUpdate.topicIndex = nextIndex;
      roomUpdate.currentTopic = TOPICS[nextIndex];
    }

    batch.update(roomRef, roomUpdate);

    // 実行
    await batch.commit();

    showToast(
      options.advanceTopic
        ? `ルーム ${roomId}：次のお題で数字を配りました`
        : `ルーム ${roomId}：${count}人に数字を配りました`
    );
  } catch (err) {
    console.error("数字配布に失敗:", err);
    showToast("配布に失敗しました。もう一度お試しください");
  } finally {
    setButtonLoading(button, false);
  }
}

// ------------------------------------------------------------
// 1〜max の中から count 個、重複なしでランダムに選ぶ
// （Fisher–Yates シャッフルで先頭 count 個を取り出す）
// ------------------------------------------------------------
function pickUniqueNumbers(count, min, max) {
  const pool = [];
  for (let n = min; n <= max; n++) pool.push(n);

  // 参加者が 100 人を超える場合は上限までに丸める（重複を避けるため）
  const take = Math.min(count, pool.length);

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, take);
}

// ------------------------------------------------------------
// 参加用リンクをクリップボードにコピー
// ------------------------------------------------------------
async function copyJoinLink(roomId) {
  // 現在の admin.html の URL を基準に index.html?room=XX を組み立てる
  const base = window.location.href.replace(/admin\.html.*$/, "index.html");
  const url = `${base}?room=${roomId}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast(`コピーしました：${url}`);
  } catch {
    // クリップボードが使えない環境向けのフォールバック
    window.prompt("このURLをコピーしてください", url);
  }
}

// ------------------------------------------------------------
// UI 補助
// ------------------------------------------------------------
function setButtonLoading(button, loading) {
  button.disabled = loading;
  button.classList.toggle("is-loading", loading);
}

let toastTimer = null;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("toast--show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("toast--show");
  }, 3000);
}
