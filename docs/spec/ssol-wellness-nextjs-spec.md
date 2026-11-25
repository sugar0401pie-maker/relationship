# 쏠 웰니스 하우스 — 디저트 유형 테스트 Next.js 이관 스펙

> 이 문서는 Claude Code(또는 OpenAI Codex)에 그대로 붙여넣어 작업을 시작할 수 있도록 작성되었습니다.
> 원본은 단일 HTML 파일로 만든 정적 프로토타입이며, 모든 화면 흐름·채점 로직·카피는 이미 검증되었습니다.
> 이번 작업의 목표는 **그 프로토타입을 동일하게 Next.js 프로젝트로 옮기는 것**입니다. 디자인이나 문구를 새로 만들 필요는 없고, 아래 내용을 그대로 재현해주세요.

---

## 0. 작업 범위 (중요)

**이번 단계(1단계)에서 할 일:**
- 프로토타입의 모든 화면·문구·로직을 Next.js 컴포넌트로 그대로 이식
- 결제, 소셜 로그인, AI 리포트 생성, 실제 데이터 저장은 **목업(mock)으로 유지** — 버튼을 누르면 지금 프로토타입과 동일하게 토스트 메시지만 뜨면 됩니다.
- 목업으로 남겨둔 자리에는 반드시 `// TODO: 2단계에서 실제 연동` 주석을 남겨주세요. (Supabase 연동, 토스페이먼츠 연동, 카카오/네이버 로그인, Claude API 리포트 생성 등은 2단계 별도 작업입니다.)

**이번 단계에서 하지 않을 일:**
- Supabase 프로젝트 생성/연동
- 토스페이먼츠 실제 결제 연동
- 카카오/네이버 실제 OAuth 연동
- Claude API를 이용한 실제 AI 리포트 생성

---

## 1. 기술 스택

- **Next.js 14+ (App Router)**, TypeScript
- 스타일링: Tailwind CSS 권장 (아래 CSS 변수를 `tailwind.config`의 색상 토큰으로 그대로 옮기면 됩니다). 팀이 더 익숙한 방식이 있다면 CSS Modules도 무방합니다.
- 상태 관리: 별도 라이브러리 없이 React `useState`로 충분한 규모입니다. 단, 화면 전환은 SPA의 `hidden` 클래스 토글 방식이 아니라 **Next.js 라우팅(App Router의 페이지 단위)** 또는 최소한 하나의 클라이언트 컴포넌트 내 상태값(`step`)으로 재구성해주세요. 아래 "5. 화면 구조"에서 라우팅 제안을 참고하세요.
- 이미지: `next/image` 사용, `/public/images` 아래 배치

---

## 2. 이미지 자산

첨부된 `ssol-wellness-images.zip`을 압축 해제하면 아래 구조가 나옵니다. 그대로 프로젝트의 `/public/images`에 넣어주세요.

```
images/
├── hero/
│   ├── hero-intro.jpg         (1페이지 상단 배너 — 타이틀 그래픽 포함)
│   └── hero-onboarding.jpg    (2페이지 상단 배너)
├── icons/                     (궁합 카드용 캐릭터 아이콘 10종, PNG)
│   ├── icon-macaron.png ... icon-castella.png
├── profiles/                  (결과 화면 대표 이미지 10종, JPG — 배경 있는 일러스트)
│   ├── profile-macaron.jpg ... profile-castella.jpg
└── manifest.json              (파일별 alt 텍스트 + 유형 키 매핑)
```

10개 유형과 `type_key`(macaron, creambun 등) 매핑은 `manifest.json`과 아래 "6. 데이터 모델"의 `TYPES` 객체의 `icon` 필드를 참고하세요. `icons/`는 궁합 카드(베스트프렌드·상극)에, `profiles/`는 결과 화면 메인 이미지에 사용됩니다.

---

## 3. 디자인 시스템

### 색상 (CSS 변수 그대로 이식)
```css
:root{
  --navy:#D9748A; --navy-soft:#96562F; --sky:#F6D9B8; --sky-bg:#FFF7EC;
  --white:#FFFFFF; --ink:#4A2C2A; --text2:#8A6F5C; --text3:#8F7059; --border:#F0DFC8;
}
```
- `--navy`: 포인트 색(버튼, 유형 이름, 큰 헤드라인)
- `--ink`: 본문 읽기용 진한 텍스트 (가독성 위해 별도 분리됨 — 절대 --navy를 본문 텍스트에 쓰지 말 것)
- `--sky-bg`: 전체 배경, 카드 대비용 크림색
- `--text2`/`--text3`: 보조 텍스트, 순서대로 더 연함

