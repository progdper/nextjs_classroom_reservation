# DB 지침

Prisma, Supabase PostgreSQL, 모델·쿼리·데이터 권한·마이그레이션 작업에 적용한다.
공통 승인 규칙과 작업 흐름은 [AGENTS.md](../AGENTS.md)를 따른다.

## 현재 구성 확인

- `prisma/schema.prisma`, `prisma.config.ts`, `src/lib/db.ts`, `src/lib/env.ts`와 의존성 버전을 먼저 확인한다.
- 실제 환경 파일 전체를 출력하지 않는다. `.env.example`의 변수명과 필요한 설정 여부부터 확인한다.
- 앱은 `DATABASE_URL`, Prisma CLI는 `DIRECT_URL`을 사용한다. 실제 코드에서 이 구성이 유지되는지 확인한다.
- 앱은 Supabase Transaction pooler, CLI·마이그레이션은 적합한 Direct 또는 Session pooler 연결을 사용한다.
- 드라이버, TLS, 연결 풀 설정은 Prisma 버전과 Supabase·실행 환경에 맞게 검토한다.

## 모델과 쿼리

- 기본 `User` 모델은 UUID id, 고유 email, 선택 name, 생성·수정 시각을 갖는 앱 모델이다.
- `User`는 Supabase `auth.users`와 별개이며 로그인·인증 사용자 연결이 구현되어 있다고 가정하지 않는다.
- 모델 변경이 기존 데이터, 고유 제약, null 값, 인덱스와 관계에 미치는 영향을 먼저 설명한다.
- 테이블 삭제·컬럼 삭제·타입 변경·필수 컬럼 추가·고유 제약 추가는 기존 데이터의 영향을 확인한다.
- Prisma의 관리 대상에 Supabase `auth`, `storage` 스키마를 임의로 추가하지 않는다.
- Prisma Client는 `src/generated_prisma/`에 생성한다. 생성 코드를 직접 수정하지 않는다.
- 서버에서 `src/lib/db.ts`의 클라이언트를 재사용하고 요청마다 새 연결 풀을 만들거나 disconnect하지 않는다.
- 쿼리는 필요한 필드만 선택하고 목록의 조회 범위를 제한한다.
- 여러 변경이 하나의 작업이어야 하면 트랜잭션 필요성을 검토한다.
- 동적 SQL 문자열 연결을 피하고 사용자 입력은 검증한다.

## 날짜·시간과 KST 처리

