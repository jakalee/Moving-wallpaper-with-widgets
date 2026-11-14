# 위젯 품은 움직이는 배경화면

[Plash](https://sindresorhus.com/plash)로 띄우는 macOS 라이브 바탕화면. 맨해튼 펜트하우스 책상 장면. 창밖 하늘·빌딩이 **실제 날씨·시간·계절**에 맞춰 바뀌고, 책상 소품에 실시간 데이터가 표시됩니다.

## 실행

요구 사항: macOS 14+, Node.js 22.5+ (`brew install node`), Xcode Command Line Tools(캘린더 도우미 컴파일용)

```bash
git clone https://github.com/jakalee/Moving-wallpaper-with-widgets.git
cd Moving-wallpaper-with-widgets
npm install
cp config.example.json config.json   # 메일 계정·사진 폴더·종목·위치 수정
npm start                            # → http://localhost:8777
```

Plash → *Add Website* → `http://localhost:8777`

로그인할 때 자동 실행: `npm run autostart` (LaunchAgent 등록, 로그는 `.cache/server.log`)

## 소품별 데이터

| 소품 | 데이터 | 갱신 |
|---|---|---|
| 창밖 | Open-Meteo(실패 시 wttr.in) 날씨 + 태양/달 위치 계산 | 10분 (화면은 2초마다 보간) |
| 탁상시계 | 시스템 시각 | 1초 |
| 탁상 달력 | 날짜 + Mac 캘린더 다음 일정 | 5분 |
| 화이트보드 | Mac 캘린더 오늘 일정 + 미리 알림(오늘까지) | 5분 |
| 보조 모니터 | 네이버 증권 (삼성증권·기아·에스엘 + 코스피/코스닥), **업데이트 시간** 표시 | 1분 |
| 메인 모니터 | IMAP 받은 편지함의 오늘 메일 | 3분 |
| 액자 | `photoDir` 폴더에서 랜덤 사진 | 1시간 |
| 곰인형 말풍선 | 최근 받은 iMessage (20분간 표시) | 15초 |

## 처음 설정

1. **메일 비밀번호** — 파일에 저장하지 않고 macOS 키체인에 넣습니다.
   ```bash
   npm run mail-setup
   ```
2. **캘린더/미리 알림** — 처음 실행 시 macOS 권한 창에서 허용.
3. **iMessage** — 시스템 설정 › 개인정보 보호 및 보안 › **전체 디스크 접근 권한**에 서버를 실행하는 앱(터미널 또는 `/opt/homebrew/bin/node`)을 추가.
4. **사진 폴더 / 종목 / 위치 / 메일 서버** — `config.json`에서 수정 (`photoDir`, `stocks`, `location`, `mail`). 메일플러그처럼 `AUTHENTICATE`를 지원하지 않는 서버는 `mail.loginMethod`를 `LOGIN`으로 둡니다.

## 미리보기

- `?debug=1` — 날씨·시각·월을 바꿔보는 패널
- `?weather=snow&hour=21&month=12` — 특정 상황 고정
- `?view=x,y,width` — 특정 영역 확대 (원본 1672×941 px 기준)

## 파일

- `server.js` 데이터 서버 · `app.js` 장면/애니메이션 · `style.css` · `index.html`
- `city-night.png` / `city-day.png` / `sky-mask.png` — `city.png`에서 하늘을 분리하고 낮 버전을 만든 레이어 (`helpers/sky.py <미리보기폴더>`, `helpers/day.py <미리보기폴더>` 순서로 재생성, Pillow·NumPy·SciPy 필요)
- `foreground-clean.png` — `foreground.png`에서 구멍 가장자리 분홍 테두리를 제거한 버전
- `helpers/eventkit.swift` — 캘린더·미리 알림을 읽는 Swift 도우미 (서버가 처음 실행할 때 자동 컴파일)