### 폰트
```html
<link href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Noto+Sans+KR:wght@400;500&display=swap" rel="stylesheet">
```
- **Gaegu**: 유형 이름(예: "밀푀유", "슈크림빵")에만 사용 — 궁합 카드의 유형 이름 포함
- **Noto Sans KR**: 그 외 모든 텍스트 (본문, 버튼, 라벨, 질문 등)
- 이 규칙은 반드시 지켜주세요 — 이전에 전체를 귀여운 폰트로 썼다가 가독성 문제로 되돌린 이력이 있습니다.

### UI 톤
- 카드: 모서리 22~24px, 은은한 배경(`--sky-bg`) 위에 흰 카드
- 버튼: pill 형태(border-radius 20px), 기본은 `--navy` 배경의 꽉 찬 버튼, 보조 버튼은 outline
- 전체적으로 파스텔 톤, 아이콘/이모지 사용에 거부감 없음

---

## 4. 세계관 & 톤앤매너

- 테마: **"티파티에 초대받은 내가 디저트?!"** — 중세시대 '쏠월드'의 한 저택에서 눈뜬 공주/왕자/공작(응답자가 온보딩에서 성별 선택: 여→공주, 남→왕자, 선택 안 함→공작)이 성향에 따라 디저트로 몸이 바뀌었다는 설정
- 어투: 기본은 담백한 존댓말("~입니다/~습니다"). 온보딩 서사 부분만 살짝 이야기하듯("~해요") 써도 되지만 전체적으로 과하게 예스러운 말투("~하오", "~소")는 쓰지 않습니다.
- 결과 화면 문구는 반드시 `"{이름} {호칭}님은 {유형이름} 유형입니다."` 한 줄 형식을 지켜주세요.

---

## 5. 화면 구조 (총 8개)

SPA 프로토타입에서는 하나의 HTML 안에서 `div.hidden` 클래스 토글로 화면을 전환했습니다. Next.js에서는 아래처럼 구성하는 걸 제안합니다 (경로는 예시이며 팀 컨벤션에 맞게 바꿔도 됩니다):

| # | 이름 | 제안 경로 | 설명 |
|---|---|---|---|
| 1 | 인트로 | `/` | 히어로 이미지 + 참여자 수 + "테스트 하기" 버튼만 |
| 2 | 온보딩 | `/start` | 히어로 이미지, 세계관 소개, 이름·성별 입력, 테스트 안내(3개 불릿) |
| 3 | 퀴즈 | `/quiz` | 20문항, 5점 리커트, 진행률 바 |
| 4 | 결과 | `/result` | 프로필 이미지, 유형 한 줄 소개, 레이더 차트, 특징, 궁합 카드, CTA |
| 5 | 심층 리포트 미리보기 | `/result/report` | 7개 항목 잠금 미리보기 + 3,500원 결제 CTA |
| 6 | 계정 만들기 선택 | `/signup` | 카카오/네이버/이메일 3가지 옵션 |
| 7 | 이메일 회원가입 폼 | `/signup/email` | 이름·연락처·인증번호·비밀번호 |
| 8 | 공유 시트 | (모달, 별도 경로 아님) | 결과 화면 위에 뜨는 바텀시트 |

퀴즈 응답, 계산된 도메인 점수, 선택된 유형, 이름/성별은 화면 간 이동 시 유지되어야 하므로 React Context(`QuizContext`) 하나로 묶어서 관리하는 걸 권장합니다. (2단계에서 Supabase 연동 시 이 Context 값을 그대로 저장 요청 바디에 실어 보내면 됩니다.)

### 화면별 상세 동작

**1. 인트로**
- 요소는 딱 3개만: 히어로 이미지(`hero-intro.jpg`, 전체 폭), "🍰 벌써 1,000명 넘게 참여했어요" 텍스트, "테스트 하기" 버튼(이미지 하단에 크림색 그라데이션 스크림과 함께 겹쳐서 배치)
- 버튼 클릭 → 온보딩으로 이동

**2. 온보딩**
- 히어로 이미지(`hero-onboarding.jpg`) 상단 전체 폭
- 킥커: "티파티에 초대받은 내가 디저트?!"
- 제목: "나는 어떤 디저트인지 알아봐요"
- 서사 문단 1개 (세계관 소개)
- 이름 입력 필드 (필수)
- 성별 선택 3버튼: 공주 / 왕자 / 공작 (필수, 단일 선택)
- 안내 불릿 3개:
  1. "테스트 시작하기를 누르면 약 3분간 20개의 질문을 풀게됩니다. 전문 심리상담사가 만든 자기이해 도구로, 의료적 진단이나 심리 치료를 대신하지 않고 질병, 장애여부 등을 판단하지 않습니다."
  2. "각각의 질문은 너무 오래 생각하지 마시고 직관적으로 전혀 아니다 - 매우 그렇다를 선택해주세요."
  3. "로그인 없이 바로 시작할 수 있으며, 응답은 저장되지 않습니다. 필요시 신규 계정을 만들어서 저장해주세요."