사용자에게 설명할 때는 [사용자용 UTC·KST 안내](../docs/SUPABASE_SETUP.md#날짜시간과-한국-시간kst)를 참고한다. 아래 기준은 구현·검증 지침이며, 지침 추가 자체를 현재 앱의 KST 기능 구현 완료로 설명하지 않는다.

- Prisma가 UTC만 지원하여 KST를 사용할 수 없다고 설명하지 않는다. Prisma의 DateTime·JavaScript Date 처리와 DB 저장 타입, 화면 표시·업무 시간대를 구분한다.
- 생성·수정 시각처럼 특정 순간을 나타내는 값은 UTC 기준으로 일관되게 저장·전달하고, 한국 시간 표시는 Asia/Seoul을 명시한다. API의 시각 문자열에는 Z 또는 오프셋을 포함해 해석 기준을 분명히 한다.
- KST로 표시하려고 저장 값에 임의로 9시간을 더하지 않는다. 같은 순간을 유지한 채 표시 시간대를 변환한다.
- 입력 시각에는 시간대 또는 UTC 오프셋을 명시하고 검증한다. 시간대 없는 문자열을 서버의 기본 시간대로 임의 해석하지 않는다. 사용자가 한국 현지 시각을 입력하는 기능은 Asia/Seoul 기준임을 정하고 변환한다.
- 한국 시간 기준 일별 조회·통계는 KST의 시작·종료 경계를 UTC 시각으로 변환해 시작 이상·다음 날 시작 미만으로 조회한다. UTC 날짜를 잘라 한국 날짜로 취급하지 않는다.
- 생일·영업일처럼 날짜만 필요한 값은 특정 순간을 나타내는 시각 데이터와 구분해 설계한다. 날짜 전용 값에 불필요한 시간대 변환을 적용하지 않는다.
- 서버·DB의 기본 시간대 변경만으로 KST 처리가 완료됐다고 판단하지 않는다. Windows·Linux·Vercel에서 같은 시각이 같은 한국 날짜·시간으로 표시·조회되는지 확인한다.
- PostgreSQL의 timestamp와 timestamptz 차이를 검토한다. timestamptz는 특정 순간을 UTC로 저장하며 원래의 시간대 이름을 보존하지 않는다. 원래 시간대가 업무상 필요하면 별도 필드 등으로 관리한다.
- 기본 DateTime 컬럼에 시간대 정보가 있다고 가정하지 않는다. 기존 컬럼 변경 시 저장된 값이 UTC인지 KST 현지 시각인지 먼저 확인하고, 변환 영향과 수정안을 제시한다. 스키마·마이그레이션 변경은 승인 후 수행한다.
- 날짜 경계 검증에는 KST 자정 전후, UTC와 KST의 날짜가 다른 시각, 월말·연말을 포함한다. 실제 환경에서 실행하지 않은 검증은 완료했다고 기록하지 않는다.

참고: [Prisma DateTime](https://www.prisma.io/docs/orm/v7/prisma-client/special-fields-and-types#working-with-datetime), [PostgreSQL 날짜·시간 타입](https://www.postgresql.org/docs/current/datatype-datetime.html).

## 인증과 권한

- Supabase Auth의 사용자 세션이 Prisma 연결에 자동 전달되지 않는다는 점을 전제로 한다.
- 연결 역할에 따라 RLS를 우회할 수 있으므로 서버에서 사용자·소유권·역할을 검사한다.
- 브라우저 Data API를 사용할 테이블에는 RLS·권한 정책을 별도로 검토한다.
- DB만 사용할 때는 불필요한 Data API 노출을 제한한다.
- 비밀번호·토큰 저장 또는 인증 연동은 별도 설계와 승인 없이 추가하지 않는다.

## 마이그레이션

- 스키마 파일 변경, 클라이언트 생성, 마이그레이션 생성, DB 적용을 각각 구분해 설명한다.
- 모델 수정 승인을 마이그레이션 생성·실행 승인으로 해석하지 않는다.
- 명령을 실행하기 전에 개발·Preview·운영 중 대상 환경을 확인한다. 비밀 URL은 출력하지 않는다.
- `npm run db:migrate:dev`는 파일을 만들고 개발 DB도 변경한다. 생성만 하는 작업으로 설명하지 않는다.
- 개발 마이그레이션에서 shadow DB 권한 오류가 발생하면 원인을 확인하고 필요한 설정을 제안한다.
- 운영에 `migrate dev`, `migrate reset`, `db push`를 실행하지 않는다.
- 운영 반영은 검토된 이력과 별도 승인을 바탕으로 `npm run db:migrate:deploy`를 사용한다.
- Supabase SQL Editor에서 같은 테이블을 임의 변경해 Prisma 이력과 어긋나게 만들지 않는다.
- 파괴적 변경은 백업·복구와 기존 코드 호환성을 먼저 검토한다.

## 검증

- `npm run db:validate`는 문법 검사이며 실제 DB 연결·권한·쿼리 검증이 아니다.
- 실제 접속 확인에는 `npm run db:check`를 사용한다. 앱의 SELECT 1과 Prisma CLI의 읽기 전용 스키마 조회만 수행하며 비밀값을 출력하지 않는다. 마이그레이션·쓰기 검증을 대신하지 않는다.
- 승인된 경우 `npm run db:generate`로 클라이언트를 생성하고 타입·빌드를 확인한다.
- 실제 접속·CRUD 검증은 승인된 개발 DB와 테스트 데이터로 수행하고 운영 데이터를 사용하지 않는다.
- DB에 적용하지 않았다면 그 사실과 사용자가 추가로 해야 할 작업을 명확히 알린다.
