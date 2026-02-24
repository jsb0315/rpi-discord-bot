# Raspberry Pi Discord Bot (Server Manager)

개인 프로젝트가 올라간 라즈베리파이 서버를 디스코드에서 관리하기 위한 봇 명령어 정리입니다.

## 주요 명령어

- `/help` (명령 도움말)

- `/status` (서버 상태 요약)
  - CPU 사용률, RAM 사용량, 디스크 잔여 용량, 업타임(서버가 켜져 있던 시간) 표시

- `/temp` (온도 확인)
  - 라즈베리파이 CPU 온도 확인
  - 예: `🌡️ 현재 온도: 45°C`

- `/ip` (네트워크 정보)
  - 현재 할당된 공인 IP 출력

- `/lsp` (ls_projects)
  - `/home/jsb/Github/` 폴더 목록 출력

- `/lss` (ls_services)
  - 현재 실행 중인 주요 서비스 상태 목록 출력
  - 항목 예시: `🟢(실행중) / 🔴(오류) / pid / URL(port)`
  - 포트 탐지 방식: `lsof` LISTEN 전체 목록과 `readlink /proc/<pid>/cwd` 디렉토리 매칭

- `/ps`
  - `ps aux | grep node | grep -v vscode | grep -v grep` 실행 결과 출력

- `/run [번호 or 프로젝트명]`
  - 해당 프로젝트 실행
  - 프로젝트 유형별로 `npm run dev` 또는 `npm start` 실행
  - 실행 직후 PID/PORT를 함께 표시
  - 포트가 감지되면 `http://<localIP>:<port>` 바로가기 버튼 제공

- `/stop [번호 or 프로젝트명 or all]`
  - 해당 프로젝트 프로세스 종료
  - `all` 입력 시 관리 중인 프로젝트 전체 종료

- `/log [줄 수]`
  - 디스코드 봇의 최근 로그 확인

- `/error`
  - 디스코드 봇의 최근 에러 로그(`error.log`) 확인

## 보안 정책

- `.env`에 기재된 디스코드 사용자 ID 화이트리스트 사용
- 화이트리스트에 미포함된 사용자는 일부 명령만 사용 가능
  - 예: 조회성 명령만 허용, 실행/중지 계열 명령 제한

## 권장 권한 레벨(예시)

- **Guest**: `/help`, `/status`, `/temp`, `/ip`, `/lsp`, `/lss`, `/ps`, `/log`, `/error`
- **Admin(화이트리스트)**: 모든 명령 + 실행/중지/배포/재부팅

## 실행/로그 운영 메모 (PM2)

```bash
pm2 start dist/index.js \
  --name discord-bot \
  --output /home/jsb/Discord/output.log \
  --error /home/jsb/Discord/error.log

pm2 save
pm2 startup
pm2 list
```

- `/log` 는 `output.log` 최근 N줄(기본 20, 최대 50) 확인
- `/error` 는 `error.log` 최근 20줄 확인

## .env 설정

```env
DISCORD_TOKEN=봇_토큰
CLIENT_ID=봇_애플리케이션_ID
ADMIN_IDS=디스코드_유저ID1,디스코드_유저ID2
```

| 키 | 설명 |
|---|---|
| `DISCORD_TOKEN` | 디스코드 봇 토큰 |
| `CLIENT_ID` | [Discord Developer Portal](https://discord.com/developers/applications) → 앱 → General → Application ID |
| `ADMIN_IDS` | 관리자 디스코드 유저 ID (쉼표 구분, 여러 명 가능) |
