# Vercel 배포하기

로컬에서 확인한 Next.js 앱을 인터넷에 공개하는 안내입니다. 이 문서는 Vercel 프로젝트 연결, 배포 환경 변수, 인증서 포함, 운영 마이그레이션 순서와 배포 후 검증을 다룹니다.

앱 설치·실행은 [시작 안내](SETUP.md), Supabase 프로젝트 생성·CA 다운로드·로컬 .env·개발 테이블 생성은 [Supabase DB 설정과 연결하기](SUPABASE_SETUP.md)를 먼저 확인하세요. DB가 없는 기본 화면만 배포한다면 Supabase 설정은 생략할 수 있습니다.

## 1. 배포 전 로컬 확인

package.json이 있는 프로젝트 폴더에서 실행합니다.

```bash
npm run check
npm run build
```

DB 기능이 있다면 [로컬 연결과 읽기·쓰기 확인](SUPABASE_SETUP.md#8-로컬-앱-연결과-읽기쓰기-확인)까지 마친 뒤 진행하세요. 기본 첫 화면은 DB를 사용하지 않으므로 첫 화면이나 빌드 성공만으로 DB 기능을 검증할 수 없습니다.

배포할 GitHub 저장소에는 실제 .env를 올리지 않습니다. .env.example과 공개 CA 파일은 유지합니다.

## 2. Vercel 프로젝트 연결과 빌드 설정

1. 내 프로젝트의 GitHub 저장소를 Vercel에서 가져옵니다.
2. Framework Preset은 **Next.js**, Node.js는 **24**를 선택합니다.
3. Root Directory는 package.json이 있는 실제 프로젝트 위치로 설정합니다. 저장소 루트가 프로젝트라면 기본값을 사용하고, 상위 폴더까지 저장했다면 해당 하위 폴더를 지정합니다. 폴더 이름을 고정값으로 가정하지 마세요.
4. Install Command는 **npm ci**, Build Command는 **npm run check && npm run build**로 설정합니다.
5. 설정을 저장하고 다음 환경 변수·DB 준비 사항을 확인한 뒤 배포합니다.

기존 Vercel 프로젝트는 **Settings → Build and Deployment → Build Command**에서 명령을 지정합니다. 화면에 Override 선택이 있으면 켜고 입력하세요. 설정 변경은 다음 배포부터 반영됩니다. [Vercel 빌드 설정 공식 안내](https://vercel.com/docs/builds/configure-a-build#build-command)

npm run check가 실패하면 && 뒤의 빌드는 실행되지 않습니다. 실패한 단계는 해당 배포 화면의 빌드 로그에서 확인하세요. npm run build 자체는 Prisma Client 생성과 Next.js 빌드를 수행하며, 마이그레이션은 실행하지 않습니다.

GitHub Actions는 필요할 때만 [선택 안내서](GITHUB_ACTIONS.md)를 따라 추가합니다. 기본 배포 과정에 필수인 기능은 아닙니다.

## 3. Vercel 환경 변수와 DB 구분

**로컬 .env는 Vercel에 자동 등록되지 않습니다.** Vercel 프로젝트의 환경 변수 설정에서 필요한 값을 직접 등록하고 적용할 환경을 선택합니다.

| 항목         | 배포 시 설정                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| DATABASE_URL | DB 기능이 있는 앱의 실행용 연결 주소입니다. 해당 배포 환경의 Supabase Transaction pooler 주소와 올바른 DB 비밀번호를 사용합니다. |
| DIRECT_URL   | 별도 마이그레이션 작업에 사용하는 주소입니다. 앱 실행만을 위해 등록할 필요는 없습니다.                                           |
| Development  | 로컬 개발용 환경입니다.                                                                                                          |
| Preview      | 배포 전 확인용 환경입니다. 운영 DB와 분리된 DB를 사용합니다.                                                                     |
| Production   | 실제 서비스 환경입니다. 운영 DB·권한·필요한 테이블을 별도로 준비합니다.                                                          |

연결 주소의 선택·비밀번호 URL 인코딩 방법은 [Supabase 연결 주소 안내](SUPABASE_SETUP.md#4-두-가지-db-연결-주소-확인)를 참고하세요. 환경별로 어떤 DB에 연결되는지 확인하고, DB 비밀번호·연결 주소에 NEXT*PUBLIC*를 붙이지 마세요. 함수 리전은 DB와 가까운 곳으로 검토합니다.

환경 변수를 바꿨다면 새로 배포해 적용 여부를 확인합니다. NEXT*PUBLIC* 값은 브라우저에 공개되며 빌드 시 반영되는 특성이 있습니다.

## 배포할 인증서 파일

certs/supabase-ca.crt는 공개 CA이므로 Git 저장소에 포함합니다. next.config.ts의 outputFileTracingIncludes가 이 파일을 서버 함수 배포 추적 대상에 포함합니다. 개인 PC의 인증서 경로나 인증서 원문을 Vercel 환경 변수로 등록할 필요는 없습니다.

- 인증서 다운로드·내용 확인·교체는 [Supabase의 CA 준비 절차](SUPABASE_SETUP.md#3-ca-인증서-다운로드와-저장)에서 관리합니다.
- 인증서 파일을 교체했다면 GitHub에 변경을 반영하고 해당 파일을 포함해 다시 배포합니다.
- 파일 포함 설정만으로 배포 환경에서의 TLS 연결이 검증되지는 않습니다. 배포 후 실제 DB 기능을 확인하세요.

## 운영 마이그레이션 적용 시점

이 단계는 **실제 대상 DB를 변경합니다.** DB 기능이 없거나 적용할 마이그레이션이 없다면 실행하지 않습니다. 개발용 마이그레이션 생성·shadow DB 설정은 [Supabase 개발 테이블 생성 절차](SUPABASE_SETUP.md#7-2-개발-db에-users-테이블-생성)에서 확인하세요.

1. 개발 DB에서 만든 마이그레이션 이력과 변경 내용을 검토합니다. User 모델 파일만 있다고 운영 테이블이 생기는 것은 아닙니다.
2. 배포 대상 환경, 마이그레이션 실행 환경의 DIRECT_URL, 공개 CA 파일을 확인합니다. 운영 값이 로컬 개발 설정과 섞이지 않도록 합니다.
3. 백업·기존 앱과의 호환성·복구 방법을 확인하고 DB 변경 승인을 받습니다.
4. 승인된 실행 환경에서 검토한 마이그레이션을 적용합니다.

```bash
npm run db:migrate:deploy
```

새 코드가 새 테이블·컬럼을 필요로 한다면 사용 가능하도록 DB 준비와 코드 배포 순서를 조정합니다. 운영에는 migrate dev·migrate reset·db push를 실행하지 않습니다. 모든 Vercel 빌드에 마이그레이션을 자동 연결하지 않으며, 코드 롤백이 DB 스키마나 데이터를 복구한다고 가정하지 않습니다.

## 4. 배포 후 기능 확인

1. Vercel 배포 주소에서 첫 화면이 열리는지 확인합니다.
2. DB 기능을 추가했다면 승인된 대상·확인용 데이터로 읽기·쓰기를 검증합니다. Preview와 Production 결과는 구분합니다.
3. 오류가 생기면 빌드 실패와 실행 중 오류를 구분해 Vercel의 해당 로그를 확인합니다. 비밀번호·DB URL·개인정보는 공유하지 않습니다.
4. 검증이 끝나면 확인용 데이터를 정리하고 실제 수행한 범위만 기록합니다.
5. README의 기존 양식을 유지하면서 실제 배포 주소를 작성합니다.

npm run db:check는 실행한 로컬 환경의 연결 점검입니다. Vercel 배포 주소의 DB 읽기·쓰기 성공을 대신하지 않습니다. 현재 기본 화면에는 DB 조회·수정 기능이 없으므로 배포 환경의 DB 검증이 필요하면 확인용 코드의 범위와 제거 계획을 먼저 정해야 합니다.

## 현재 배포 검증 상태

이 보일러플레이트는 실제 Vercel 배포와 배포 주소에서의 DB 읽기·쓰기를 아직 검증하지 않았습니다. 설정 안내와 파일 포함 구성이 준비된 상태이며, 각 프로젝트에서 실제 배포 후 확인해야 합니다.

Windows 로컬의 연결·인증서 검증 결과는 [로컬 DB 검증 상태](SUPABASE_SETUP.md#로컬-db-검증-상태)를 참고하세요. 로컬 연결 성공을 Vercel 배포 성공으로 기록하지 않습니다.

Codex에 배포를 맡길 때는 대상 프로젝트와 Preview·Production 중 어느 환경인지 알려주세요. 계획·검증 결과를 확인한 뒤 배포와 DB 변경을 각각 승인합니다. [Codex 사용 안내](CODEX_GUIDE.md)

## 참고 자료

- [Vercel 빌드 설정](https://vercel.com/docs/builds/configure-a-build)
- [Vercel 환경 변수](https://vercel.com/docs/environment-variables)
- [설치와 실행](SETUP.md)
- [Supabase DB 설정과 연결](SUPABASE_SETUP.md)
