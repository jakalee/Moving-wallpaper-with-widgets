#!/bin/zsh
# 로그인 시 바탕화면 서버를 자동 실행하는 LaunchAgent 설치
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || echo /opt/homebrew/bin/node)"
PLIST="$HOME/Library/LaunchAgents/local.plash-desk.plist"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>local.plash-desk</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/server.js</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/.cache/server.log</string>
  <key>StandardErrorPath</key><string>$DIR/.cache/server.log</string>
</dict></plist>
PL
launchctl bootout gui/$(id -u)/local.plash-desk 2>/dev/null || true
launchctl bootstrap gui/$(id -u) "$PLIST"
echo "✅ 자동 실행 등록 완료 → http://localhost:8777"
echo "   iMessage 표시를 원하면 '시스템 설정 > 개인정보 보호 > 전체 디스크 접근'에 $NODE 를 추가하세요."
