// ============================================================
// 管理画面（admin.html）のロジック
// ------------------------------------------------------------
// できること:
//   1. 各ルームの参加者一覧を、名前＋現在のカード番号つきでリアルタイム表示
//   2. [数字配布] … 参加者全員に 1〜100 の重複なし数字をランダム配布
//   3. [次のゲーム] … 数字を配り直し、お題を次のお題へ自動で進める
//   4. お題の手動設定（自由入力 / おまかせ / お題なし）
//   5. ルーム名の変更（参加者側にも反映）
//   6. 参加者の削除（いなくなった人を管理者が消せる）
// ============================================================

import {
  db,
  ROOM_IDS,
  TOPICS,
  STATUS,
  NUMBER_MIN,
  NUMBER_MAX,
  defaultRoomName,
} from "./firebase.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
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
    await ensureRoomExists(roomId);
    const card = buildRoomCard(roomId);
    roomList.appendChild(card);
    subscribeRoom(roomId, card);
    subscribePlayers(roomId, card);
  }
}

// 部屋ドキュメントが無ければ作成
async function ensureRoomExists(roomId) {
  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) {
    await setDoc(roomRef, {
      roomId,
      roomName: defaultRoomName(roomId),
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
      <span class="room-badge" data-role="roomName">…</span>
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

    <!-- 参加者一覧（名前＋現在の数字＋削除） -->
    <div class="players">
      <div class="players__caption">参加者（現在の数字）</div>
      <div class="players__list" data-role="players">
        <p class="players__empty">まだ参加者がいません</p>
      </div>
    </div>

    <!-- 設定（お題・ルーム名） -->
    <details class="room-settings">
      <summary>お題・ルーム名を設定</summary>

      <div class="field">
        <label class="field__label">お題</label>
        <div class="field__row">
          <input class="mini-input" data-role="topicInput" type="text"
                 placeholder="お題を入力（空欄も可）" maxlength="40" />
          <button class="btn btn--mini btn--primary" data-role="topicSet" type="button">設定</button>
        </div>
        <div class="field__row">
          <button class="btn btn--mini btn--ghost" data-role="topicRandom" type="button">おまかせ</button>
          <button class="btn btn--mini btn--ghost" data-role="topicClear" type="button">お題なし</button>
        </div>
      </div>

      <div class="field">
        <label class="field__label">ルーム名</label>
        <div class="field__row">
          <input class="mini-input" data-role="nameInput" type="text"
                 placeholder="例：文学部テーブル" maxlength="24" />
          <button class="btn btn--mini btn--primary" data-role="nameSet" type="button">変更</button>
        </div>
      </div>
    </details>

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

  // 進行ボタン
  card.querySelector('[data-role="distribute"]').addEventListener("click", (e) => {
    handleDistribute(roomId, e.currentTarget);
  });
  card.querySelector('[data-role="next"]').addEventListener("click", (e) => {
    handleNextGame(roomId, e.currentTarget);
  });
  card.querySelector('[data-role="copy"]').addEventListener("click", () => {
    copyJoinLink(roomId);
  });

  // お題設定
  card.querySelector('[data-role="topicSet"]').addEventListener("click", () => {
    const input = card.querySelector('[data-role="topicInput"]');
    setTopic(roomId, input.value.trim());
  });
  card.querySelector('[data-role="topicRandom"]').addEventListener("click", () => {
    setRandomTopic(roomId);
  });
  card.querySelector('[data-role="topicClear"]').addEventListener("click", () => {
    setTopic(roomId, "");
    card.querySelector('[data-role="topicInput"]').value = "";
  });

  // ルーム名変更
  card.querySelector('[data-role="nameSet"]').addEventListener("click", () => {
    const input = card.querySelector('[data-role="nameInput"]');
    setRoomName(roomId, input.value.trim());
  });

  return card;
}

// ------------------------------------------------------------
// 部屋の状態・お題・ルーム名をリアルタイム購読
// ------------------------------------------------------------
function subscribeRoom(roomId, card) {
  const statusEl = card.querySelector('[data-role="status"]');
  const topicEl = card.querySelector('[data-role="topic"]');
  const nameEl = card.querySelector('[data-role="roomName"]');
  const topicInput = card.querySelector('[data-role="topicInput"]');
  const nameInput = card.querySelector('[data-role="nameInput"]');

  onSnapshot(doc(db, "rooms", roomId), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();

    // お題（空なら「お題なし」と表示）
    const topic = data.currentTopic || "";
    topicEl.textContent = topic || "お題なし";
    topicEl.classList.toggle("stat__topic--empty", !topic);
    // 入力中でなければ入力欄にも反映
    if (document.activeElement !== topicInput) topicInput.value = topic;

    // ルーム名
    const name = data.roomName || defaultRoomName(roomId);
    nameEl.textContent = name;
    if (document.activeElement !== nameInput) nameInput.value = name;

    // 状態
    const label = STATUS_LABEL[data.status] || "待機中";
    statusEl.textContent = label;
    statusEl.classList.toggle("status-pill--playing", data.status === STATUS.PLAYING);
  });
}

// ------------------------------------------------------------
// 参加者一覧（名前＋現在の数字）をリアルタイム購読
// ------------------------------------------------------------
function subscribePlayers(roomId, card) {
  const countEl = card.querySelector('[data-role="count"]');
  const listEl = card.querySelector('[data-role="players"]');

  onSnapshot(collection(db, "rooms", roomId, "players"), (snap) => {
    countEl.textContent = String(snap.size);
    renderPlayers(roomId, listEl, snap);
  });
}

// 参加者一覧を描画する
function renderPlayers(roomId, listEl, snap) {
  if (snap.empty) {
    listEl.innerHTML = '<p class="players__empty">まだ参加者がいません</p>';
    return;
  }

  // 参加順に並べる（joinedAt があれば昇順）
  const docs = snap.docs.slice().sort((a, b) => {
    const ta = a.data().joinedAt?.seconds || 0;
    const tb = b.data().joinedAt?.seconds || 0;
    return ta - tb;
  });

  listEl.innerHTML = "";
  docs.forEach((playerDoc) => {
    const d = playerDoc.data();
    const hasNumber = d.number !== null && d.number !== undefined;

    const row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML = `
      <span class="player-row__name"></span>
      <span class="player-row__num ${hasNumber ? "" : "player-row__num--none"}"></span>
      <button class="player-row__del" type="button" title="この参加者を削除">削除</button>
    `;
    // 名前・数字はテキストとして安全に入れる（XSS 防止）
    row.querySelector(".player-row__name").textContent = d.name || "（無名）";
    row.querySelector(".player-row__num").textContent = hasNumber ? String(d.number) : "—";

    // 削除（誤操作防止のため2回クリック式）
    const delBtn = row.querySelector(".player-row__del");
    let armed = false;
    let armTimer = null;
    delBtn.addEventListener("click", async () => {
      if (!armed) {
        armed = true;
        delBtn.textContent = "本当に削除？";
        delBtn.classList.add("player-row__del--armed");
        clearTimeout(armTimer);
        armTimer = setTimeout(() => {
          armed = false;
          delBtn.textContent = "削除";
          delBtn.classList.remove("player-row__del--armed");
        }, 3000);
        return;
      }
      clearTimeout(armTimer);
      delBtn.disabled = true;
      delBtn.textContent = "削除中…";
      try {
        await deleteDoc(playerDoc.ref);
        showToast(`${d.name || "参加者"} を削除しました`);
      } catch (err) {
        console.error("参加者の削除に失敗:", err);
        showToast("削除に失敗しました");
        delBtn.disabled = false;
        delBtn.textContent = "削除";
        delBtn.classList.remove("player-row__del--armed");
      }
    });

    listEl.appendChild(row);
  });
}

// ------------------------------------------------------------
// お題の手動設定
// ------------------------------------------------------------
// 自由入力（空文字＝お題なし）。topicIndex は変えないので、
// 次の「次のゲーム」ではプリセットの続きに進みます。
async function setTopic(roomId, topic) {
  try {
    await updateDoc(doc(db, "rooms", roomId), { currentTopic: topic });
    showToast(topic ? `お題を「${topic}」にしました` : "お題を「なし」にしました");
  } catch (err) {
    console.error("お題の設定に失敗:", err);
    showToast("お題の設定に失敗しました");
  }
}

// プリセットからランダムに1つ選んで設定（以降の順送りもそこから続く）
async function setRandomTopic(roomId) {
  const idx = Math.floor(Math.random() * TOPICS.length);
  try {
    await updateDoc(doc(db, "rooms", roomId), {
      currentTopic: TOPICS[idx],
      topicIndex: idx,
    });
    showToast(`お題を「${TOPICS[idx]}」にしました`);
  } catch (err) {
    console.error("お題の設定に失敗:", err);
    showToast("お題の設定に失敗しました");
  }
}

// ------------------------------------------------------------
// ルーム名の変更（空なら初期値に戻す）
// ------------------------------------------------------------
async function setRoomName(roomId, name) {
  const value = name || defaultRoomName(roomId);
  try {
    await updateDoc(doc(db, "rooms", roomId), { roomName: value });
    showToast(`ルーム名を「${value}」にしました`);
  } catch (err) {
    console.error("ルーム名の変更に失敗:", err);
    showToast("ルーム名の変更に失敗しました");
  }
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
async function distributeNumbers(roomId, button, options) {
  setButtonLoading(button, true);
  try {
    const playersRef = collection(db, "rooms", roomId, "players");
    const playersSnap = await getDocs(playersRef);

    if (playersSnap.empty) {
      showToast(`このルームに参加者がいません`);
      return;
    }

    const count = playersSnap.size;
    const numbers = pickUniqueNumbers(count, NUMBER_MIN, NUMBER_MAX);

    const batch = writeBatch(db);
    playersSnap.docs.forEach((playerDoc, i) => {
      batch.update(playerDoc.ref, { number: numbers[i] });
    });

    const roomRef = doc(db, "rooms", roomId);
    const roomSnap = await getDoc(roomRef);
    const roomData = roomSnap.data() || {};

    const roomUpdate = {
      status: STATUS.PLAYING,
      gameRound: (roomData.gameRound || 0) + 1,
    };

    if (options.advanceTopic) {
      // 次のお題へ（末尾まで行ったら先頭へ戻る）
      const nextIndex = ((roomData.topicIndex || 0) + 1) % TOPICS.length;
      roomUpdate.topicIndex = nextIndex;
      roomUpdate.currentTopic = TOPICS[nextIndex];
    }

    batch.update(roomRef, roomUpdate);
    await batch.commit();

    showToast(
      options.advanceTopic
        ? `次のお題で数字を配りました`
        : `${count}人に数字を配りました`
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
// ------------------------------------------------------------
function pickUniqueNumbers(count, min, max) {
  const pool = [];
  for (let n = min; n <= max; n++) pool.push(n);
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
  const base = window.location.href.replace(/admin\.html.*$/, "index.html");
  const url = `${base}?room=${roomId}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast(`コピーしました：${url}`);
  } catch {
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
