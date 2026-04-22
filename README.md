# obnofi-cli

obnofi 워크스페이스와 상호 작용하기 위한 커맨드 라인 인터페이스(CLI)입니다.

## 설치

```bash
npm install -g obnofi-cli
```

## 사용법

```bash
obnofi <command> [options]
```

## 명령어

### `auth` - 인증 관리

- **`obnofi auth login`**: 브라우저를 통해 OAuth로 로그인하고 토큰을 붙여넣습니다.
  - `--token <token>`: 토큰을 직접 입력합니다.
  - `--url <url>`: 자체 호스팅 서버 주소를 지정합니다.
- **`obnofi auth logout`**: 로그아웃합니다.
- **`obnofi auth whoami`**: 현재 로그인된 계정 정보(이메일, 플랜)를 확인합니다.

### `note` - 노트 관리

- **`obnofi note ls`**: 최근 노트 20개를 목록으로 보여줍니다.
  - `--search <keyword>`: 제목으로 노트를 검색합니다.
  - `-n, --limit <number>`: 표시할 노트 개수를 지정합니다. (기본값: 20)
- **`obnofi note new <title>`**: 새로운 노트를 생성하고 ID를 출력합니다.
  - `--open`: 노트를 생성한 후 바로 브라우저에서 엽니다.
- **`obnofi note cat <id>`**: 노트의 마크다운 내용을 터미널에 출력합니다.
- **`obnofi note edit <id>`**: 기본 편집기($EDITOR)로 노트를 수정하고 저장합니다.
- **`obnofi note delete <id>`**: 노트를 삭제합니다.
  - `-y`: 확인 프롬프트 없이 바로 삭제합니다.

### `db` - 데이터베이스 다이어그램 관리

- **`obnofi db ls`**: 데이터베이스 다이어그램 블록 목록을 보여줍니다.
- **`obnofi db push <file.sql> <page-id>`**: 로컬 SQL 파일을 obnofi ERD 블록으로 업로드합니다.
  - `--merge`: 기존 스키마를 덮어쓰지 않고 병합합니다.
- **`obnofi db pull <page-id>`**: obnofi ERD를 SQL DDL 형식으로 터미널에 출력합니다.
  - `-o, --output <file.sql>`: 결과를 파일로 저장합니다.
- **`obnofi db diff <file.sql> <page-id>`**: 로컬 SQL 파일과 obnofi ERD 간의 차이점을 비교하여 보여줍니다.

### `feed` - 피드 관리

- **`obnofi feed ls`**: 구독 중인 피드 소스 목록을 보여줍니다.
- **`obnofi feed read`**: 모든 소스에서 최신 피드 항목 10개를 가져와 보여줍니다.
  - `--source <source>`: 특정 소스의 피드만 필터링합니다.
  - `-n, --limit <number>`: 표시할 피드 항목 수를 지정합니다. (기본값: 10)

## 설정

로그인 정보 및 설정은 `~/.config/obnofi-cli` 경로에 저장됩니다.