- "테스트 진행하기" 버튼 — 이름 미입력 또는 성별 미선택 시 인라인 에러 메시지, 통과 시 퀴즈로 이동

**3. 퀴즈**
- 진행률 바 + "질문 {n} / 20 · {이름} {호칭}님은" 텍스트
- 질문 텍스트 (아래 `QUESTIONS` 데이터 참고)
- 5점 리커트 버튼 세로 목록: 전혀 아니다 / 아니다 / 보통이다 / 그렇다 / 매우 그렇다
- 응답 선택 시 약 300ms 후 자동으로 다음 질문 (또는 결과 계산)으로 이동
- 20문항 종료 시 "6. 채점 로직" 실행 → 결과 화면으로 이동

**4. 결과**
- 대표 이미지(`profiles/profile-{icon}.jpg`)를 카드 폭에 꽉 차게(가장자리까지) 배치
- 한 줄 문구: `"{이름} {호칭}님은 "` + (귀여운 폰트로) `{유형이름}` + `" 유형입니다."`
- 성향 한 줄(글머리 기호 포함): `type.code`
- 레이더 차트 (아래 "7. 레이더 차트" 참고) — 흰 배경에 얇은 테두리로 감싸서 본문과 분리, 점에 마우스를 올리면 "{도메인명}: {점수}점" 툴팁
- 본문 설명: `type.blurb`
- "{이름} {호칭}님은 이런 사람일거에요" + 특징 리스트(`type.traits`, 불릿 5개)
- "이런 유형과 함께라면" + 베스트 프렌드 / 상극 카드 2개 (아이콘 이미지 + 유형 이름 + 짧은 설명)
- CTA 박스: "{이름} {호칭}님의 이야기, 더 자세하게 알아봐요" + "심층 리포트와 1주일 AI 채팅권으로, 오늘 이 이야기를 실제 대화로 이어가 보세요." + "심층 리포트 보기" 버튼 → 5번 화면
- "내 결과 공유하기" 버튼 → 공유 시트(8번) 오픈
- "결과 저장하기" 버튼 → 6번 화면(계정 만들기)
- "다시 해보기" 버튼 → 모든 상태 초기화 후 인트로로

**5. 심층 리포트 미리보기**
- 뒤로가기 버튼
- 제목: "{유형이름}의 웰니스 이야기"
- 7개 항목을 **닫힌 카드**로 나열 (탭하면 "🔒 이 항목은 결제 후 열려요" 토스트만 뜨고 펼쳐지지 않음):
  1. 당신의 웰니스 프로파일 — 5개 영역 점수를 심층 해석으로 다시 살펴봐요
  2. 주목할 만한 부분은 — 지금 이 패턴이 왜 나타나는지, 응답을 근거로 짚어드려요
  3. 그동안 어떻게 살아왔을까 — 지금의 당신을 만든 두 갈래의 이야기
  4. 주변 사람들은 당신을 이렇게 봐요 — 타인의 시선과 스스로 느끼는 것의 간극
  5. 일과 관계 속에서는 — 실제 장면처럼 구체적으로 풀어드려요
  6. 앞으로 추구하는 바 — 이 유형이 궁극적으로 향하는 가치
  7. 이번 주, 조금 더 편안해지기 — 지금 해볼 수 있는 작은 행동 + 1주일 AI 채팅권
- 하단 고정 CTA: "전체 리포트 + 1주일 AI 채팅권 / 3,500원 / 3,500원 결제하고 전체 보기" 버튼 → (1단계에서는) "결제 기능은 프로토타입 단계예요" 토스트만

**6. 계정 만들기 선택**
- "카카오톡 아이디로 가입 및 로그인하기" (카카오 브랜드 옐로우 `#FEE500`)
- "네이버 아이디로 가입하기" (네이버 그린 `#03C75A`)
- "계정 만들어서 가입하기" → 7번 화면
- 카카오/네이버는 1단계에서는 "준비 중" 토스트만

**7. 이메일 회원가입 폼**
- 이름, 휴대폰 번호 또는 이메일, "인증번호 받기" 버튼(누르면 인증번호 입력칸 노출 — 1단계에서는 실제 발송 없이 토스트만), 비밀번호, "가입 완료" 버튼
- 유효성 검사: 필수 항목 미입력 시 인라인 에러

