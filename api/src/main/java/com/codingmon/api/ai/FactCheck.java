package com.codingmon.api.ai;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import com.codingmon.api.judge.RuntimeErrorType;
import com.codingmon.api.judge.Verdict;

// 사실 검증(AI_FEATURES 8절, #79). 정답 코드 검사(AnswerGuard)를 통과한 응답을 저장하기 전에 서버가 고친다. LLM을 다시 부르지 않는다.
// - 줄 번호: 1부터 제출 코드의 전체 줄 수(codeLines)까지만 맞는 번호다. 벗어나면 suspectLines의 그 번호, 그 줄을 짚은
//   facts·guesses·improvements 항목을 지운다. 지울 수 없는 글(summary·hints, F3의 complexity·nextConcepts)은 그대로 두고 센다.
// - [사실]: facts 항목을 모델이 본 입력(AnalysisInput)의 실행 결과와 대조해, 근거가 없거나 어긋나면 guesses 뒤로 옮긴다.
//   근거는 넓게 잡는다(판정 이름, 예제 번호, 출력·메시지의 값, 셀 수 있는 개수 등). 코드를 읽고 판단한 문장과 실행 결과와 어긋나는
//   문장을 걸러 내는 것이 목적이고, 자유 문장의 뜻을 다 증명하지는 않는다.
// - 비공개 값: 비공개 테스트의 입력·기대 출력으로 보이는 글이나 몇 번째 비공개 테스트인지를 말한 항목은 지운다. 비공개 값이
//   summary·hints에 있으면 결과를 차단한다(원칙 1). 모델은 비공개 원문을 받지 않으므로 지어낸 값이 우연히 같은 경우다.
// 결과(Fix)에는 응답 글과 비공개 값을 담지 않는다. 로그와 ai_reviews.content의 factCheck에 남기기 때문이다.
// 처리기 스레드에서 돈다. 여기서 던지면 분석이 FAILED가 되므로 빈 입력(예제·비공개 요약·컴파일 메시지가 없거나 0줄 코드)에서도
// 던지지 않는다.
final class FactCheck {

    // content의 factCheck.version. 규칙을 바꿔 같은 응답의 결과가 달라지면 올린다.
    static final int VERSION = 1;

    // 비공개 후보로 삼는 최소 길이(공백 정리 뒤 글자 수). 값 하나짜리 줄은 더 길어야 한다("12345"처럼 흔한 수를 피한다).
    static final int HIDDEN_MIN_CHARS = 6;
    static final int HIDDEN_SINGLE_MIN_CHARS = 8;
    // 긴 줄은 이 개수만큼 이어진 값 조각도 후보로 삼는다. 줄 일부만 옮긴 것을 잡는다.
    static final int HIDDEN_WINDOW_FIELDS = 4;
    static final int HIDDEN_MAX_CANDIDATES = 2_000;
    // 후보를 뽑으려고 살펴보는 조각 수의 상한. 걸러진 조각도 센다. 비공개 원문이 커도 요청마다 하는 일이 이만큼으로 묶인다.
    static final int HIDDEN_MAX_EXAMINED = 20_000;
    // 응답 글에서 후보와 맞춰 볼 이어진 값의 최대 개수. 이보다 긴 후보 줄은 조각으로만 맞춘다.
    private static final int MAX_MATCH_FIELDS = 64;
    private static final int MAX_SEGMENT_FIELDS = 300;

    enum Kind {
        // 지우는 것(지울 수 없는 글이면 비공개 값은 차단, 나머지는 센다)
        HIDDEN_VALUE,
        HIDDEN_ORDINAL,
        LINE_OUT_OF_RANGE,
        // [추정]으로 옮기는 것
        EXAMPLE_NOT_RUN,
        EXAMPLE_NOT_SEEN,
        CONTRADICTED_FACT,
        UNMATCHED_VALUE,
        UNGROUNDED_FACT
    }

    // KEPT는 지울 수 없는 글이라 그대로 두고 센 것이다.
    enum Action { REMOVED, DEMOTED, KEPT, BLOCKED }

    // field는 고치기 전 위치다("facts[1]", "suspectLines[2]", "hints.direction").
    record Fix(Kind kind, String field, Action action) {
    }

    // ai_reviews.content의 factCheck. removed는 지운 항목(차단한 글 포함), unresolved는 그대로 둔 글의 수다.
    record Meta(int version, int removed, int demoted, int unresolved, List<String> fixes) {
    }

    record Outcome<T>(T result, List<Fix> fixes, boolean blocked) {

        Outcome {
            fixes = List.copyOf(fixes);
        }

        Meta meta() {
            return new Meta(VERSION, count(Action.REMOVED) + count(Action.BLOCKED), count(Action.DEMOTED),
                    count(Action.KEPT), fixes.stream().map(FactCheck::describe).toList());
        }

        // 로그의 outcome
        String label() {
            return blocked ? "BLOCKED" : fixes.isEmpty() ? "PASSED" : "FIXED";
        }

        private int count(Action action) {
            return (int) fixes.stream().filter(fix -> fix.action() == action).count();
        }
    }

    // 비공개 값 검사 자료(FactCheckRepository). hidden은 비공개 케이스의 기대 출력, 그다음 입력이다. 후보가 상한에 닿으면
    // 뒤의 것을 보지 않으므로 더 지켜야 할 것(정답 값)을 앞에 둔다. open은 학습자가 이미 볼 수 있는 글(지문·입출력 설명·제약,
    // 공개 예제와 그 실행 출력, 제출 코드, 컴파일 메시지)이다. toString에는 개수만 넣는다.
    record Sources(List<String> hidden, List<String> open) {

        static final Sources NONE = new Sources(List.of(), List.of());

        // 빈 값(컴파일 메시지가 없는 제출 등)은 뺀다.
        Sources {
            hidden = hidden.stream().filter(Objects::nonNull).toList();
            open = open.stream().filter(Objects::nonNull).toList();
        }

        @Override
        public String toString() {
            return "Sources[hidden=" + hidden.size() + ", open=" + open.size() + "]";
        }
    }

    // F1 검증 자료. 요청 스레드에서 한 번 만든다(AnalysisService). toString에는 개수만 넣는다.
    record Context(int codeLines, Evidence evidence, Hidden hidden) {

        static Context of(AnalysisInput input, Sources sources) {
            return new Context(input.submission().codeLines(), Evidence.of(input), Hidden.of(sources));
        }

        @Override
        public String toString() {
            return "Context[codeLines=" + codeLines + ", " + evidence + ", " + hidden + "]";
        }
    }

    // ===== 줄 번호 =====

