## 기술 스택
- 언어: Node.js (TypeScript 없이 순수 JS)
- 파일 확장자 .ts → .js
- tsconfig.json 불필요
- package.json에 build 스크립트 불필요
- bin: { "obnofi": "index.js" }
- index.js 상단에 #!/usr/bin/env node 추가


---

```
# obnofi CLI 구현

## 프로젝트 컨텍스트
- obnofi: Next.js 14 + Fastify 기반 올인원 워크스페이스 앱
- 백엔드: Fastify + PostgreSQL + Prisma + NextAuth.js
- 이 CLI는 obnofi 웹앱의 API를 호출하는 별도 npm 패키지

---

## 목표
`obnofi` 라는 CLI 툴을 TypeScript로 구현한다.
npm으로 전역 설치 후 터미널에서 obnofi 워크스페이스를 제어할 수 있어야 한다.

```bash
npm install -g obnofi-cli
obnofi auth login
obnofi note ls
obnofi db push schema.sql
```

---

## 기술 스택

| 패키지 | 용도 |
|--------|------|
| commander | CLI 커맨드 파싱 |
| axios | HTTP API 호출 |
| chalk | 터미널 색상 출력 |
| ora | 스피너 (로딩 인디케이터) |
| inquirer | 인터랙티브 프롬프트 |
| conf | 로그인 토큰 로컬 저장 (~/.config/obnofi-cli) |
| open | 브라우저 자동 오픈 (OAuth 로그인) |

TypeScript + CommonJS, `tsconfig.json` 포함

---

## 파일 구조

```
obnofi-cli/
├── src/
│   ├── index.ts               # 진입점, program 정의, preAction 훅 (미로그인 차단)
│   ├── config.ts              # Conf 인스턴스, createApiClient() (axios + 401 핸들러)
│   └── commands/
│       ├── auth.ts            # auth login / logout / whoami
│       ├── note.ts            # note ls / new / cat / edit / delete
│       ├── db.ts              # db ls / push / pull / diff
│       └── feed.ts            # feed ls / read
├── package.json               # bin: { obnofi: dist/index.js }
└── tsconfig.json
```

---

## 커맨드 명세

### auth

```bash
obnofi auth login                   # 브라우저 열어서 OAuth → 토큰 붙여넣기
obnofi auth login --token <token>   # 토큰 직접 입력
obnofi auth login --url <url>       # 자체 호스팅 서버 주소 지정
obnofi auth logout
obnofi auth whoami                  # 현재 계정 이메일 + 플랜 출력
```

**login 플로우:**
1. `${baseUrl}/cli-auth` 를 브라우저로 오픈
2. inquirer password 프롬프트로 토큰 입력 받기
3. `GET /auth/me` 호출해서 토큰 유효성 검증
4. 성공 시 conf에 token, email, userId 저장

---

### note

```bash
obnofi note ls                      # 최근 20개 목록 (번호 + 제목 + 수정일 + ID)
obnofi note ls --search "키워드"    # 제목 검색
obnofi note ls -n 50                # 개수 지정
obnofi note new "제목"              # 새 노트 생성 후 ID 출력
obnofi note new "제목" --open       # 생성 후 브라우저에서 열기
obnofi note cat <id>                # 마크다운 내용 터미널 출력
obnofi note edit <id>               # $EDITOR(기본 vi)로 편집 후 자동 저장
obnofi note delete <id>             # 삭제 (confirm 프롬프트)
obnofi note delete <id> -y          # 확인 없이 삭제
```

**edit 구현 방식:**
1. `GET /notes/:id` 로 내용 가져오기
2. `/tmp/obnofi-{id}.md` 에 `# {title}\n\n{content}` 형식으로 저장
3. `execSync(`${EDITOR} /tmp/...`)` 로 에디터 열기
4. 저장 후 파일 읽어서 첫 줄 = title, 나머지 = content 로 파싱
5. `PATCH /notes/:id` 로 업데이트
6. 임시 파일 삭제

---

### db (핵심 기능)

```bash
obnofi db ls                              # DB 다이어그램 블록 목록
obnofi db push <file.sql> <page-id>       # 로컬 SQL → obnofi ERD 블록 업로드
obnofi db push <file.sql> <page-id> --merge  # 기존 스키마와 병합 (덮어쓰지 않음)
obnofi db pull <page-id>                  # obnofi ERD → 터미널 출력
obnofi db pull <page-id> -o schema.sql    # obnofi ERD → 파일로 저장
obnofi db diff <file.sql> <page-id>       # 로컬 vs obnofi ERD 차이 출력
```

**push 구현:**
1. 로컬 `.sql` 파일 읽기
2. `POST /blocks/db-diagram/:pageId/sql` 에 sql 문자열 전송
3. 서버가 파싱 후 ERD 노드 업데이트
4. 응답으로 테이블 수 / 컬럼 수 출력

**pull 구현:**
1. `GET /blocks/db-diagram/:pageId/sql` 호출
2. 서버가 현재 ERD 상태를 MySQL DDL로 직렬화해서 반환
3. `-o` 옵션 있으면 파일 저장, 없으면 stdout 출력

**diff 구현:**
1. 로컬 파일 읽기
2. pull로 remote SQL 가져오기
3. 라인 기준 추가(+)/삭제(-) 표시 (git diff 스타일)
    - 빨간색: 로컬에만 있음 (remote에서 삭제됨)
    - 초록색: remote에만 있음 (로컬에 없음)

---

### feed

```bash
obnofi feed ls                      # 구독 중인 소스 목록
obnofi feed read                    # 최신 피드 10개 출력
obnofi feed read --source velog     # 특정 소스만
obnofi feed read -n 20              # 개수 지정
```

**read 출력 형식:**
```
[Velog] 제목이 여기 들어가요
        https://velog.io/@... · 2시간 전
```

---

## config.ts 구현 상세

```typescript
// conf 스키마
interface ConfigSchema {
  token: string
  baseUrl: string   // 기본값: 'https://api.obnofi.app'
  userId: string
  email: string
}

// createApiClient()
// - baseURL, Authorization Bearer 헤더 자동 주입
// - 401 응답 시: "토큰이 만료됐어요. obnofi auth login" 출력 후 process.exit(1)
```

---

## index.ts preAction 훅

```typescript
// auth login / logout 은 토큰 없어도 실행 가능
// 나머지 커맨드는 token 없으면:
// "✗ 로그인이 필요해요. obnofi auth login" 출력 후 exit(1)
```

---

## 출력 스타일 가이드

- 성공: `chalk.green('✓')` + 메시지
- 실패: `chalk.red('✗')` + 메시지
- 로딩: `ora('...중...').start()` → `.succeed()` / `.fail()`
- ID, 날짜 등 부가정보: `chalk.dim()`
- 제목, 강조: `chalk.bold()`
- API URL 등: `chalk.cyan()`

---

## 구현 순서

1. `package.json` + `tsconfig.json` 세팅
2. `src/config.ts` — Conf + createApiClient
3. `src/commands/auth.ts`
4. `src/commands/note.ts`
5. `src/commands/db.ts`
6. `src/commands/feed.ts`
7. `src/index.ts` — program 조합 + preAction
8. Fastify 백엔드 라우트 추가 (위 엔드포인트 목록)
9. `npm run build` 후 `npm link` 로 로컬 테스트
```