**8. 공유 시트 (모달)**
- 하단에서 올라오는 바텀시트, 배경 어둡게 딤 처리
- 6개 옵션 (3열 그리드, 원형 아이콘 + 라벨):
  - 카카오톡 (`#FEE500`) — 1단계: 링크 클립보드 복사 + 안내 토스트
  - 링크 복사 — 클립보드 복사 (실제 동작)
  - 네이버 블로그 (`#03C75A`) — `https://share.naver.com/web/shareView?url=...&title=...` 새 창
  - 트위터(X) — `https://twitter.com/intent/tweet?text=...&url=...` 새 창
  - 인스타그램 — 쏠 웰니스 하우스 공식 계정 링크로 이동 (실제 채널 주소로 교체 필요)
  - 유튜브 — 쏠 웰니스 하우스 공식 채널 링크로 이동 (실제 채널 주소로 교체 필요)

---

## 6. 데이터 모델 (그대로 포팅)

아래 데이터는 이미 검증된 최종본입니다. 문항 문구, 유형 이름/설명/특징은 **한 글자도 바꾸지 말고 그대로** TypeScript 데이터 파일로 옮겨주세요.

### 문항 (20개) — `d`: 도메인, `s`: 성향(F=직면/E=회피), `t`: 문항 텍스트
```js
const QUESTIONS = [
  {d:'relate', s:'F', t:'고민이 있는 관계에는 내가 먼저 연락해서 풀어보려고 한다'},
  {d:'relate', s:'F', t:'새로운 사람을 만나는 자리가 생기면 먼저 다가가서 인사를 건네는 편이다'},
  {d:'relate', s:'E', t:'혼자 있는 게 편하다고 말하지만, 사실 먼저 다가가는 게 어렵다'},
  {d:'relate', s:'E', t:'연락이 뜸해진 관계는 자연스럽게 정리되도록 그냥 둔다'},
  {d:'worth', s:'F', t:'내가 부족하다고 느끼는 부분이 있으면 바로 채우려고 노력한다'},
  {d:'worth', s:'F', t:'남들과 비교될 때, 내가 무엇을 더 해야 할지 구체적으로 생각해본다'},
  {d:'worth', s:'E', t:'비교당할 만한 상황은 웬만하면 피하려고 한다'},
  {d:'worth', s:'E', t:'인정받지 못해도 괜찮은 척 넘기는 편이다'},
  {d:'control', s:'F', t:'불확실한 상황일수록 미리 계획을 세워두려고 한다'},
  {d:'control', s:'F', t:'예상치 못한 변화가 생기면 바로 대안을 찾기 시작한다'},
  {d:'control', s:'E', t:'미래에 대한 생각은 웬만하면 미루는 편이다'},
  {d:'control', s:'E', t:'계획 없이 흘러가는 대로 두는 게 오히려 편하다'},
  {d:'happy', s:'F', t:'즐거운 순간이 생기면 그 감정을 충분히 느끼고 음미하려 한다'},
  {d:'happy', s:'F', t:'성취한 일이 있으면 스스로 축하하는 시간을 따로 갖는 편이다'},
  {d:'happy', s:'E', t:'좋은 일이 있어도 금방 다음 할 일로 넘어가서 여운을 느낄 새가 없다'},
  {d:'happy', s:'E', t:'목표를 이뤄도 기쁨보다 허탈함이 먼저 드는 경우가 많다'},
  {d:'meaning', s:'F', t:'지금 가는 방향이 맞는지 헷갈릴 때, 적극적으로 답을 찾아 나선다'},
  {d:'meaning', s:'F', t:'선택의 기로에 서면 스스로 기준을 세워 결정하려고 한다'},
  {d:'meaning', s:'E', t:'답을 찾는 게 부담스러워서 일단 하던 대로 지낸다'},
  {d:'meaning', s:'E', t:'중요한 결정은 "나중에 생각하지 뭐" 하며 미루는 편이다'}
];
```

### 도메인
```js
const DOMAIN_ORDER = ['relate','worth','control','happy','meaning'];
const DOMAINS = {
  relate: '관계·소속',
  worth: '자기가치·인정',
  control: '통제·미래',
  happy: '행복',
  meaning: '의미·방향'
};
const DOMAINS_SHORT = {
  relate: '관계',
  worth: '자기가치',
  control: '통제',
  happy: '행복',
  meaning: '의미'
};
```

### 리커트 라벨
```js
const LIKERT_LABELS = ['전혀 아니다','아니다','보통이다','그렇다','매우 그렇다'];
```

### 호칭 매핑
```js
const GENDER_TITLE = {female:'공주', male:'왕자', none:'공작'};
```