    private static final String NUM = "(?<![\\w.^/:])\\d{1,6}(?!\\d)";
    private static final String NUM_JOIN = "\\s*(?:번째|번)?\\s*(?:,|·|~|〜|-|부터|와|과|및|또는|이나)\\s*";
    // "4번째 줄", "4번 줄", "3~9번 줄", "4, 7번째 줄", "4번째와 7번째 줄", "4부터 6번째 줄"
    private static final Pattern LINE_REF = Pattern.compile(
            "(" + NUM + "(?:" + NUM_JOIN + NUM + ")*)\\s*(?:번째|번)\\s*(?:줄|라인)");
    // "4행". "3행 4열", "행렬" 같은 표 이야기는 뺀다.
    private static final Pattern ROW_REF = Pattern.compile("(" + NUM + ")\\s*행(?![렬동위])(?!\\s*\\d+\\s*열)");
    private static final Pattern RANGE_JOIN = Pattern.compile("~|〜|-|부터");
    private static final Pattern DIGITS = Pattern.compile("\\d+");
    // 바로 앞에 이 말이 있으면 출력·입력·메시지의 줄이다("기대 출력의 3번째 줄", "예제 1의 2번째 줄").
    private static final Pattern NOT_CODE_BEFORE = Pattern.compile(
            "(?:출력|입력|결과|메시지|트레이스백|예제\\s*\\d{0,3}\\s*번?)\\s*(?:의|에서|에|은|는|이|가|을|를|과|와|,)?\\s*$");
    // 바로 뒤에 출력 모양이 오면 출력의 줄이다("3번째 줄에는 별이 1개", "2번째 줄 공백").
    private static final Pattern OUTPUT_AFTER = Pattern.compile("^\\s*(?:에|에는|에서는)?\\s*(?:별|공백|빈\\s*줄|줄바꿈)");

    // ===== 예제·비공개 테스트 =====

    // "예제 1", "예제 1번", "1번째 예제". "예제 2개"는 개수다.
    private static final Pattern EXAMPLE_REF = Pattern.compile(
            "예제\\s*(\\d{1,3})(?!\\d)(?!\\s*(?:개|가지))|(?<![\\w.])(\\d{1,3})\\s*번째\\s*(?:공개\\s*)?예제");
    // "3번째 비공개 테스트", "비공개 테스트 3번(째)", "두 번째 비공개 테스트"
    private static final Pattern HIDDEN_ORDINAL = Pattern.compile(
            "(?:\\d+|첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\\s*번째\\s*(?:비공개|숨겨진|숨긴|히든)"
                    + "|(?:비공개|숨겨진|숨긴|히든)\\s*(?:테스트|케이스|입력)?\\s*(?:중\\s*)?(?:\\d+|첫|두|세|네)\\s*번째?(?!\\s*(?:중|개))");
    private static final Pattern HIDDEN_WORD = Pattern.compile("비공개|숨겨진|숨긴|히든");
    private static final Pattern EXAMPLE_WORD = Pattern.compile("예제|(?:기대|실제)\\s*출력");
    private static final Pattern NOT_RUN = Pattern.compile("실행(?:하지|되지|을\\s*하지)\\s*(?:않|못)|실행하기\\s*전|실행할\\s*수\\s*없");
    private static final Pattern ALL_RESULT = Pattern.compile("(?:모두|전부|다)\\s*(?:가|를|는)?\\s*(통과|맞|틀|실패)");
    // ALL_RESULT 바로 뒤의 부정("모두 통과하지는 못했습니다", "다 틀린 것은 아닙니다")
    private static final Pattern NEGATED_AFTER = Pattern.compile("^[^.!?]{0,8}?(?:지\\s*(?:는|도|를|가)?\\s*(?:못|않)|아니|아닙|아님|아닌)");
    private static final Pattern RESULT_WORD = Pattern.compile("실패|통과|틀|맞");
    private static final Pattern COUNT = Pattern.compile("(?<![\\w.])(\\d+)\\s*개");
    private static final Pattern EXTREME = Pattern.compile("가장\\s*(작은|큰)\\s*입력[^.!?]*?(실패|틀|통과|맞)");
    private static final Pattern SIZE_GRADE = Pattern.compile("(작은|중간\\s*크기의?|큰)\\s*입력");

    // ===== 값 =====

