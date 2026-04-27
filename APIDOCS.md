# obnofi API Documentation

현재 구현된 백엔드 API 명세서입니다. 이 문서는 `apps/web/app/api/**`와 `apps/ws-server/src/index.ts`의 실제 구현만 기준으로 작성했습니다.

## Runtime

- Web API: `http://localhost:3000/api/*`
- Public share API: `http://localhost:3000/api/public/*`
- NextAuth handler: `http://localhost:3000/api/auth/*`
- WebSocket server: `ws://localhost:3001/ws`

## 현재 상태

- 대부분의 HTTP API는 `apps/web`의 Next.js Route Handler로 구현되어 있습니다.
- 데이터 저장은 현재 Prisma를 통해 이뤄집니다.
- 응답 래핑이 일관되지 않습니다. 일부는 배열/객체를 그대로 반환하고, 일부는 `{ success: true }` 또는 `{ error: "..." }`를 반환합니다.
- 라우트 단위 인증/인가 검사는 아직 문서상 공통 규약으로 통일되어 있지 않습니다. 실제 접근 제어는 호출 위치와 세션 흐름을 함께 확인해야 합니다.

## 공통 에러 응답

```json
{
  "error": "Error message"
}
```

자주 쓰이는 상태 코드는 다음과 같습니다.

| 코드 | 의미 |
|---|---|
| `200` | 성공 |
| `201` | 생성 성공 |
| `400` | 잘못된 요청 |
| `401` | 비밀번호 검증 실패 등 인증 실패 |
| `404` | 리소스를 찾을 수 없음 |
| `500` | 서버 처리 실패 |

## 인증 (Authentication)

API는 두 가지 인증 방식을 지원합니다.

| 방식 | 대상 | 헤더 |
|---|---|---|
| NextAuth 세션 (쿠키) | 웹 브라우저 | 자동 (쿠키) |
| Bearer 토큰 | CLI / 외부 클라이언트 | `Authorization: Bearer obnofi_<token>` |

CLI는 항상 `Authorization: Bearer <token>` 헤더를 사용합니다. 토큰은 웹 UI 또는 `POST /api/cli-tokens`로 발급합니다.

### `GET|POST /api/auth/[...nextauth]`

NextAuth 핸들러입니다. 상세 인증 플로우는 `apps/web/lib/auth` 설정을 따릅니다.

### `POST /api/cli-tokens`

새 CLI 토큰을 발급합니다. **웹 세션 필수.**

요청 본문:

```json
{ "name": "my-laptop" }
```

성공 응답 (`201`):

```json
{
  "id": "token_id",
  "name": "my-laptop",
  "createdAt": "2026-04-28T00:00:00.000Z",
  "token": "obnofi_<64-hex>"
}
```

`token` 필드는 이 응답에서만 반환됩니다.

### `GET /api/cli-tokens`

현재 유저의 활성 토큰 목록 조회. **웹 세션 필수.**

### `DELETE /api/cli-tokens/[tokenId]`

토큰 폐기. **웹 세션 필수.**

## Pages

페이지 타입은 소문자 문자열을 사용합니다.

- `document`
- `canvas`
- `database`

대표 `Page` 응답 shape:

```json
{
  "id": "page_id",
  "title": "Untitled",
  "content": {},
  "type": "document",
  "icon": null,
  "coverImage": null,
  "parentId": null,
  "workspaceId": "workspace_id",
  "createdAt": "2026-04-27T00:00:00.000Z",
  "updatedAt": "2026-04-27T00:00:00.000Z",
  "isPublic": false,
  "shareId": null,
  "sharePassword": null,
  "databaseId": null,
  "parentDatabaseId": null
}
```

### `GET /api/pages`

워크스페이스의 최상위 페이지 목록을 조회합니다.

쿼리 파라미터:

| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `workspaceId` | `string` | 아니오 | 워크스페이스 ID. 생략 시 로그인 유저의 기본 workspace 자동 선택. |

동작:

- `workspaceId`가 없으면 서버가 로그인 유저의 첫 번째 OWNER workspace → 첫 번째 멤버 workspace 순으로 자동 선택합니다.
- 접근 가능한 workspace가 없으면 `404`를 반환합니다.
- `parentDatabaseId: null` 조건으로 조회하므로 데이터베이스 row 페이지는 제외됩니다.
- `updatedAt desc` 정렬입니다.