### 유형 데이터 (10종) — `code`: 성향 한 줄, `name`: 유형 이름, `icon`: 이미지 파일 키, `blurb`: 본문 설명, `traits`: 특징 5개
```js
const TYPES = {
  relate_F:  {code:'상큼하고 발랄하게, 먼저 다가가는 성향', name:'딸기마카롱', icon:'macaron',
    blurb:'당신은 관계 속에서 먼저 손을 내미는 사람입니다. 갈등이 생겨도 피하지 않고 대화로 풀어가려 하고, 새로운 사람 앞에서도 자연스럽게 먼저 다가갑니다. 그 적극성 덕분에 주변에서 늘 든든한 사람으로 여겨지곤 해요. 다만 가끔은, 혼자 남겨지는 것에 대한 불안이 그 부지런함 뒤에 숨어 있진 않은지 살펴봐도 좋겠어요.',
    traits:['관계에서 먼저 다가가는 편', '갈등은 대화로 빨리 풀려고 함', '새로운 사람과도 쉽게 친해짐', '혼자보다 함께 있는 게 편함', '연락이 뜸해지면 불안해짐']},
  relate_E:  {code:'담백한 겉과 달리 속은 부드럽고 여린 성향', name:'슈크림빵', icon:'creambun',
    blurb:'당신은 혼자만의 시간에서 편안함을 느끼는 사람입니다. 관계에서 먼저 다가가기보다 상대가 다가와주길 기다리는 편이고, 그래서 종종 쿨하다는 인상을 줍니다. 하지만 그 안에는 관계에 대한 조용한 갈망도 함께 자리하고 있어요. 편안한 거리감과 솔직한 마음 사이에서 균형을 찾아가는 연습이 도움이 될 수 있어요.',
    traits:['혼자만의 시간이 편함', '관계는 상대가 먼저 다가오길 기다림', '감정 표현이 서툰 편', '갈등 상황은 조용히 피함', '마음을 여는 데 시간이 걸림']},
  worth_F:   {code:'겹겹이 쌓아올리며 스스로를 채워가는 성향', name:'밀푀유', icon:'millefeuille',
    blurb:'당신은 부족함을 느끼는 순간 즉시 채우려고 움직이는 사람입니다. 자격증이든 프로젝트든 끊임없이 스스로를 성장시켜가는 힘이 뚜렷합니다. 그 힘이 지금의 당신을 만든 가장 큰 자산이기도 해요. 다만 이만하면 충분하다고 스스로에게 말해주는 순간이 얼마나 있었는지도 함께 돌아보면 좋겠어요.',
    traits:['부족함을 느끼면 바로 채우려 함', '목표 지향적이고 성장에 진심', '스스로에게 기준이 높은 편', '성취해도 다음 목표부터 생각함', '인정받는 것에 예민한 편']},
  worth_E:   {code:'겉은 바삭하고 예쁘지만 쉽게 부서지는 성향', name:'머랭쿠키', icon:'meringue',
    blurb:'당신은 비교당하는 상황을 자연스럽게 피하며, 힘든 티를 잘 내지 않는 사람입니다. 겉으로는 늘 안정적이고 밝아 보이지만, 속으로는 자주 스스로를 의심하고 있을 수 있습니다. 괜찮은 척 넘기는 습관이 당신을 지켜온 방식이었을 거예요. 이제는 그 서운함을 아주 조금씩이라도 꺼내보는 연습을 시작해봐도 좋겠어요.',
    traits:['비교되는 상황을 피하는 편', '힘든 티를 잘 내지 않음', '겉으로는 밝고 안정적으로 보임', '서운함을 마음에 담아두는 편', '인정보다 무난함을 택함']},
  control_F: {code:'층층이 정교하게 쌓아 완성하는, 계획적인 성향', name:'티라미수', icon:'tiramisu',
    blurb:'당신은 불확실한 상황일수록 계획을 세워 스스로 통제감을 만들어내는 사람입니다. 미리 준비하고 대비하는 힘이 뛰어나서, 주변에서 믿음직스럽다는 말을 자주 들을 겁니다. 그런데 계획대로 되지 않는 순간, 유독 크게 흔들리고 있진 않으신가요? 통제할 수 없는 것과 함께 지내는 연습도 필요한 시점일 수 있어요.',
    traits:['미리 계획 세우는 걸 좋아함', '변화가 생기면 바로 대안을 찾음', '준비성이 철저한 편', '예상 밖의 상황에 스트레스 받음', '체계적인 걸 선호함']},
  control_E: {code:'부드럽게 흘러가는 대로 두는, 여유로운 성향', name:'카라멜푸딩', icon:'pudding',
    blurb:'당신은 서두르지 않고 흘러가는 대로 두는 걸 편안해하는 사람입니다. 유연하고 스트레스를 덜 받는 편이지만, 중요한 결정도 함께 미뤄지는 경향이 있습니다. 마감이 코앞에 닥쳐야 움직이게 되는 패턴, 익숙하신가요? 미루고 있는 것들 중 무엇이 진짜 부담인지 한 번쯤 들여다볼 때예요.',
    traits:['계획보다 흐름에 맡기는 편', '결정은 마감 직전에 내림', '미래 얘기를 미루는 경향', '스트레스를 비교적 덜 받는 편', '즉흥적인 상황을 편하게 여김']},
  happy_F:   {code:'층층이 좋은 순간을 쌓아 음미하는 성향', name:'요거트파르페', icon:'parfait',
    blurb:'당신은 좋은 순간을 그냥 흘려보내지 않고 의식적으로 붙잡아두는 사람입니다. 작은 성취에도 스스로를 축하할 줄 알고, 그 감각이 삶을 꾸준히 채워주고 있습니다. 주변 사람들에게도 긍정적인 에너지를 자연스럽게 전하는 편이에요. 다만 항상 밝은 모습만 보여주려다, 스스로의 지친 순간을 뒤늦게 알아차리고 있진 않은지도 살펴보면 좋겠어요.',
    traits:['좋은 순간을 오래 음미함', '작은 성취도 스스로 축하함', '긍정적인 에너지가 자연스러움', '감사한 마음을 자주 느낌', '분위기를 밝게 만드는 편']},
  happy_E:   {code:'진하고 강하게, 멈추지 않고 나아가는 성향', name:'에스프레소브라우니', icon:'brownie',
    blurb:'당신은 몸의 신호를 무시하고서라도 계속 밀어붙이는 힘이 강한 사람입니다. 책임감이 강해서 웬만해선 힘든 티를 내지 않고 앞으로 나아갑니다. 그 추진력 덕분에 많은 걸 이뤄왔을 거예요. 다만 많은 걸 해냈는데 정작 행복하지 않다는 감각이 자주 든다면, 잠깐 멈춰서 그 순간을 누리는 연습이 필요할 수 있어요.',
    traits:['성취해도 금방 다음으로 넘어감', '힘든 것도 티 내지 않고 밀어붙임', '책임감이 강한 편', '잠깐 멈추는 게 어려운 편', '목표 지향적이고 추진력 있음']},
  meaning_F: {code:'겹겹이 새로운 결을 만들며 나아가는, 탐색하는 성향', name:'피스타치오크루아상', icon:'croissant',
    blurb:'당신은 방향이 흐릿하게 느껴질 때 가만히 있지 못하고 적극적으로 답을 찾아 나서는 사람입니다. 새로운 도전을 두려워하지 않는 호기심이 큰 자산입니다. 그 탐색의 힘 덕분에 계속 성장해왔을 거예요. 다만 다음 스텝을 찾는 데 몰두하다, 지금 이 순간에 충분히 머무르지 못하고 있진 않은지 한번 짚어보면 좋겠어요.',
    traits:['새로운 도전을 두려워하지 않음', '방향이 흐릿하면 바로 답을 찾음', '호기심이 많고 성장 지향적', '익숙한 것에 쉽게 지루함을 느낌', '다음 단계를 계속 고민함']},
  meaning_E: {code:'부들부들하고 무난하게, 안정을 추구하는 성향', name:'카스텔라', icon:'castella',
    blurb:'당신은 익숙하고 안정적인 선택을 지키는 걸 편안해하는 사람입니다. 갈등을 크게 만들지 않고, 무던하게 상황을 받아들이는 힘이 있습니다. 그 안정감이 당신과 주변 모두를 편안하게 만들어줘요. 다만 중요한 결정을 계속 나중으로 미루다, 정작 원하는 방향을 놓치고 있진 않은지 살펴볼 시점일 수 있어요.',
    traits:['익숙하고 안정적인 선택 선호', '큰 결정은 미루는 편', '갈등을 크게 만들지 않음', '무난함 속에서 편안함을 느낌', '변화보다 지속을 택함']}
};

```