    private static final Pattern THOUSANDS = Pattern.compile("(?<=\\d),(?=\\d{3}(?!\\d))");
    // 입력을 줄이며 붙인 표시(AnalysisInput.clip). 정규화로 "…"가 "..."가 되므로 둘 다 받는다.
    private static final Pattern CLIP_MARK = Pattern.compile("\\[(?:…|\\.\\.\\.)뒤 \\d+(?:자|줄) 생략\\]");
    private static final Pattern NUMBER = Pattern.compile("(?<![\\w.^])-?\\d+(?:\\.\\d+)?");
    private static final Pattern QUOTED = Pattern.compile("'([^'\\n]{1,80})'|\"([^\"\\n]{1,80})\"");
    private static final Pattern ASCII_VISIBLE = Pattern.compile("[!-~]");
    private static final Pattern ASCII_ONLY = Pattern.compile("[\\x00-\\x7F]*");
    private static final Pattern INTEGER = Pattern.compile("-?\\d+");
    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z_][A-Za-z0-9_]{2,}");
    private static final Pattern BIG_O = Pattern.compile("\\bO\\s*\\([^)\\n]*\\)");
    private static final Pattern COUNTABLE = Pattern.compile("(?<![\\w.])(\\d+)\\s*(?:개|줄|글자|자|칸|번|회)");
    private static final Pattern MEASURE = Pattern.compile(
            "(?<![\\w.])(\\d+(?:\\.\\d+)?)\\s*(?:ms|밀리초|초|kb|킬로바이트|mb|메가바이트)", Pattern.CASE_INSENSITIVE);
    private static final Pattern SENTENCE_END = Pattern.compile("(?<=[.!?])\\s+|\\n+");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");
    private static final Pattern FIELD_SEPARATOR = Pattern.compile("[\\s,]+");
    private static final String FIELD_PUNCTUATION = "\"'`()[]{}.:;!?";
    // 값 토큰(valueTokens): 수, 영문 낱말, 쉼표 밖의 ASCII 기호 묶음
    private static final Pattern VALUE_TOKEN = Pattern.compile(
            "-?\\d+(?:\\.\\d+)?|[A-Za-z_][A-Za-z0-9_]*|[!\"#$%&'()*+\\-./:;<=>?@\\[\\\\\\]^`{|}~]+");
    // 지수 표기: (가수 ×) 밑 ^ 지수 (± 더할 수). "10^{9}", "10**9"도 받는다.
    private static final Pattern POWER = Pattern.compile("(?:(\\d+(?:\\.\\d+)?)\\s*[×xX*·]\\s*)?(\\d+)\\s*(?:\\^|\\*\\*)\\s*\\{?\\s*(\\d+)\\s*\\}?"
            + "(?:\\s*([+\\-−])\\s*(\\d+))?");
    private static final Pattern SCIENTIFIC = Pattern.compile(
            "(?<![\\w.])(\\d+(?:\\.\\d+)?)[eE]\\+?(\\d+)(?![\\w.])(?:\\s*([+\\-−])\\s*(\\d+))?");
    private static final Pattern SUP_TAG = Pattern.compile("(\\d+)\\s*<sup>\\s*(\\d+)\\s*</sup>", Pattern.CASE_INSENSITIVE);
    private static final String SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
    private static final Pattern SUPERSCRIPT = Pattern.compile("(\\d+)([" + SUPERSCRIPT_DIGITS + "]+)");

    // 판정마다 응답에 나올 만한 말. 근거로 넓게 본다.
    private static final Map<Verdict, Pattern> VERDICT_WORDS = Map.of(
            Verdict.ACCEPTED, Pattern.compile("통과|맞았|맞은|정답"),
            Verdict.WRONG_ANSWER, Pattern.compile("틀렸|틀린|오답"),
            Verdict.TIME_LIMIT_EXCEEDED, Pattern.compile("시간\\s*초과|시간\\s*제한을\\s*넘"),
            Verdict.MEMORY_LIMIT_EXCEEDED, Pattern.compile("메모리\\s*초과|메모리\\s*제한을\\s*넘"),
            Verdict.RUNTIME_ERROR, Pattern.compile("런타임\\s*(?:에러|오류)|실행\\s*(?:중|도중)"),
            Verdict.COMPILE_ERROR, Pattern.compile("컴파일"),
            Verdict.PRESENTATION_ERROR, Pattern.compile("출력\\s*형식"),
            Verdict.OUTPUT_LIMIT_EXCEEDED, Pattern.compile("출력\\s*초과|출력이\\s*너무"));
    // 다른 판정과 헷갈리지 않는 이름. 입력에 없는 판정의 이름이면 어긋난 사실이다. "틀렸습니다"는 실패를 뜻하는 말로도 써서 뺀다.
    private static final Map<Verdict, Pattern> VERDICT_NAMES = Map.of(
            Verdict.TIME_LIMIT_EXCEEDED, Pattern.compile("시간\\s*초과"),
            Verdict.MEMORY_LIMIT_EXCEEDED, Pattern.compile("메모리\\s*초과"),
            Verdict.RUNTIME_ERROR, Pattern.compile("런타임\\s*(?:에러|오류)"),
            Verdict.COMPILE_ERROR, Pattern.compile("컴파일\\s*(?:에러|오류)"),
            Verdict.PRESENTATION_ERROR, Pattern.compile("출력\\s*형식이\\s*잘못"),
            Verdict.OUTPUT_LIMIT_EXCEEDED, Pattern.compile("출력\\s*초과"));
    // 런타임 에러 종류의 쉬운 말(prompts/analysis-v1/RUNTIME_ERROR.md)과 예외 이름
    private static final Map<RuntimeErrorType, Pattern> ERROR_WORDS = Map.of(
            RuntimeErrorType.INDEX_ERROR, Pattern.compile("없는\\s*칸|범위를\\s*벗어|인덱스|IndexError|out of range|잘못된\\s*메모리"),
            RuntimeErrorType.ZERO_DIVISION, Pattern.compile("0으로\\s*나누|ZeroDivision"),
            RuntimeErrorType.VALUE_ERROR, Pattern.compile("변환하지\\s*못|값의\\s*모양|ValueError"),
            RuntimeErrorType.NAME_ERROR, Pattern.compile("만들지\\s*않은\\s*이름|정의되지\\s*않은|NameError"),
            RuntimeErrorType.TYPE_ERROR, Pattern.compile("서로\\s*다른\\s*종류|TypeError"),
            RuntimeErrorType.RECURSION_ERROR, Pattern.compile("재귀|RecursionError"),
            RuntimeErrorType.EOF_ERROR, Pattern.compile("더\\s*많이\\s*읽|입력이\\s*부족|EOFError"));
    private static final Pattern SAMPLE_KEYWORDS = Pattern.compile("예제|(?:기대|실제)\\s*출력|출력\\s*결과|(?:에러|오류)\\s*메시지");
    private static final Pattern COMPILE_KEYWORDS = Pattern.compile("컴파일|메시지");

    private FactCheck() {
    }

    // ===== F1·F2 =====

    static Outcome<AnalysisResult> verify(AnalysisResult result, Context context) {
        List<Fix> fixes = new ArrayList<>();
        boolean blocked = keep("summary", result.summary(), context, fixes);

        List<Integer> lines = new ArrayList<>();
        for (int i = 0; i < result.suspectLines().size(); i++) {
            Integer line = result.suspectLines().get(i);
            if (line != null && inRange(line, line, context.codeLines())) {
                lines.add(line);
            } else {
                fixes.add(new Fix(Kind.LINE_OUT_OF_RANGE, "suspectLines[" + i + "]", Action.REMOVED));
            }
        }

        List<String> facts = new ArrayList<>();
        List<String> demoted = new ArrayList<>();
        for (int i = 0; i < result.facts().size(); i++) {
            String fact = result.facts().get(i);
            String field = "facts[" + i + "]";
            Kind removal = removal(fact, context);
            if (removal != null) {
                fixes.add(new Fix(removal, field, Action.REMOVED));
                continue;
            }
            Kind demotion = demotion(fact, context.evidence());
            if (demotion != null) {
                fixes.add(new Fix(demotion, field, Action.DEMOTED));
                demoted.add(fact);
            } else {
                facts.add(fact);
            }
        }

        List<String> guesses = new ArrayList<>();
        for (int i = 0; i < result.guesses().size(); i++) {
            String guess = result.guesses().get(i);
            Kind removal = removal(guess, context);
            if (removal != null) {
                fixes.add(new Fix(removal, "guesses[" + i + "]", Action.REMOVED));
            } else {
                guesses.add(guess);
            }
        }
        // 옮긴 [사실]은 원래 순서대로 [추정] 뒤에 붙인다. 문장은 고치지 않는다.
        guesses.addAll(demoted);

        AnalysisResult.Hints hints = result.hints();
        blocked |= keep("hints.observation", hints.observation(), context, fixes);
        blocked |= keep("hints.direction", hints.direction(), context, fixes);
        blocked |= keep("hints.principle", hints.principle(), context, fixes);

        return new Outcome<>(new AnalysisResult(result.summary(), lines, facts, guesses, hints), fixes, blocked);
    }

    // ===== F3 =====

    // 코드 리뷰는 정답 제출이라 예제·비공개 테스트를 모델에 보내지 않는다. 줄 번호 범위만 본다.
    static Outcome<CodeReviewResult> verify(CodeReviewResult result, int codeLines) {
        List<Fix> fixes = new ArrayList<>();
        Map<String, String> kept = new LinkedHashMap<>();
        kept.put("summary", result.summary());
        CodeReviewResult.Complexity complexity = result.complexity();
        kept.put("complexity.basis", complexity.basis());
        kept.put("complexity.time", complexity.time());
        kept.put("complexity.space", complexity.space());
        kept.put("complexity.intendedTime", complexity.intendedTime());
        kept.put("complexity.comparison", complexity.comparison());
        for (int i = 0; i < result.nextConcepts().size(); i++) {
            kept.put("nextConcepts[" + i + "].name", result.nextConcepts().get(i).name());
            kept.put("nextConcepts[" + i + "].reason", result.nextConcepts().get(i).reason());
        }
        kept.forEach((field, text) -> {
            if (outOfRange(normalize(text), codeLines)) {
                fixes.add(new Fix(Kind.LINE_OUT_OF_RANGE, field, Action.KEPT));
            }
        });

        List<String> improvements = new ArrayList<>();
        for (int i = 0; i < result.improvements().size(); i++) {
            String improvement = result.improvements().get(i);
            if (outOfRange(normalize(improvement), codeLines)) {
                fixes.add(new Fix(Kind.LINE_OUT_OF_RANGE, "improvements[" + i + "]", Action.REMOVED));
            } else {
                improvements.add(improvement);
            }
        }
        return new Outcome<>(new CodeReviewResult(result.summary(), complexity, improvements, result.nextConcepts()),
                fixes, false);
    }

    // 로그와 메타에 남길 꼴. 예: LINE_OUT_OF_RANGE@suspectLines[2],UNGROUNDED_FACT@facts[1],HIDDEN_VALUE@hints.direction(blocked)
    static String describe(List<Fix> fixes) {
        return fixes.stream().map(FactCheck::describe).collect(Collectors.joining(","));
    }

    private static String describe(Fix fix) {
        String suffix = switch (fix.action()) {
            case KEPT -> "(kept)";
            case BLOCKED -> "(blocked)";
            default -> "";
        };
        return fix.kind() + "@" + fix.field() + suffix;
    }

    // 지울 수 없는 글. 비공개 값이면 차단할 것을 알리고(true), 순번·줄 번호는 센다.
    private static boolean keep(String field, String text, Context context, List<Fix> fixes) {
        Kind kind = removal(text, context);
        if (kind == null) {
            return false;
        }
        boolean block = kind == Kind.HIDDEN_VALUE;
        fixes.add(new Fix(kind, field, block ? Action.BLOCKED : Action.KEPT));
        return block;
    }

    // 지울 사유. 비공개 값 → 비공개 순번 → 범위 밖 줄 번호 순으로 본다.
    private static Kind removal(String raw, Context context) {
        String text = normalize(raw);
        if (context.hidden().leaks(text)) {
            return Kind.HIDDEN_VALUE;
        }
        if (HIDDEN_ORDINAL.matcher(text).find()) {
            return Kind.HIDDEN_ORDINAL;
        }
        if (outOfRange(text, context.codeLines())) {
            return Kind.LINE_OUT_OF_RANGE;
        }
        return null;
    }

    // ===== 줄 번호 =====

    private static boolean outOfRange(String normalized, int codeLines) {
        return lineRefs(normalized).stream().anyMatch(range -> !inRange(range[0], range[1], codeLines));
    }

    private static boolean inRange(int from, int to, int codeLines) {
        return 1 <= from && from <= to && to <= codeLines;
    }

    // 글이 짚은 코드 줄. 범위 표기는 [시작, 끝], 하나는 [n, n]이다. 출력·입력·메시지의 줄은 뺀다.
    static List<int[]> lineRefs(String normalized) {
        List<int[]> refs = new ArrayList<>();
        Matcher matcher = LINE_REF.matcher(normalized);
        while (matcher.find()) {
            if (codeContext(normalized, matcher.start(), matcher.end())) {
                refs.addAll(ranges(matcher.group(1)));
            }
        }
        Matcher rows = ROW_REF.matcher(normalized);
        while (rows.find()) {
            if (codeContext(normalized, rows.start(), rows.end())) {
                int n = parse(rows.group(1));
                refs.add(new int[] {n, n});
            }
        }
        return refs;
    }

    private static boolean codeContext(String text, int start, int end) {
        String before = text.substring(Math.max(0, start - 16), start);
        String after = text.substring(end, Math.min(text.length(), end + 10));
        return !NOT_CODE_BEFORE.matcher(before).find() && !OUTPUT_AFTER.matcher(after).find();
    }

    // "3~9" → [3, 9], "4, 7" → [4, 4], [7, 7], "4부터 6" → [4, 6]
    private static List<int[]> ranges(String group) {
        List<int[]> ranges = new ArrayList<>();
        Matcher digits = DIGITS.matcher(group);
        int previousEnd = -1;
        while (digits.find()) {
            int n = parse(digits.group());
            if (previousEnd >= 0 && RANGE_JOIN.matcher(group.substring(previousEnd, digits.start())).find()) {
                ranges.getLast()[1] = n;
            } else {
                ranges.add(new int[] {n, n});
            }
            previousEnd = digits.end();
        }
        return ranges;
    }

    private static int parse(String digits) {
        return digits.length() > 9 ? Integer.MAX_VALUE : Integer.parseInt(digits);
    }

    // ===== [사실] 대조 =====

    // 옮길 사유. 어긋난 문장 → 입력에 없는 값 → 근거 없음 순으로 본다.
    private static Kind demotion(String raw, Evidence evidence) {
        String text = clean(raw);
        for (String sentence : SENTENCE_END.split(text)) {
            Kind kind = contradiction(sentence, evidence);
            if (kind != null) {
                return kind;
            }
        }
        // 줄 번호·예제 번호·복잡도 표기는 값이 아니다(줄 번호는 따로 본다).
        String values = text;
        for (Pattern reference : List.of(LINE_REF, ROW_REF, EXAMPLE_REF, BIG_O)) {
            values = reference.matcher(values).replaceAll(" ");
        }
        if (!valuesMatch(values, evidence)) {
            return Kind.UNMATCHED_VALUE;
        }
        return grounded(text, values, evidence) ? null : Kind.UNGROUNDED_FACT;
    }

    private static Kind contradiction(String sentence, Evidence e) {
        boolean notRun = NOT_RUN.matcher(sentence).find();
        if (e.samples() == null) {
            if (EXAMPLE_WORD.matcher(sentence).find() && !notRun) {
                return Kind.EXAMPLE_NOT_RUN;
            }
        } else {
            Matcher example = EXAMPLE_REF.matcher(sentence);
            while (example.find()) {
                String no = example.group(1) != null ? example.group(1) : example.group(2);
                if (!e.sampleNos().contains(parse(no))) {
                    return Kind.EXAMPLE_NOT_SEEN;
                }
            }
            Matcher all = ALL_RESULT.matcher(sentence);
            if (sentence.contains("예제") && !HIDDEN_WORD.matcher(sentence).find() && all.find()) {
                boolean passed = all.group(1).equals("통과") || all.group(1).equals("맞");
                // 모두 그렇다는 주장과, 뒤에 부정이 붙어 모두 그렇지는 않다는 주장을 나눠 본다.
                boolean negated = NEGATED_AFTER.matcher(sentence.substring(all.end())).find();
                boolean everyPassed = e.samples().failed() == 0;
                boolean everyFailed = e.samples().failed() == e.samples().total();
                boolean holds = passed ? everyPassed != negated : everyFailed != negated;
                if (!holds) {
                    return Kind.CONTRADICTED_FACT;
                }
            }
        }

        boolean hiddenWord = HIDDEN_WORD.matcher(sentence).find();
        Matcher extreme = EXTREME.matcher(sentence);
        boolean extremeFound = extreme.find();
        if (e.hidden() == null) {
            if (hiddenWord && !notRun && (COUNT.matcher(sentence).find() || RESULT_WORD.matcher(sentence).find())) {
                return Kind.CONTRADICTED_FACT;
            }
            if (extremeFound) {
                return Kind.CONTRADICTED_FACT;
            }
        } else {
            if (hiddenWord) {
                Matcher count = COUNT.matcher(sentence);
                while (count.find()) {
                    if (!e.hiddenCounts().contains(parse(count.group(1)))) {
                        return Kind.CONTRADICTED_FACT;
                    }
                }
            }
            if (extremeFound) {
                // 크기가 모두 비슷하면 가장 작은·큰 입력을 가릴 수 없다(AnalysisInput.HiddenTests).
                boolean sameSize = e.hidden().bySize().stream()
                        .allMatch(group -> group.grade() == AnalysisInput.SizeGrade.MEDIUM);
                boolean claimsFailed = extreme.group(2).equals("실패") || extreme.group(2).equals("틀");
                boolean failed = extreme.group(1).equals("작은") ? e.hidden().smallestFailed() : e.hidden().largestFailed();
                if (sameSize || claimsFailed != failed) {
                    return Kind.CONTRADICTED_FACT;
                }
            }
        }

        for (Map.Entry<Verdict, Pattern> name : VERDICT_NAMES.entrySet()) {
            if (!e.verdicts().contains(name.getKey()) && name.getValue().matcher(sentence).find()) {
                return Kind.CONTRADICTED_FACT;
            }
        }
        return null;
    }

    // 두 자리 이상의 수, 음수, 소수, 따옴표 안의 글(한글만 있는 것은 빼고)은 모두 입력에 있어야 한다.
    private static boolean valuesMatch(String values, Evidence e) {
        Matcher number = NUMBER.matcher(values);
        while (number.find()) {
            String value = number.group();
            boolean concrete = value.startsWith("-") || value.contains(".") || value.length() >= 2;
            if (concrete && !e.numbers().contains(canonical(value))) {
                return false;
            }
        }
        Matcher quoted = QUOTED.matcher(values);
        while (quoted.find()) {
            String content = collapse(quoted.group(1) != null ? quoted.group(1) : quoted.group(2));
            if (ASCII_VISIBLE.matcher(content).find() && !quotedIn(e.text(), content)) {
                return false;
            }
        }
        return true;
    }

    // 따옴표 안의 글이 입력에 경계까지 맞게 있는가. "****"는 "*****" 안에 있어도 다른 출력이다.
    private static boolean quotedIn(String text, String content) {
        for (int at = text.indexOf(content); at >= 0; at = text.indexOf(content, at + 1)) {
            int end = at + content.length();
            if (edge(at == 0 ? null : text.charAt(at - 1), content.charAt(0))
                    && edge(end == text.length() ? null : text.charAt(end), content.charAt(content.length() - 1))) {
                return true;
            }
        }
        return false;
    }

    private static boolean edge(Character outside, char inside) {
        return outside == null || (outside != inside
                && !(Character.isLetterOrDigit(outside) && Character.isLetterOrDigit(inside)));
    }

    // 실행 결과에 기댄 말이 하나라도 있는가
    private static boolean grounded(String text, String values, Evidence e) {
        for (Verdict verdict : e.verdicts()) {
            if (VERDICT_WORDS.get(verdict).matcher(text).find()) {
                return true;
            }
        }
        for (RuntimeErrorType type : e.errorTypes()) {
            Pattern words = ERROR_WORDS.get(type);
            if (words != null && words.matcher(text).find()) {
                return true;
            }
        }
        if (e.samples() != null && (EXAMPLE_REF.matcher(text).find() || SAMPLE_KEYWORDS.matcher(text).find())) {
            return true;
        }
        if (e.compiled() && COMPILE_KEYWORDS.matcher(text).find()) {
            return true;
        }
        if (e.hidden() != null && (HIDDEN_WORD.matcher(text).find() || EXTREME.matcher(text).find()
                || sizeGrade(text, e.hidden()))) {
            return true;
        }
        Matcher number = NUMBER.matcher(values);
        while (number.find()) {
            if (number.group().length() >= 2 && e.numbers().contains(canonical(number.group()))) {
                return true;
            }
        }
        Matcher identifier = IDENTIFIER.matcher(values);
        while (identifier.find()) {
            if (e.identifiers().contains(identifier.group())) {
                return true;
            }
        }
        if (e.lines().stream().anyMatch(text::contains)) {
            return true;
        }
        Matcher countable = COUNTABLE.matcher(values);
        while (countable.find()) {
            if (e.counts().contains(parse(countable.group(1)))) {
                return true;
            }
        }
        Matcher measure = MEASURE.matcher(values);
        while (measure.find()) {
            if (e.numbers().contains(canonical(measure.group(1)))) {
                return true;
            }
        }
        return false;
    }

    private static boolean sizeGrade(String text, AnalysisInput.HiddenTests hidden) {
        Matcher size = SIZE_GRADE.matcher(text);
        while (size.find()) {
            AnalysisInput.SizeGrade grade = size.group(1).startsWith("작") ? AnalysisInput.SizeGrade.SMALL
                    : size.group(1).startsWith("큰") ? AnalysisInput.SizeGrade.LARGE : AnalysisInput.SizeGrade.MEDIUM;
            if (hidden.bySize().stream().anyMatch(group -> group.grade() == grade)) {
                return true;
            }
        }
        return false;
    }

    // 모델이 본 입력에서 뽑은 실행 결과. 판정별로 나누지 않아도 입력에 있는 것만 담기므로 판정별 규칙이 된다.
    // counts는 셀 수 있는 수(출력 줄 수, 줄 길이, 줄의 값 개수, 예제·비공개 개수), hiddenCounts는 비공개를 말할 때 쓸 수 있는 개수,
    // numbers는 값으로 쓸 수 있는 수 전부(입출력·메시지의 수, 개수, 시간·메모리와 단위를 바꾼 값)다.
    record Evidence(Set<Verdict> verdicts, Set<RuntimeErrorType> errorTypes, AnalysisInput.Samples samples,
            Set<Integer> sampleNos, boolean compiled, AnalysisInput.HiddenTests hidden, Set<Integer> hiddenCounts,
            Set<Integer> counts, Set<String> numbers, Set<String> identifiers, Set<String> lines, String text) {

        static Evidence of(AnalysisInput input) {
            AnalysisInput.Submission submission = input.submission();
            Set<Verdict> verdicts = EnumSet.noneOf(Verdict.class);
            Set<RuntimeErrorType> errorTypes = EnumSet.noneOf(RuntimeErrorType.class);
            Set<Integer> sampleNos = new HashSet<>();
            Set<Integer> hiddenCounts = new HashSet<>();
            Set<Integer> counts = new HashSet<>();
            Set<String> numbers = new HashSet<>();
            List<String> texts = new ArrayList<>();

            if (submission.verdict() != null) {
                verdicts.add(submission.verdict());
            }
            if (submission.runtimeErrorType() != null) {
                errorTypes.add(submission.runtimeErrorType());
            }
            measures(numbers, submission.executionTimeMs(), submission.memoryUsedKb());
            addMs(numbers, input.problem().timeLimitMs());
            addMb(numbers, input.problem().memoryLimitMb());
            if (submission.compilerMessage() != null) {
                texts.add(submission.compilerMessage());
            }

            AnalysisInput.Samples samples = input.samples();
            if (samples != null) {
                List<Integer> sampleCounts = List.of(samples.total(), samples.failed(), samples.total() - samples.failed());
                counts.addAll(sampleCounts);
                hiddenCounts.addAll(sampleCounts);
                for (AnalysisInput.Sample sample : samples.cases()) {
                    sampleNos.add(sample.no());
                    if (sample.verdict() != null) {
                        verdicts.add(sample.verdict());
                    }
                    if (sample.runtimeErrorType() != null) {
                        errorTypes.add(sample.runtimeErrorType());
                    }
                    measures(numbers, sample.executionTimeMs(), sample.memoryUsedKb());
                    for (String output : new String[] {sample.input(), sample.expectedOutput(), sample.actualOutput()}) {
                        if (output != null) {
                            texts.add(output);
                            shape(counts, output);
                        }
                    }
                    if (sample.errorMessage() != null) {
                        texts.add(sample.errorMessage());
                    }
                }
                if (samples.cases().stream().anyMatch(sample -> sample.verdict() == Verdict.ACCEPTED)) {
                    verdicts.add(Verdict.ACCEPTED);
                }
            }

            AnalysisInput.HiddenTests hidden = input.hiddenTests();
            if (hidden != null) {
                verdicts.addAll(hidden.failedVerdicts().keySet());
                if (hidden.passed() > 0) {
                    verdicts.add(Verdict.ACCEPTED);
                }
                errorTypes.addAll(hidden.runtimeErrorTypes());
                hiddenCounts.addAll(List.of(hidden.total(), hidden.passed(), hidden.failed()));
                hiddenCounts.addAll(hidden.failedVerdicts().values());
                for (AnalysisInput.SizeGroup group : hidden.bySize()) {
                    hiddenCounts.addAll(List.of(group.passed(), group.failed(), group.passed() + group.failed()));
                }
                counts.addAll(hiddenCounts);
            }

            Set<String> identifiers = new HashSet<>();
            Set<String> lines = new LinkedHashSet<>();
            StringBuilder joined = new StringBuilder();
            for (String raw : texts) {
                String text = clean(CLIP_MARK.matcher(raw).replaceAll(" "));
                joined.append(collapse(text)).append('\n');
                Matcher number = NUMBER.matcher(text);
                while (number.find()) {
                    numbers.add(canonical(number.group()));
                }
                Matcher identifier = IDENTIFIER.matcher(text);
                while (identifier.find()) {
                    identifiers.add(identifier.group());
                }
                for (String line : text.split("\\R")) {
                    String trimmed = collapse(line);
                    if (trimmed.length() >= 2) {
                        lines.add(trimmed);
                    }
                }
            }
            counts.forEach(n -> numbers.add(Integer.toString(n)));
            sampleNos.forEach(n -> numbers.add(Integer.toString(n)));
            return new Evidence(verdicts, errorTypes, samples, sampleNos, submission.compilerMessage() != null, hidden,
                    hiddenCounts, counts, numbers, identifiers, lines, joined.toString());
        }

        @Override
        public String toString() {
            return "Evidence[verdicts=" + verdicts + ", samples=" + sampleNos + ", hidden=" + (hidden != null) + "]";
        }

        // 출력 모양에서 셀 수 있는 수: 줄 수, 줄마다 앞뒤 공백을 뺀 길이와 값 개수
        private static void shape(Set<Integer> counts, String text) {
            List<String> lines = CLIP_MARK.matcher(text).replaceAll("").lines().toList();
            counts.add(lines.size());
            for (String line : lines) {
                String trimmed = line.strip();
                counts.add(trimmed.codePointCount(0, trimmed.length()));
                if (!trimmed.isEmpty()) {
                    counts.add(WHITESPACE.split(trimmed).length);
                }
            }
        }

        private static void measures(Set<String> numbers, Integer timeMs, Integer memoryKb) {
            if (timeMs != null) {
                addMs(numbers, timeMs);
            }
            if (memoryKb != null) {
                numbers.add(Integer.toString(memoryKb));
                // 1024로 나누면 나누어떨어진다. 먼저 자리를 정해 반올림하면 9,272KB(9.0546875MB)가 9.055를 거쳐 9.06이 된다.
                addRounded(numbers, BigDecimal.valueOf(memoryKb).divide(BigDecimal.valueOf(1024)));
            }
        }

        // ms 그대로와 초로 바꾼 값(어림한 정수 포함)
        private static void addMs(Set<String> numbers, int ms) {
            numbers.add(Integer.toString(ms));
            addRounded(numbers, BigDecimal.valueOf(ms).movePointLeft(3));
        }

        // MB 그대로와 KB로 바꾼 값
        private static void addMb(Set<String> numbers, int mb) {
            numbers.add(Integer.toString(mb));
            numbers.add(Integer.toString(mb * 1024));
        }

        // 바꾼 값 그대로("0.018초", "8.984MB")와 어림한 값(소수 둘째·첫째 자리, 정수)
        private static void addRounded(Set<String> numbers, BigDecimal value) {
            numbers.add(canonical(value.toPlainString()));
            numbers.add(canonical(value.setScale(2, RoundingMode.HALF_UP).toPlainString()));
            numbers.add(canonical(value.setScale(1, RoundingMode.HALF_UP).toPlainString()));
            for (RoundingMode mode : List.of(RoundingMode.FLOOR, RoundingMode.CEILING, RoundingMode.HALF_UP)) {
                numbers.add(value.setScale(0, mode).toPlainString());
            }
        }
    }

    // ===== 비공개 값 =====

    // 비공개 케이스의 입력·기대 출력에서 뽑은 후보. 응답 글의 이어진 값 토큰과 하나라도 같으면 누출로 본다.
    // 응답·공개 글·비공개 원문을 같은 값 토큰(valueTokens)으로 나눠 맞춘다. 그래야 "**IMPOSSIBLE**", "answer=6227020800;",
    // "[100,200,300,400]"처럼 기호가 붙은 값도 같은 값으로 본다. 천 단위 쉼표는 지운 글과 지우지 않은 글을 둘 다 본다.
    // values는 ASCII만 있는 줄에서 뽑은 후보(토큰 사이 공백 하나), phrases는 한글 같은 글자가 섞인 줄의 후보(글 안에 들어 있는지 본다).
    // 학습자가 이미 볼 수 있는 글(open)에 있는 값, 짧은 값, 같은 값의 되풀이, 1씩 늘거나 주는 정수열은 후보로 삼지 않는다.
    // 공개 글은 토큰 n-gram 집합(OpenIndex)으로 색인해 후보마다 집합 조회로 거른다.
    // Sources.hidden 순서대로 뽑다가 후보가 HIDDEN_MAX_CANDIDATES에, 살펴본 조각이 HIDDEN_MAX_EXAMINED에 닿으면 멈춘다.
    record Hidden(Set<String> values, Set<String> phrases) {

        static Hidden of(Sources sources) {
            OpenIndex open = OpenIndex.of(sources.open());
            Set<String> values = new LinkedHashSet<>();
            Set<String> phrases = new LinkedHashSet<>();
            int examined = 0;
            for (String text : sources.hidden()) {
                for (String variant : variants(plain(text))) {
                    for (String line : variant.split("\\R")) {
                        if (!ASCII_ONLY.matcher(line).matches()) {
                            examined++;
                            phrase(fields(line), open, phrases);
                            continue;
                        }
                        List<String> tokens = valueTokens(line);
                        if (tokens.size() <= MAX_MATCH_FIELDS) {
                            examined++;
                            value(tokens, open, values);
                        }
                        for (int i = 0; tokens.size() > HIDDEN_WINDOW_FIELDS && i + HIDDEN_WINDOW_FIELDS <= tokens.size(); i++) {
                            examined++;
                            value(tokens.subList(i, i + HIDDEN_WINDOW_FIELDS), open, values);
                        }
                        if (values.size() + phrases.size() >= HIDDEN_MAX_CANDIDATES || examined >= HIDDEN_MAX_EXAMINED) {
                            return new Hidden(Set.copyOf(values), Set.copyOf(phrases));
                        }
                    }
                }
            }
            return new Hidden(Set.copyOf(values), Set.copyOf(phrases));
        }

        private static void value(List<String> tokens, OpenIndex open, Set<String> values) {
            if (candidate(tokens) && !open.hasTokens(tokens)) {
                values.add(String.join(" ", tokens));
            }
        }

        private static void phrase(List<String> fields, OpenIndex open, Set<String> phrases) {
            if (candidate(fields) && !open.hasPhrase(String.join(" ", fields))) {
                phrases.add(String.join(" ", fields));
            }
        }

        // 짧은 값, 같은 값의 되풀이, 1씩 늘거나 주는 정수열은 비공개 값으로 보지 않는다.
        private static boolean candidate(List<String> parts) {
            if (parts.isEmpty()) {
                return false;
            }
            String joined = String.join(" ", parts);
            int length = joined.codePointCount(0, joined.length());
            // 같은 값의 되풀이("0 0 0 0")는 값이 둘 이상일 때만 본다. 값 하나짜리(정답 하나를 출력하는 기대 출력)는 길이로만 거른다.
            boolean repeated = parts.size() > 1 && parts.stream().distinct().count() == 1;
            return length >= HIDDEN_MIN_CHARS && (parts.size() > 1 || length >= HIDDEN_SINGLE_MIN_CHARS) && !repeated
                    && !consecutive(parts);
        }

        // 1 2 3 4, 10 9 8 7처럼 1씩 늘거나 주는 정수열
        private static boolean consecutive(List<String> parts) {
            if (parts.size() < 2 || !parts.stream().allMatch(f -> INTEGER.matcher(f).matches() && f.length() <= 9)) {
                return false;
            }
            long step = Long.parseLong(parts.get(1)) - Long.parseLong(parts.get(0));
            if (Math.abs(step) != 1) {
                return false;
            }
            for (int i = 2; i < parts.size(); i++) {
                if (Long.parseLong(parts.get(i)) - Long.parseLong(parts.get(i - 1)) != step) {
                    return false;
                }
            }
            return true;
        }

        boolean leaks(String normalized) {
            if (values.isEmpty() && phrases.isEmpty()) {
                return false;
            }
            for (String text : variants(plain(normalized))) {
                if (matches(text)) {
                    return true;
                }
            }
            return false;
        }

        private boolean matches(String text) {
            if (!phrases.isEmpty()) {
                String padded = " " + String.join(" ", fields(text)) + " ";
                if (phrases.stream().anyMatch(padded::contains)) {
                    return true;
                }
            }
            if (values.isEmpty()) {
                return false;
            }
            for (String segment : AnswerGuard.NON_ASCII.split(text)) {
                List<String> tokens = valueTokens(segment);
                int size = Math.min(tokens.size(), MAX_SEGMENT_FIELDS);
                for (int i = 0; i < size; i++) {
                    StringBuilder joined = new StringBuilder();
                    for (int j = i; j < Math.min(size, i + MAX_MATCH_FIELDS); j++) {
                        if (j > i) {
                            joined.append(' ');
                        }
                        joined.append(tokens.get(j));
                        if (values.contains(joined.toString())) {
                            return true;
                        }
                    }
                }
            }
            return false;
        }

        @Override
        public String toString() {
            return "Hidden[" + (values.size() + phrases.size()) + " candidates]";
        }
    }

    // 학습자가 이미 볼 수 있는 글의 색인. grams는 ASCII 구간마다 이어진 값 토큰 1~HIDDEN_WINDOW_FIELDS개를 공백으로 이은 것,
    // phrases는 줄마다 공백·쉼표로 나눈 값을 이은 것(한글이 섞인 후보용)이다. 지수 표기(10^9, 2 × 10^5, 10⁹, 10<sup>9</sup>, 1e9,
    // 10^9 + 7)는 그 수로도 넣는다. 제약의 최대값이 비공개 입력 한 줄과 같아도 비공개 값으로 보지 않게 한다.
    private record OpenIndex(Set<String> grams, String phrases) {

        static OpenIndex of(List<String> texts) {
            Set<String> grams = new HashSet<>();
            StringBuilder phrases = new StringBuilder("\n");
            for (String raw : texts) {
                for (String variant : variants(plain(raw) + "\n" + String.join("\n", powers(raw)))) {
                    for (String line : variant.split("\\R")) {
                        phrases.append(' ').append(String.join(" ", fields(line))).append(" \n");
                        for (String segment : AnswerGuard.NON_ASCII.split(line)) {
                            List<String> tokens = valueTokens(segment);
                            for (int i = 0; i < tokens.size(); i++) {
                                StringBuilder gram = new StringBuilder();
                                for (int n = 0; n < HIDDEN_WINDOW_FIELDS && i + n < tokens.size(); n++) {
                                    if (n > 0) {
                                        gram.append(' ');
                                    }
                                    grams.add(gram.append(tokens.get(i + n)).toString());
                                }
                            }
                        }
                    }
                }
            }
            return new OpenIndex(grams, phrases.toString());
        }

        // 토큰이 HIDDEN_WINDOW_FIELDS개보다 많으면 그 안의 조각이 모두 공개 글에 있을 때 공개 값으로 본다.
        boolean hasTokens(List<String> tokens) {
            if (tokens.size() <= HIDDEN_WINDOW_FIELDS) {
                return grams.contains(String.join(" ", tokens));
            }
            for (int i = 0; i + HIDDEN_WINDOW_FIELDS <= tokens.size(); i++) {
                if (!grams.contains(String.join(" ", tokens.subList(i, i + HIDDEN_WINDOW_FIELDS)))) {
                    return false;
                }
            }
            return true;
        }

        boolean hasPhrase(String phrase) {
            return phrases.contains(" " + phrase + " ");
        }
    }

    // 값 토큰: 부호·소수점이 붙은 수, 영문 낱말, 쉼표 밖의 ASCII 기호 묶음. 공백·쉼표와 ASCII 밖 글자는 경계다.
    private static List<String> valueTokens(String text) {
        List<String> tokens = new ArrayList<>();
        Matcher matcher = VALUE_TOKEN.matcher(text);
        while (matcher.find()) {
            tokens.add(matcher.group());
        }
        return tokens;
    }

    // 천 단위 쉼표를 지운 글("1,000,000" → 1000000)과 지우지 않은 글("[100,200,300,400]" → 100 200 300 400)
    private static List<String> variants(String text) {
        String withoutThousands = THOUSANDS.matcher(text).replaceAll("");
        return withoutThousands.equals(text) ? List.of(text) : List.of(withoutThousands, text);
    }

    // 지수 표기를 펼친 수. 원문(NFKC 전)에서 찾는다. NFKC는 "10⁹"를 "109"로 바꾼다.
    static List<String> powers(String raw) {
        if (raw == null) {
            return List.of();
        }
        StringBuilder text = new StringBuilder();
        Matcher sup = SUPERSCRIPT.matcher(SUP_TAG.matcher(raw).replaceAll("$1^$2"));
        while (sup.find()) {
            StringBuilder exponent = new StringBuilder();
            sup.group(2).codePoints().forEach(c -> exponent.append(SUPERSCRIPT_DIGITS.indexOf(c)));
            sup.appendReplacement(text, sup.group(1) + "^" + exponent);
        }
        sup.appendTail(text);
        List<String> values = new ArrayList<>();
        Matcher power = POWER.matcher(text);
        while (power.find()) {
            BigDecimal mantissa = power.group(1) == null ? BigDecimal.ONE : new BigDecimal(power.group(1));
            addPower(values, mantissa, power.group(2), power.group(3), power.group(4), power.group(5));
        }
        Matcher scientific = SCIENTIFIC.matcher(text);
        while (scientific.find()) {
            addPower(values, new BigDecimal(scientific.group(1)), "10", scientific.group(2), scientific.group(3),
                    scientific.group(4));
        }
        return values;
    }

    private static void addPower(List<String> values, BigDecimal mantissa, String base, String exponent, String sign,
            String offset) {
        // 펼친 수가 19자리(long)를 넘으면 쓰지 않는다. 10^18, 2^63까지다.
        if (base.length() > 3 || exponent.length() > 2 || Integer.parseInt(exponent) > 63) {
            return;
        }
        BigDecimal value = mantissa.multiply(new BigDecimal(base).pow(Integer.parseInt(exponent)));
        if (value.stripTrailingZeros().scale() > 0 || value.toBigInteger().toString().length() > 19) {
            return;
        }
        values.add(value.toBigInteger().toString());
        if (sign != null) {
            BigDecimal shifted = sign.equals("+") ? value.add(new BigDecimal(offset)) : value.subtract(new BigDecimal(offset));
            values.add(shifted.toBigInteger().toString());
        }
    }

    // 공백·쉼표로 나눈 값. 값 앞뒤의 따옴표·괄호·문장 부호는 뗀다.
    private static List<String> fields(String text) {
        List<String> fields = new ArrayList<>();
        for (String raw : FIELD_SEPARATOR.split(text)) {
            int start = 0;
            int end = raw.length();
            while (start < end && FIELD_PUNCTUATION.indexOf(raw.charAt(start)) >= 0) {
                start++;
            }
            while (end > start && FIELD_PUNCTUATION.indexOf(raw.charAt(end - 1)) >= 0) {
                end--;
            }
            if (start < end) {
                fields.add(raw.substring(start, end));
            }
        }
        return fields;
    }

    // ===== 글 정리 =====

    // 응답 글: 전각 글자·수학 기호를 ASCII로(AnswerGuard.normalize)
    private static String normalize(String text) {
        return text == null ? "" : AnswerGuard.normalize(text);
    }

    // 대조용: 정규화하고 천 단위 쉼표를 지운다
    private static String clean(String text) {
        return THOUSANDS.matcher(normalize(text)).replaceAll("");
    }

    // 비공개·공개 원문과 비공개 값을 맞춰 볼 응답: 따옴표와 상관없이 NFKC로 바꾼다. 천 단위 쉼표는 variants가 두 형태로 본다.
    private static String plain(String text) {
        return text == null ? "" : Normalizer.normalize(text, Normalizer.Form.NFKC).replace('−', '-');
    }

    private static String collapse(String text) {
        return WHITESPACE.matcher(text).replaceAll(" ").strip();
    }

    // "3.0"과 "3", "007"과 "7"을 같게 본다
    private static String canonical(String number) {
        try {
            return new BigDecimal(number).stripTrailingZeros().toPlainString();
        } catch (NumberFormatException e) {
            return number;
        }
    }
}