성공 응답:

```json
[
  {
    "id": "page_id",
    "title": "Project",
    "type": "document",
    "workspaceId": "workspace_id"
  }
]
```

### `POST /api/pages`

새 페이지를 생성합니다.

요청 본문:

```json
{
  "title": "New page",
  "type": "document",
  "parentId": "optional_parent_page_id",
  "workspaceId": "optional_workspace_id"
}
```

검증:

- `title`, `type` 필수
- `workspaceId` 생략 시 로그인 유저의 기본 workspace 자동 선택
- `type`은 `document | canvas | database`

특이사항:

- `document`는 기본 TipTap 문서 본문이 생성됩니다.
- `database`는 Page 생성과 함께 Database, 기본 Property들, 기본 `Table` View까지 트랜잭션으로 생성됩니다.

성공 응답:

- 일반 페이지: `Page` 객체
- 데이터베이스 페이지: `databaseId`가 포함된 `Page` 객체

### `GET /api/pages/[pageId]`

페이지 1개를 조회합니다.

성공 응답:

- 기본: `Page` 객체
- `?view=full` 사용 시:
  - 해당 페이지가 database 페이지여야 함
  - 응답에 `database` 전체 객체가 포함됨

`view=full` 응답 예시:

```json
{
  "id": "page_id",
  "title": "Tasks",
  "type": "database",
  "databaseId": "database_id",
  "database": {
    "id": "database_id",
    "pageId": "page_id",
    "properties": [],
    "columns": [],
    "rows": [],
    "views": []
  }
}
```

### `PATCH /api/pages/[pageId]`

페이지를 부분 수정합니다.

지원 필드:

```json
{
  "title": "optional",
  "content": {},
  "icon": "🌱",
  "coverImage": "https://... or data:image/...",
  "parentId": "optional_parent_id_or_null",
  "isPublic": true
}
```

성공 응답:

- 수정된 `Page` 객체

### `DELETE /api/pages/[pageId]`

페이지를 삭제합니다.

성공 응답:

```json
{
  "success": true
}
```

### `GET /api/pages/[pageId]/ancestors`

페이지의 조상 목록을 브레드크럼 순서로 반환합니다.

성공 응답:

```json
[
  {
    "id": "ancestor_page_id",
    "title": "Parent",
    "icon": null
  }
]
```

### `PATCH /api/pages/[pageId]/share`

공유 상태를 변경합니다.

요청 본문:

```json
{
  "isPublic": true,
  "password": "optional password"
}
```

동작:

- `isPublic: true`일 때 `shareId`가 없으면 새로 생성
- `password`가 있으면 bcrypt 해시로 저장
- `isPublic: false`일 때 `shareId`, `sharePassword` 제거

성공 응답:

```json
{
  "success": true,
  "shareId": "share_token_or_null",
  "isPublic": true
}
```

## Public Share

### `GET /api/public/pages/[shareId]`

공개 공유 페이지를 조회합니다.

동작:

- `isPublic: true`이면서 `shareId`가 일치하는 페이지를 조회
- 비밀번호가 걸린 경우 콘텐츠는 반환하지 않음
- 공개 콘텐츠는 `sanitizePublicContent`를 거쳐 workspace 내부 링크를 정리한 뒤 반환

비밀번호 보호 페이지 응답:

```json
{
  "id": "page_id",
  "title": "Shared page",
  "content": null,
  "isPasswordProtected": true,
  "createdAt": "2026-04-27T00:00:00.000Z",
  "updatedAt": "2026-04-27T00:00:00.000Z"
}
```

비밀번호 없는 페이지 응답:

```json
{
  "id": "page_id",
  "title": "Shared page",
  "content": {},
  "isPasswordProtected": false,
  "createdAt": "2026-04-27T00:00:00.000Z",
  "updatedAt": "2026-04-27T00:00:00.000Z"
}
```

### `POST /api/public/pages/[shareId]/verify`

비밀번호 보호된 공유 페이지의 비밀번호를 검증합니다.

요청 본문:

```json
{
  "password": "plain_text_password"
}
```

동작:

- 비밀번호가 없는 페이지라면 즉시 콘텐츠를 반환
- 비밀번호가 있으면 bcrypt 비교 후 성공 시 콘텐츠를 반환

실패 응답:

```json
{
  "error": "Invalid password"
}
```

상태 코드는 `401`입니다.

## Databases

`Database` 응답 shape:

```json
{
  "id": "database_id",
  "pageId": "page_id",
  "properties": [],
  "columns": [],
  "rows": [],
  "views": []
}
```

주의:

- `columns`는 `properties`의 레거시 alias입니다.
- row는 별도 모델이 아니라 `parentDatabaseId`가 설정된 `Page`입니다.

### `POST /api/databases`

기존 페이지를 데이터베이스로 초기화합니다.

요청 본문:

```json
{
  "pageId": "page_id"
}
```

동작:

- 해당 `pageId`가 존재해야 함
- 이미 Database가 붙어 있으면 기존 Database를 그대로 반환
- 없으면 Database, 기본 Property들, 기본 `Table` View를 생성

성공 응답:

- `Database` 객체

### `GET /api/databases/[databaseId]`

데이터베이스 상세를 조회합니다.

포함 항목:

- `properties` 오름차순
- `views` 오름차순
- `rows`와 각 row의 `propertyValues`

성공 응답:

- `Database` 객체

### `DELETE /api/databases/[databaseId]`

데이터베이스를 삭제합니다.

성공 응답:

```json
{
  "success": true
}
```

주의:

- 실제 구현은 `Database` 레코드만 삭제합니다.
- `Page`까지 함께 삭제한다는 보장은 현재 구현에 없습니다.

### `GET /api/databases/[databaseId]/page`

해당 데이터베이스에 연결된 page의 최소 정보를 반환합니다.

성공 응답:

```json
{
  "id": "page_id",
  "title": "Database Page",
  "type": "database"
}
```

### `POST /api/databases/[databaseId]/rows`

새 row를 생성합니다.

요청 본문:

```json
{
  "title": "Untitled"
}
```

동작:

- row는 `type: "DOCUMENT"`인 Page로 생성
- `parentId`는 database page ID
- `parentDatabaseId`는 database ID
- 현재 database의 모든 Property에 대한 기본 `PropertyValue`도 함께 생성

성공 응답:

```json
{
  "id": "row_page_id",
  "title": "Untitled",
  "type": "document",
  "parentDatabaseId": "database_id",
  "propertyValues": [
    {
      "id": "pv_id",
      "pageId": "row_page_id",
      "propertyId": "property_id",
      "columnId": "property_id",
      "value": {}
    }
  ]
}
```

### `POST /api/databases/[databaseId]/columns`

새 Property를 추가합니다.

요청 본문:

```json
{
  "name": "Status",
  "type": "status",
  "options": [
    { "id": "todo", "label": "To do", "color": "gray" }
  ]
}
```

지원 타입:

- `text`
- `number`
- `select`
- `multi_select`
- `status`
- `date`
- `person`
- `checkbox`
- `url`
- `email`
- `phone`
- `files`
- `relation`
- `rollup`
- `formula`
- `created_time`
- `created_by`
- `last_edited_time`
- `last_edited_by`

동작:

- `name`, `type` 필수
- 기존 row가 있으면 각 row에 기본 `PropertyValue`도 생성

성공 응답:

```json
{
  "id": "property_id",
  "databaseId": "database_id",
  "name": "Status",
  "type": "status",
  "options": [],
  "order": 0
}
```

### `GET /api/databases/[databaseId]/views`

데이터베이스의 View 목록을 조회합니다.

성공 응답:

```json
[
  {
    "id": "view_id",
    "databaseId": "database_id",
    "name": "Table",
    "type": "table",
    "config": {
      "visibleProperties": [],
      "propertyWidths": {},
      "sorts": [],
      "filters": []
    },
    "createdAt": "2026-04-27T00:00:00.000Z",
    "updatedAt": "2026-04-27T00:00:00.000Z"
  }
]
```

### `POST /api/databases/[databaseId]/views`

새 View를 생성합니다.

요청 본문:

```json
{
  "name": "Board",
  "type": "board",
  "config": {
    "visibleProperties": ["property_id"],
    "propertyWidths": {},
    "sorts": [],
    "filters": []
  }
}
```