### 궁합 계산용 성장 순환
```js
const GROWTH_CYCLE = ["control", "relate", "worth", "meaning", "happy"];
```

---

## 7. 채점 & 궁합 로직 (그대로 포팅)

```js
function nextDomainInCycle(domain){
  const i = GROWTH_CYCLE.indexOf(domain);
  return GROWTH_CYCLE[(i + 1) % GROWTH_CYCLE.length];
}

function getBestMatchKey(typeKey){
  const [domain, style] = typeKey.split("_");
  return nextDomainInCycle(domain) + "_" + style;
}

function getWorstMatchKey(typeKey){
  const [domain, style] = typeKey.split("_");
  return domain + "_" + (style === "F" ? "E" : "F");
}
```

전체 흐름 참고용 (기존 프로토타입의 `finishQuiz` 함수 — 20문항 응답을 받아 도메인별 합산 → 최고 점수 도메인을 주 도메인으로 → 해당 도메인 내 F/E 합산 비교로 성향 결정 → `TYPES[도메인_성향]`으로 최종 유형 결정):
```js
function finishQuiz(){
  document.getElementById('progressBar').style.width = '100%';
  const domainScores = {relate:0, worth:0, control:0, happy:0, meaning:0};
  const domainF = {relate:0, worth:0, control:0, happy:0, meaning:0};
  const domainE = {relate:0, worth:0, control:0, happy:0, meaning:0};
  let totalF = 0, totalE = 0;

  QUESTIONS.forEach((q, i) => {
    const v = answers[i] || 3;
    domainScores[q.d] += v;
    if(q.s === 'F'){ domainF[q.d] += v; totalF += v; }
    else { domainE[q.d] += v; totalE += v; }
  });

  const maxScore = Math.max(...DOMAIN_ORDER.map(d => domainScores[d]));
  const tiedDomains = DOMAIN_ORDER.filter(d => domainScores[d] === maxScore);
  const primary = tiedDomains[Math.floor(Math.random() * tiedDomains.length)];

  let style;
  if(domainF[primary] === domainE[primary]){
    style = (Math.random() < 0.5) ? 'F' : 'E';
  } else {
    style = (domainF[primary] > domainE[primary]) ? 'F' : 'E';
  }

  const typeKey = primary + '_' + style;
  const type = TYPES[typeKey];
  currentType = type;

  const photoSrc = PROFILE_PHOTOS[type.icon];
  document.getElementById('resAvatar').innerHTML = photoSrc
    ? '<img src="' + photoSrc + '" alt="' + type.name + '">'
    : ICONS[type.icon];
  const title = GENDER_TITLE[userGender] || '';
  document.getElementById('resLeadInline').textContent =
    (userName ? userName + ' ' : '') + (title ? title + '님은 ' : '당신은 ');
  document.getElementById('resCode').textContent = type.code;
  document.getElementById('resName').textContent = type.name;
  document.getElementById('resBlurb').textContent = type.blurb;
  document.getElementById('ctaTitle').textContent =
    (userName ? userName + ' ' : '') + (title ? title + '님' : '당신') + '의 이야기, 더 자세하게 알아봐요';
  document.getElementById('resTraits').innerHTML = type.traits.map(t => '<li>' + t + '</li>').join('');

  const bestKey = getBestMatchKey(typeKey);
  const worstKey = getWorstMatchKey(typeKey);
  document.getElementById('matchRow').innerHTML =
    renderMatchCard('best', bestKey) + renderMatchCard('worst', worstKey);

  document.getElementById('view-quiz').classList.add('hidden');
  document.getElementById('view-result').classList.remove('hidden');
  window.scrollTo(0,0);

  renderRadar(domainScores);
}

```

