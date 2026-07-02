#!/usr/bin/env bash
# ============================================================
# ito イベント終了後データ削除スクリプト（Mac / Linux）
# ------------------------------------------------------------
# Firestore の rooms コレクション（配下の players も含む）を
# すべて削除します。参加者の名前・数字などのデータが消えます。
#
# ※ 次回イベントで admin.html を開けば部屋は自動で作り直されます。
#    アプリ本体・GitHub Pages・Firebaseプロジェクトには影響しません。
#
# 使い方:  bash cleanup-after-event.sh
# ============================================================
set -euo pipefail
PROJECT="ito-event-9ifq4d"

echo ""
echo "=== ito データ削除 ==="
echo "対象プロジェクト: $PROJECT"
echo "削除対象: rooms コレクション全体（players を含む全参加者データ）"
echo ""
read -r -p "本当に削除しますか？ 削除するには 'yes' と入力: " ans
if [ "$ans" != "yes" ]; then
  echo "中止しました。何も削除していません。"
  exit 0
fi

echo "削除中..."
firebase firestore:delete rooms --recursive --project "$PROJECT" --force
echo ""
echo "完了しました。全参加者データを削除しました。"
echo "次回は admin.html を開くと部屋が自動で作られます。"