동작:

- `name`이 없으면 `New ${Type}` 형식으로 생성
- `config`가 없으면 현재 Property 목록을 기준으로 기본 config 자동 생성

성공 응답:

- `View` 객체

### `GET /api/databases/search`

워크스페이스의 데이터베이스 페이지를 검색합니다.

쿼리 파라미터:

| 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `workspaceId` | `string` | 아니오 | 워크스페이스 ID. 생략 시 로그인 유저의 기본 workspace 자동 선택. |
| `q` | `string` | 아니오 | 제목 검색어 |

성공 응답:

```json
[
  {
    "id": "page_id",
    "title": "Tasks",
    "icon": null,
    "databaseId": "database_id"
  }
]
```

## Columns Legacy API

아래 엔드포인트는 레거시 naming을 유지합니다. `columnId`는 실제로 `Property.id`입니다.

### `POST /api/columns`

새 Property를 생성합니다.

요청 본문:

```json
{
  "databaseId": "database_id",
  "name": "Priority",
  "type": "select",
  "options": [
    { "id": "high", "label": "High", "color": "red" }
  ]
}
```

지원 타입은 현재 구현상 다음으로 제한됩니다.

- `text`
- `number`
- `select`
- `multi_select`
- `date`
- `person`
- `checkbox`
- `url`
- `email`

성공 응답:

- `Property` 객체

### `PATCH /api/columns/[columnId]`

Property를 수정합니다.

요청 본문:

```json
{
  "name": "optional",
  "type": "optional",
  "options": [],
  "order": 1
}
```

성공 응답:

- 수정된 `Property` 객체

### `DELETE /api/columns/[columnId]`

Property를 삭제합니다.

성공 응답:

```json
{
  "success": true
}
```

## Property Values

`columnId`는 레거시 alias이고 실제 의미는 `propertyId`입니다.

대표 `PropertyValue` 응답 shape:

```json
{
  "id": "pv_id",
  "pageId": "page_id",
  "propertyId": "property_id",
  "columnId": "property_id",
  "value": {}
}
```

### `POST /api/property-values`

PropertyValue를 upsert합니다. 성공 시 상태 코드는 `201`입니다.

요청 본문:

```json
{
  "pageId": "page_id",
  "columnId": "property_id",
  "value": {}
}
```

검증:

- `pageId`, `columnId`, `value` 필수
- page와 property 존재 여부 확인

성공 응답:

- `PropertyValue` 객체

### `PUT /api/property-values`

PropertyValue를 upsert합니다. `POST`와 거의 동일하지만 성공 상태 코드는 `200`입니다.

요청 본문:

```json
{
  "pageId": "page_id",
  "columnId": "property_id",
  "value": {}
}
```

성공 응답:

- `PropertyValue` 객체

### `PATCH /api/property-values/[propertyValueId]`

기존 PropertyValue를 수정합니다.

요청 본문:

```json
{
  "value": {}
}
```

성공 응답:

- 수정된 `PropertyValue` 객체

### `DELETE /api/property-values/[propertyValueId]`

PropertyValue를 삭제합니다.

성공 응답:

```json
{
  "success": true
}
```

## AI

### `POST /api/ai/generate`

AI 텍스트 생성 스트림 API입니다.

요청 본문:

```json
{
  "prompt": "string",
  "context": "optional string",
  "command": "summarize"
}
```

지원 `command`:

- `summarize`
- `translate`
- `continue`
- `improve`
- `shorter`
- `longer`
- `explain`
- `code`

동작:

- `prompt`, `command` 필수
- 모델은 현재 `gpt-4o-mini`
- `streamText(...).toTextStreamResponse()`를 그대로 반환

실패 응답:

```json
{
  "error": "Failed to generate response"
}
```

## WebSocket

### `GET ws://localhost:3001/ws`

`apps/ws-server`의 WebSocket 엔드포인트입니다.

현재 구현 상태:

- 연결 수립 가능
- 클라이언트 메시지를 수신하면 서버 로그에 `Received message`를 남김
- Yjs import는 있으나 문서 동기화 로직은 아직 구현되지 않음

즉, 엔드포인트는 열려 있지만 협업 프로토콜 자체는 아직 초안 단계입니다.