---

## 8. 레이더 차트

**중요:** 반드시 **외부 라이브러리(Chart.js 등) 없이 순수 SVG로 직접 좌표 계산**해서 그려주세요. 이전에 Chart.js를 CDN으로 불러오다가, 네트워크 환경에 따라 로드가 막히면 결과 화면 전체가 깨지는 문제가 있었습니다. React 컴포넌트로 아래 로직을 그대로 재구현하면 됩니다 (좌표 계산 공식은 동일하게 유지, React에서는 `dangerouslySetInnerHTML` 대신 JSX로 `<circle>`, `<polygon>` 등을 직접 렌더링하는 방식을 추천):

```js
function renderRadar(scores){
  const cx = 142, cy = 100, maxR = 72;
  const n = DOMAIN_ORDER.length;
  const angleFor = (i) => (-90 + i * (360 / n)) * Math.PI / 180;
  const pointAt = (i, r) => {
    const a = angleFor(i);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };

  let svg = '<svg viewBox="0 0 295 195" width="295" height="195" style="width:100%; height:auto; display:block;" xmlns="http://www.w3.org/2000/svg">';

  [0.34, 0.67, 1].forEach((level) => {
    const pts = DOMAIN_ORDER.map((d, i) => pointAt(i, maxR * level).join(',')).join(' ');
    svg += '<polygon points="' + pts + '" fill="none" stroke="var(--border)" stroke-width="1"></polygon>';
  });

  DOMAIN_ORDER.forEach((d, i) => {
    const p = pointAt(i, maxR);
    svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0] + '" y2="' + p[1] + '" stroke="var(--border)" stroke-width="1"></line>';
  });

  const dataPts = DOMAIN_ORDER.map((d, i) => pointAt(i, (Math.max(0, Math.min(scores[d], 20)) / 20) * maxR));
  svg += '<polygon points="' + dataPts.map((p) => p.join(',')).join(' ') + '" fill="var(--navy)" fill-opacity="0.18" stroke="var(--navy)" stroke-width="2"></polygon>';
  dataPts.forEach((p, i) => {
    const d = DOMAIN_ORDER[i];
    svg += '<circle class="radar-pt" cx="' + p[0] + '" cy="' + p[1] + '" r="5.5" fill="var(--navy)" style="cursor:pointer;" data-domain="' + DOMAINS[d] + '" data-score="' + scores[d] + '"></circle>';
  });

  DOMAIN_ORDER.forEach((d, i) => {
    const p = pointAt(i, maxR + 18);
    let anchor = 'middle';
    if (p[0] < cx - 8) anchor = 'end';
    else if (p[0] > cx + 8) anchor = 'start';
    svg += '<text x="' + p[0] + '" y="' + p[1] + '" text-anchor="' + anchor + '" dominant-baseline="middle" font-size="11.5" fill="var(--text2)" font-family="Noto Sans KR, sans-serif">' + DOMAINS_SHORT[d] + '</text>';
  });

  svg += '</svg>';
  document.getElementById('radarChart').innerHTML = svg;
  wireRadarTooltip();
}

```

