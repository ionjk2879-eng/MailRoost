# 분류 메일함 / 스누즈가 항상 빈 목록으로 보이던 문제

**날짜**: 2026-08-13
**증상**: 자동분류 규칙으로 특정 발신자(pixiv) 메일을 "Fanbox" 분류 메일함으로 보내도록 설정했는데, 사이드바 안 읽음 배지에는 숫자가 뜨는데 정작 Fanbox 메일함을 열면 "메일이 없습니다"만 표시됨.

## 근본 원인

`backend/src/lib/mailOrg.ts`의 내부 키 생성 방식이 오래전부터 깨져 있었다.

```ts
// 고치기 전
const KEY_DELIMITER = ""   // 주석은 "제어문자를 쓴다"고 되어 있었지만 실제로는 빈 문자열

export function assignmentKey(accountId: string, mailId: string): string {
  return `${accountId}${KEY_DELIMITER}${mailId}`   // 사실상 accountId + mailId 그냥 이어붙이기
}

export function parseAssignmentKey(key: string) {
  const idx = key.indexOf(KEY_DELIMITER)   // "".indexOf("")는 항상 0
  if (idx === -1) return null
  return { accountId: key.slice(0, idx), mailId: key.slice(idx + 1) }
}
```

`"아무문자열".indexOf("")`는 JS에서 **항상 0**을 반환한다. 그래서 `parseAssignmentKey`는 어떤 키를 넣어도 `accountId: ""`, `mailId: 원래키에서 첫 글자만 뺀 나머지`로 잘못 쪼갰다.

- `assignmentKey`로 키를 **쓸 때**는 문제가 없었다 — 같은 함수로 같은 입력을 넣어 직접 키를 재구성해서 조회(`org.assignments[assignmentKey(accountId, mailId)]`)하는 곳은 delimiter가 뭐든 상관없이 항상 자기 자신과 일치하기 때문.
- 문제는 키를 거꾸로 **분해해야 하는** 두 곳:
  - `GET /api/folders/:id/mail` — "이 분류 메일함에 배정된 키들"을 훑어서 계정별로 그룹핑해야 실제 메일 서버에서 내용을 가져올 수 있는데, accountId가 항상 `""`로 나오니 `accountMap[""]`가 존재할 리 없어 조용히 빈 배열을 반환.
  - `GET /api/snooze` — 내부 키를 프론트가 쓰는 `"accountId||mailId"` 형식으로 변환하는 과정에서 마찬가지로 accountId가 날아가, 프론트의 `snoozeKey()` 조회와 절대 매칭되지 않음 (스누즈된 메일이 받은편지함에서 안 사라지고, 스누즈 목록도 항상 비어 보였을 것).

두 경로 모두 예외를 던지지 않고 그냥 빈 결과를 돌려줬기 때문에 (`catch` 블록도 안 타고, 애초에 계정 매핑 단계에서 조용히 스킵) 로그에도 에러가 안 남아서 원인 파악이 오래 걸렸다.

## 왜 발견이 오래 걸렸는지

1. 처음엔 "규칙이 새로 도착한 메일에만 적용되고 기존 메일엔 소급 적용 안 된다"는 **진짜지만 다른** 제약으로 오인 — 그래서 기존 메일 백필 기능부터 만들었다.
2. 백필도 화면에 로드된 메일만 훑는 방식이라 범위가 좁았던 **두 번째, 역시 진짜인 문제**가 있어서 서버 사이드 검색으로 백필하는 기능을 다시 만들었다.
3. 그 다음에야 `wrangler tail`로 실제 배포 서버 로그를 떠서 `/api/folders/:id/mail` 요청에 진단 로그를 임시로 추가해보고서야 `idsByAccount`의 accountId가 전부 빈 문자열로 찍히는 걸 보고 진짜 원인을 특정했다.
4. KV에 저장된 실제 데이터(`wrangler kv key get`)를 직접 열어서 33개의 배정이 이미 정상적으로 존재한다는 것, 그리고 그중 2개는 아주 예전 버전(진짜 제어문자를 구분자로 쓰던 시절)에 만들어진 키라 U+0001 문자가 껴 있다는 것까지 확인했다.

## 수정

- `assignmentKey`는 그대로 둠 (이미 저장된 모든 키가 이 형식이라 바꾸면 마이그레이션이 필요해짐).
- `parseAssignmentKey`가 구분자에 의존하지 않고, **현재 연결된 계정 id 목록과 접두사(prefix) 대조**로 accountId/mailId를 되돌리도록 변경. 가장 길게 일치하는 계정을 선택해 `imap:host:email`처럼 콜론을 포함한 accountId와도 충돌 없이 동작.
- 옛날 형식으로 남아있는 키(U+0001이 낀 것)를 위해 `mailId.charCodeAt(0) === 1`이면 한 글자 걷어내는 하위호환 처리 추가.
- `/api/folders/:id/mail`, `GET /api/snooze` 두 호출부 모두 계정 목록을 넘기도록 수정.

커밋: `f2b280e`, `5ed1da4`

## 재발 방지

- 문자열 리터럴에 눈에 안 보이는 제어문자를 직접 박아넣는 방식은 절대 쓰지 않는다 (`charCodeAt`/`String.fromCharCode` 등 명시적인 방법 사용). 자세한 내용은 [`CLAUDE.md`](../../CLAUDE.md) 참고.
- 이런 "조용히 빈 결과를 반환"하는 버그는 에러 로그로 못 잡는다. 다음엔 의심되는 API에 임시 진단 로그부터 추가하고 `wrangler tail`로 실제 배포 요청을 관찰하는 걸 더 빨리 시도할 것.
