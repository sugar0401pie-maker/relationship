// 한국어 조사 자동 처리 (디저트 테스트 v2의 josa 규칙을 그대로 따름)
// 템플릿 문법: {키} 는 값만, {키|은} 처럼 쓰면 값 뒤에 받침에 맞는 조사를 붙임.
//   지원 조사: 은/는, 이/가, 을/를, 과/와, 으로/로, 이에요/예요, 이라서/라서, 도(받침 무관)
// 숫자는 마지막 자리를 한국어로 읽었을 때의 받침으로 판단 (2.0 → '영' → 받침 있음)

const DIGIT_BATCHIM = { 0: true, 1: true, 2: false, 3: true, 4: false, 5: false, 6: true, 7: true, 8: true, 9: false };

export function hasBatchim(word) {
  const ch = String(word).trim().slice(-1);
  if (ch in DIGIT_BATCHIM) return DIGIT_BATCHIM[ch];
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

const PAIRS = {
  은: ["은", "는"], 는: ["은", "는"],
  이: ["이", "가"], 가: ["이", "가"],
  을: ["을", "를"], 를: ["을", "를"],
  과: ["과", "와"], 와: ["과", "와"],
  으로: ["으로", "로"], 로: ["으로", "로"],
  이에요: ["이에요", "예요"], 예요: ["이에요", "예요"],
  이라서: ["이라서", "라서"], 라서: ["이라서", "라서"],
};

export function josa(word, particle) {
  if (particle === "도") return "도";
  const pair = PAIRS[particle];
  if (!pair) throw new Error(`지원하지 않는 조사: ${particle}`);
  return hasBatchim(word) ? pair[0] : pair[1];
}

// 문항 데이터에는 "{애칭}은", "{애칭}이"처럼 받침 있는 형태로 적혀 있음.
// 화면에 내기 전에 이 함수로 "{애칭|은}" 형태로 바꾼 뒤 render 하면 조사가 자동으로 맞춰짐.
export function normalizeItemText(text) {
  // 조사 뒤가 공백·문장부호·끝이거나, '과의/와의'처럼 '의'가 붙는 경우만 바꿈
  // ("{애칭}에게", "{애칭}의", "{애칭}도"는 받침과 무관하므로 그대로 둠)
  return text.replace(/\{([^}|]+)\}(이에요|예요|이라서|라서|으로|은|는|이|가|을|를|과|와|로)(?=의|[^가-힣]|$)/g,
    (_, key, p) => `{${key}|${p}}`);
}

// render("{애칭|은} 보통", { 애칭: "민수" }) → "민수는 보통"
export function render(template, vars) {
  return template.replace(/\{([^}|]+)(?:\|([^}]+))?\}/g, (_, key, particle) => {
    if (!(key in vars)) throw new Error(`템플릿 변수 없음: ${key}`);
    const v = String(vars[key]);
    if (!particle) return v;
    if (v === "나" && (particle === "이" || particle === "가")) return "내가"; // 1인칭 예외
    return v + josa(v, particle);
  });
}