- 점 위에 마우스를 올리면(`mouseenter`/`mousemove`) "{도메인}: {점수}점" 툴팁이 커서 근처에 뜨고, 벗어나면(`mouseleave`) 사라져야 합니다.
- 모바일 탭 대응도 유지해주세요(탭하면 툴팁 표시).

---

## 9. 완료 기준 체크리스트

Claude Code가 작업을 마치면 아래를 전부 만족해야 합니다.

- [ ] 8개 화면이 모두 존재하고, 프로토타입과 동일한 순서로 이동한다
- [ ] 20문항을 다 풀면 정확한 유형이 계산되어 결과 화면에 표시된다 (기존 채점 로직과 100% 동일한 결과가 나와야 함)
- [ ] 레이더 차트가 외부 라이브러리 없이 렌더링되고, 호버 시 점수 툴팁이 뜬다
- [ ] 유형 이름에만 Gaegu 폰트가 적용되고, 나머지는 Noto Sans KR이다
- [ ] 결제/로그인/공유 버튼이 전부 동작하며(실제 연동은 아니어도 에러 없이), 목업 지점에 `// TODO` 주석이 남아있다
- [ ] `npm run dev`로 로컬 실행 시 콘솔에 에러가 없다
- [ ] 모바일 화면 폭(375~430px)에서 레이아웃이 깨지지 않는다

---

## 10. Claude Code에게 실제로 줄 첫 지시 (복사해서 그대로 사용 가능)

```
이 스펙 문서(ssol-wellness-nextjs-spec.md)를 기반으로 Next.js 14 (App Router, TypeScript,
Tailwind CSS) 프로젝트를 새로 만들어줘.

1. create-next-app으로 프로젝트를 생성해줘.
2. ssol-wellness-images.zip의 내용을 /public/images에 그대로 배치해줘.
3. "3. 디자인 시스템" 섹션의 색상을 tailwind.config의 color 토큰으로 등록해줘.
4. "6. 데이터 모델" 섹션의 데이터를 /lib/data.ts (또는 /data/*.ts)에 타입과 함께 옮겨줘.
5. "7. 채점 & 궁합 로직"을 /lib/scoring.ts로 옮겨줘.
6. "5. 화면 구조"에 나온 8개 화면을 각각의 페이지/컴포넌트로 만들어줘. 화면별 상세 동작을 그대로
   재현해줘 — 문구는 절대 바꾸지 말고.
7. "8. 레이더 차트" 로직을 React 컴포넌트(RadarChart.tsx)로 옮겨줘. 외부 차트 라이브러리는
   쓰지 마.
8. 결제/로그인/공유는 전부 목업으로 만들고, 실제 연동이 필요한 자리마다
   `// TODO: 2단계에서 실제 연동` 주석을 남겨줘.
9. 다 되면 로컬에서 npm run dev로 실행해서 전체 플로우(인트로→온보딩→20문항→결과→
   리포트 미리보기→공유 시트→계정 만들기)를 직접 클릭해보면서 에러가 없는지 확인해줘.
10. "9. 완료 기준 체크리스트"를 하나씩 확인하고 결과를 알려줘.
```

---

## 부록 A. 참고용 원본 프로토타입

`ssol-wellness-quiz.html` (단일 HTML 파일)을 함께 첨부합니다. 이 문서와 실제 동작이 다르게 보이는 부분이 있다면, HTML 파일을 브라우저로 직접 열어서 실제 동작을 우선 기준으로 삼아주세요 (이 문서 작성 시점 기준 최신본입니다).
