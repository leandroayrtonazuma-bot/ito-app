# ============================================================
# ito イベント終了後データ削除スクリプト（Windows / PowerShell）
# ------------------------------------------------------------
# Firestore の rooms コレクション（配下の players も含む）を
# すべて削除します。参加者の名前・数字などのデータが消えます。
#
# ※ 次回イベントで管理画面(admin.html)を開けば、部屋は自動で
#    作り直されます。アプリ本体・GitHub Pages には影響しません。
#    Firebaseプロジェクト自体は削除しません。
#
# 使い方:
#   1. このフォルダで PowerShell を開く
#   2. 実行:  ./cleanup-after-event.ps1
#      （初回だけ実行許可が必要な場合）
#      powershell -ExecutionPolicy Bypass -File ./cleanup-after-event.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$Project = "ito-event-9ifq4d"

Write-Host ""
Write-Host "=== ito データ削除 ===" -ForegroundColor Cyan
Write-Host "対象プロジェクト: $Project"
Write-Host "削除対象: rooms コレクション全体（players を含む全参加者データ）"
Write-Host ""

$ans = Read-Host "本当に削除しますか？ 削除するには 'yes' と入力"
if ($ans -ne "yes") {
    Write-Host "中止しました。何も削除していません。" -ForegroundColor Yellow
    exit 0
}

Write-Host "削除中..." -ForegroundColor Yellow
firebase firestore:delete rooms --recursive --project $Project --force

Write-Host ""
Write-Host "完了しました。全参加者データを削除しました。" -ForegroundColor Green
Write-Host "次回は管理画面(admin.html)を開くと部屋が自動で作られます。"
