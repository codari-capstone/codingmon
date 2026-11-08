package com.codingmon.api.ai;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

// 정답 코드 금지 검사(AI_FEATURES 8절, #78). F1·F2 응답과 F3 코드 리뷰 응답(#82)의 글마다 아래 규칙을 보고 어긴 곳을 돌려준다.
// 어기면 AiReviewRunner가 지시를 강화해 한 번 다시 만들고, 또 어기면 결과를 보여 주지 않는다.
// 코드 리뷰에는 ALGORITHM_NAME을 쓰지 않는다. 학습자는 이미 맞혔고, 리뷰는 다음에 배울 개념의 이름을 알려 주는 것이 목적이다.
// 학습자 코드를 그대로 옮긴 글은 정답이 아니므로 코드 모양 검사와 정답 유사도에서 뺀다. 지문이나 학습자 코드에 이미 나온
// 알고리즘 이름도 새로 알려 주는 것이 아니므로 뺀다. 코드 블록과 들여 쓴 코드 줄은 무엇을 옮겼든 위반이다.
// 검사 결과(Violation)에는 응답 글을 담지 않는다. 로그에 남기므로 제출 코드나 정답 코드가 섞이면 안 된다.
final class AnswerGuard {

    enum Rule {
        CODE_BLOCK("코드 블록(```)을 썼다"),
        INDENTED_CODE("들여 쓴 코드 줄을 썼다"),
        CODE_PATTERN("함수 호출, 변수 선언, 반복문·조건문의 머리처럼 코드에 그대로 옮겨 넣을 수 있는 글을 썼다"),
        REFERENCE_SIMILAR("정답 코드와 같은 코드 조각을 썼다"),
        ALGORITHM_NAME("개념 태그나 알고리즘의 이름을 그대로 썼다");

        final String description;

        Rule(String description) {
            this.description = description;
        }
    }

    // field는 "summary", "facts[0]", "hints.direction" 꼴이다. tag는 ALGORITHM_NAME일 때 걸린 개념 태그다.
    record Violation(Rule rule, String field, String tag) {
    }

    // sourceCode는 학습자가 낸 코드 원문, sourceLanguage는 그 언어(PYTHON, CPP), problemText는 제목·지문·입출력 설명·제약을
    // 이은 글이다. referenceSolutions는 그 문제 버전의 검증 정답 코드다. 사용자에게도 모델에게도 보내지 않는다.
    // toString에는 코드를 넣지 않는다. 로그나 예외 메시지에 실수로 넣어도 정답 코드가 남지 않게 한다.
    record Context(String sourceCode, String sourceLanguage, String problemText, List<String> conceptTags,
            List<Reference> referenceSolutions) {

        Context {
            sourceCode = sourceCode == null ? "" : sourceCode;
            problemText = problemText == null ? "" : problemText;
            conceptTags = List.copyOf(conceptTags);
            referenceSolutions = List.copyOf(referenceSolutions);
        }

        @Override
        public String toString() {
            return "Context[sourceCode=" + sourceCode.length() + " chars, sourceLanguage=" + sourceLanguage
                    + ", conceptTags=" + conceptTags + ", referenceSolutions=" + referenceSolutions + "]";
        }
    }

    // language는 reference_solutions.language(PYTHON, CPP)다. 주석 모양이 언어마다 달라 함께 둔다.
    record Reference(String language, String code) {

        @Override
        public String toString() {
            return "Reference[language=" + language + ", code=" + (code == null ? 0 : code.length()) + " chars]";
        }
    }

    // 정답 코드와 이만큼 이어서 같은 토큰이 나오면 같은 코드 조각으로 본다. 단, 그 안에 코드에만 나오는 토큰(STRUCTURAL)이
    // 둘 이상 있어야 한다. 3단계 힌트는 규칙을 식으로 보여 주므로 "2 * (n - i) + 1"처럼 정답 코드와 같은 식이 나올 수 있다.
    static final int MIN_SHARED_TOKENS = 8;
    static final int MIN_STRUCTURAL_TOKENS = 2;

    private static final String NO_HANGUL = "[^\\n\\p{IsHangul}]";

    // 언어 키워드가 이어지는 꼴(AI-002). 하나라도 맞고 그 글이 학습자 코드에 없으면 위반이다.
    private static final List<Pattern> CODE_PATTERNS = List.of(
            // Python
            Pattern.compile("\\bfor\\s+[A-Za-z_]\\w*(?:\\s*,\\s*[A-Za-z_]\\w*)*\\s+in\\s+" + NO_HANGUL + "{1,60}:"),
            Pattern.compile("\\b(?:if|elif|while)\\s+" + NO_HANGUL + "{1,60}:(?!\\d)"),
            Pattern.compile("\\belse\\s*:"),
            Pattern.compile("\\bdef\\s+[A-Za-z_]\\w*\\s*\\("),
            Pattern.compile("\\bimport\\s+[A-Za-z_][\\w.]*|\\bfrom\\s+[A-Za-z_][\\w.]*\\s+import\\b"),
            Pattern.compile("\\blambda\\b[^:\\n\\p{IsHangul}]{0,30}:"),
            // C++
            Pattern.compile("#\\s*include\\b|\\busing\\s+namespace\\b|\\bint\\s+main\\s*\\(|\\bstd\\s*::"),
            // 입출력 문장은 끝까지 맞춘다. 학습자 코드의 "cin >> a >> b"를 짚은 글과 ";"를 붙여 고친 글을 가리려는 것이다.
            // 한글, 쉼표, 백틱이 나오면 설명 글로 돌아온 것으로 보고 거기서 끊는다.
            Pattern.compile("\\b(?:cout|cerr)\\s*<<[^;\\n\\p{IsHangul},`]*;?|\\bcin\\s*>>[^;\\n\\p{IsHangul},`]*;?"),
            Pattern.compile("\\bfor\\s*\\([^)\\n\\p{IsHangul}]*;[^)\\n\\p{IsHangul}]*;[^)\\n\\p{IsHangul}]*\\)"),
            Pattern.compile("\\b(?:if|while|switch)\\s*\\([^)\\n]*\\)\\s*\\{"),
            Pattern.compile("\\b(?:int|long|short|unsigned|double|float|char|bool|string|auto|void|size_t|int64_t)"
                    + "\\s+[A-Za-z_]\\w*(?:\\s*[=;\\[({,]|(?=\\s*(?:\\p{IsHangul}|$)))"),
            Pattern.compile("\\b(?:long\\s+long|unsigned\\s+long|long\\s+double)\\s+[A-Za-z_]\\w*"),
            Pattern.compile("\\bvector\\s*<"),
            Pattern.compile("\\breturn\\b[^\\n\\p{IsHangul};]{0,40};"),
            // 세미콜론으로 끝나는 문장이 둘 이어진다. 사이에 한글이 있으면 설명 글이다(예: "세미콜론(;)을 ... (;)").
            Pattern.compile("[\\w)\\]'\"]\\s*;[^;\\n\\p{IsHangul}]{1,80};"),
            // 복합 대입과 증감 연산자. "C++"은 언어 이름이다.
            Pattern.compile("[A-Za-z_][\\w\\[\\]]*\\s*(?:\\+=|-=|\\*=|/=|%=|<<=|>>=)\\s*[\\w(]"),
            // 좌변 변수가 우변에 다시 나오는 대입(i = i + 1). 수식 설명("n = 3일 때", "S = n * (n + 1) / 2")과 겹치지 않는다.
            Pattern.compile("(?<![\\w.])([A-Za-z_]\\w*)\\s*=\\s*\\1\\s*[-+*/%]\\s*[\\w(]"),
            Pattern.compile("\\b(?![Cc]\\+\\+)[A-Za-z_]\\w*\\+\\+|(?<![\\w+])\\+\\+[A-Za-z_]\\w*|\\b[A-Za-z_]\\w*--(?!-)"));

    // 함수·메서드 호출의 머리. 괄호는 짝이 맞을 때까지 세어(callEnd) 인자 전체를 맞춘다. 학습자 코드의 호출과 고친 호출을
    // 가린다(range(n + 1)은 인용, range(n)은 고친 것). 중첩 깊이에 제한이 없다(print(sum(map(int, input().split())))).
    // LIBRARY_CALLS는 더 나은 풀이로 이끌 때 나오기 쉬운 라이브러리 함수다(코드 리뷰, #82). 예: bisect_right(a, x), sort(v.begin(), v.end())
    // sqrt·gcd·lcm처럼 식에도 쓰는 이름은 넣지 않는다. 3단계 원리가 "약수는 sqrt(n)까지", "lcm(a, b) = a × b / gcd(a, b)"를
    // 식으로 보여 줄 수 있다.
    private static final String LIBRARY_CALLS = "bisect|bisect_left|bisect_right|insort|heappush|heappop|heapify"
            + "|Counter|defaultdict|deque|accumulate|permutations|combinations"
            + "|sort|stable_sort|lower_bound|upper_bound|binary_search|next_permutation|unique|fill|swap";
    private static final List<Pattern> CALL_HEADS = List.of(
            Pattern.compile("(?<![\\w.])(?:range|print|input|len|map|list|int|str|split|join|sorted|enumerate|zip|open"
                    + "|sum|set|dict|tuple|max|min|abs|any|all|reversed|round|pow|divmod|ord|chr"
                    + "|readline|printf|scanf|getline|puts|getchar|memset|sizeof|strlen|" + LIBRARY_CALLS + ")\\s*\\("),
            Pattern.compile("\\.\\s*(?:append|add|extend|update|remove|discard|setdefault|sort|split|join|strip|rstrip"
                    + "|lower|upper|replace|pop|push_back|pop_back|insert|reverse|items|keys|values|get|count|index"
                    + "|find|substr|size|length|begin|end|readline|" + LIBRARY_CALLS + ")\\s*\\("));

    // 대입. ==, !=, <=, >=, += 같은 연산자는 뺀다.
    private static final Pattern ASSIGNMENT = Pattern.compile(
            "(?<![\\w.])([A-Za-z_]\\w*)\\s*(?:\\[[^\\]\\n]*\\])?\\s*=(?![=])");
    private static final Pattern NUMBER = Pattern.compile("-?[0-9]+(?:\\.[0-9]+)?");

    // 들여 쓴 줄은 주석(#, //) 앞부분에 한글이 없거나 코드 기호가 있으면 코드 줄로 본다. "n = 3일 때"처럼 들여 쓴 설명 글은
    // 넘기고, "n = n - 1  # 한 줄 줄이기"처럼 한글 주석을 단 코드는 잡는다.
    private static final Pattern INDENTED = Pattern.compile("(?m)^(?: {4,}|\\t)\\S.*$");
    private static final Pattern HANGUL = Pattern.compile("\\p{IsHangul}");
    private static final Pattern CODE_SYMBOL = Pattern.compile("[;{}]|[A-Za-z_]\\w*\\(");
    // 한글이 없는 들여 쓴 줄도 영문자나 코드 기호가 있어야 코드로 본다. 별 모양 출력("*****")이나 수 나열은 코드가 아니다.
    private static final Pattern CODE_CHAR = Pattern.compile("[A-Za-z_=;{}()\\[\\]]");
    private static final Pattern LINE_COMMENT = Pattern.compile("#|//");
    // 인용 비교에서 문장을 넓힐 때 앞에 붙은 이름과 끝에서 뺄 문장 부호(statement)
    private static final Pattern STATEMENT_HEAD = Pattern.compile("[\\w.\\[\\]]");
    private static final Pattern STATEMENT_TAIL = Pattern.compile("[\\s.,:!?]+$");
    // 코드 낱말 뒤에 붙는 조사. 이것이 붙은 낱말("0으로", "b가")은 코드의 일부로 본다.
    private static final Pattern PARTICLE = Pattern.compile(
            "(?:으로|로|을|를|이|가|은|는|와|과|의|에|도|만|까지|부터|처럼|이다|입니다|이고|이면|라고|이라고)");

    // 개념 태그 중 알고리즘 이름이 아닌 것. 반복문·조건문·문자열 같은 말은 오답 설명에 늘 나오므로 검사하지 않는다.
    // "출력 형식"은 판정 이름("출력 형식이 잘못되었습니다")에도 들어 있다.
    // 여기에 없는 태그는 이름 그대로 검사한다(새 알고리즘 태그를 빠뜨리지 않게). 공백을 뺀 이름으로 적는다.
    private static final Set<String> GENERAL_CONCEPTS = Set.of("반복문범위", "반복문", "조건문", "나머지연산", "문자열",
            "인덱스변환", "배열", "2차원배열", "구현", "수학", "사칙연산", "입출력", "출력형식", "입력형식", "자료형",
            "자료형범위", "정수범위", "리스트", "함수", "재귀");

    // 태그(공백을 뺀 이름)마다 같은 뜻의 다른 이름. 한글 이름은 띄어쓰기와 상관없이 찾는다.
    // 대문자 줄임말(DP, BFS)은 대소문자를 가린다. 학습자 코드의 dp·bfs 같은 변수 이름을 짚은 것은 이름을 알려 준 것이 아니다.
    private static final Map<String, List<String>> ALIASES = Map.ofEntries(
            Map.entry("동적계획법", List.of("동적 프로그래밍", "다이나믹 프로그래밍", "메모이제이션", "DP")),
            Map.entry("너비우선탐색", List.of("너비 우선", "넓이 우선 탐색", "BFS")),
            Map.entry("깊이우선탐색", List.of("깊이 우선", "DFS")),
            Map.entry("이분탐색", List.of("이진 탐색", "이분법", "binary search")),
            Map.entry("그리디", List.of("탐욕법", "탐욕 알고리즘", "greedy")),
            Map.entry("누적합", List.of("부분합", "prefix sum")),
            Map.entry("투포인터", List.of("두 포인터", "two pointer")),
            Map.entry("해시맵", List.of("해시", "딕셔너리", "hash", "dictionary")),
            Map.entry("스택", List.of("stack")),
            Map.entry("큐", List.of("queue")),
            Map.entry("정렬", List.of("sorting")),
            Map.entry("완전탐색", List.of("브루트 포스", "전수 조사", "brute force")),
            Map.entry("백트래킹", List.of("backtracking")),
            Map.entry("분할정복", List.of("divide and conquer")),
            Map.entry("다익스트라", List.of("Dijkstra")),
            Map.entry("유니온파인드", List.of("분리 집합", "union find")),
            Map.entry("비트마스킹", List.of("비트마스크", "bitmask")),
            Map.entry("슬라이딩윈도우", List.of("sliding window")));

    // 묶음 안의 어느 이름으로 태그가 붙어도 같은 묶음을 찾는다(태그 "해시"와 키 "해시맵", 태그 "이진 탐색"과 키 "이분탐색").
    private static final Map<String, List<String>> ALIAS_GROUPS = aliasGroups();

    // 이름 뒤에 이 말이 오면 알고리즘 이름이 아니다. 런타임 에러 설명의 "스택 오버플로", "스택 영역" 같은 것.
    private static final Map<String, String> NOT_ALGORITHM_AFTER = Map.of(
            "스택", "\\s*(?:오버플로|오버 플로|넘침|넘쳤|영역|메모리|공간|크기|깊이|프레임)",
            "stack", "\\s*(?:overflow|size|memory|frame)");

    // 코드에만 나오는 토큰. 수식에도 쓰는 괄호·사칙연산·=은 넣지 않는다.
    private static final Set<String> STRUCTURAL = Set.of(";", "{", "}", "[", "]", ":", "+=", "-=", "*=", "/=", "%=",
            "++", "--", "<<", ">>", "==", "!=", "&&", "||", "->", "::", "for", "while", "if", "elif", "else", "def",
            "return", "print", "range", "input", "len", "int", "long", "cout", "cin", "include", "using", "namespace",
            "main", "import", "from", "in", "and", "or", "not", "break", "continue", "vector", "auto", "void", "map",
            "split", "append", "sorted", "printf", "scanf");

    // 문자열 리터럴은 한 토큰이다. ' '와 ''처럼 안의 공백만 다른 리터럴을 같은 것으로 보지 않는다.
    // 리터럴은 소유형 수량자로 찾는다. 글자마다 되돌아갈 자리를 남기면 수천 자 리터럴에서 StackOverflowError가 난다.
    private static final Pattern TOKEN = Pattern.compile("'(?:[^'\\\\\\n]++|\\\\.)*+'|\"(?:[^\"\\\\\\n]++|\\\\.)*+\""
            + "|[A-Za-z_][A-Za-z0-9_]*|[0-9]+(?:\\.[0-9]+)?"
            + "|<<=|>>=|\\*\\*=|//=|->|\\+\\+|--|<<|>>|<=|>=|==|!=|&&|\\|\\||\\+=|-=|\\*=|/=|%=|\\*\\*|//|::"
            + "|[!-/:-@\\[-^`{-~]");
    // 응답 글은 한글 같은 ASCII 밖 글자에서 끊어, 코드처럼 이어진 부분끼리만 정답 코드와 비교한다.
    private static final Pattern NON_ASCII = Pattern.compile("[^\\x00-\\x7F]+");
    // 복잡도 표기. 괄호 안이 두 겹까지 중첩될 수 있다(O(sqrt(n)), O(max(n, m) log n)). 코드 모양 검사에서는 지운다.
    // max·min은 코드 모양 검사의 함수 이름이기도 해서, 지우지 않으면 정상 표기 "O(max(N, M))"가 호출로 보인다.
    private static final Pattern BIG_O = Pattern.compile(
            "\\bO\\s*\\((?:[^()\\n]|\\((?:[^()\\n]|\\([^()\\n]*\\))*\\))*\\)");

    private AnswerGuard() {
    }

    // 코드 리뷰(F3)에 쓰는 규칙. 알고리즘 이름은 리뷰가 알려 줄 내용이라 뺀다.
    static final Set<Rule> CODE_REVIEW_RULES = Set.copyOf(EnumSet.complementOf(EnumSet.of(Rule.ALGORITHM_NAME)));

    static List<Violation> check(AnalysisResult result, Context context) {
        return check(fields(result), context, EnumSet.allOf(Rule.class));
    }

    static List<Violation> check(CodeReviewResult result, Context context) {
        return check(fields(result), context, CODE_REVIEW_RULES);
    }

    private static List<Violation> check(Map<String, String> fields, Context context, Set<Rule> rules) {
        String source = normalize(context.sourceCode());
        String compactSource = compact(source);
        Set<String> assigned = assignedNames(stripComments(source, context.sourceLanguage()));
        String sourceTokens = join(tokens(source));
        List<List<String>> references = context.referenceSolutions().stream()
                .map(reference -> tokens(stripComments(normalize(reference.code()), reference.language())))
                .toList();
        List<Name> names = rules.contains(Rule.ALGORITHM_NAME)
                ? names(context, stripComments(source, context.sourceLanguage()))
                : List.of();

        List<Violation> violations = new ArrayList<>();
        fields.forEach((field, raw) -> {
            String text = normalize(raw);
            if (rules.contains(Rule.CODE_BLOCK) && (text.contains("```") || text.contains("~~~"))) {
                violations.add(new Violation(Rule.CODE_BLOCK, field, null));
            }
            if (rules.contains(Rule.INDENTED_CODE) && indentedCode(text)) {
                violations.add(new Violation(Rule.INDENTED_CODE, field, null));
            }
            if (rules.contains(Rule.CODE_PATTERN)
                    && codePattern(BIG_O.matcher(text).replaceAll("O()"), compactSource, assigned)) {
                violations.add(new Violation(Rule.CODE_PATTERN, field, null));
            }
            if (rules.contains(Rule.REFERENCE_SIMILAR) && similar(text, references, sourceTokens)) {
                violations.add(new Violation(Rule.REFERENCE_SIMILAR, field, null));
            }
            names.stream().filter(name -> name.pattern().matcher(text).find()).map(Name::tag).distinct()
                    .forEach(tag -> violations.add(new Violation(Rule.ALGORITHM_NAME, field, tag)));
        });
        return List.copyOf(violations);
    }

    // 로그에 남길 꼴. 예: CODE_PATTERN@hints.direction,ALGORITHM_NAME@summary(동적 계획법)
    static String describe(List<Violation> violations) {
        return violations.stream()
                .map(v -> v.rule() + "@" + v.field() + (v.tag() == null ? "" : "(" + v.tag() + ")"))
                .collect(Collectors.joining(","));
    }

    private static Map<String, String> fields(AnalysisResult result) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("summary", result.summary());
        for (int i = 0; i < result.facts().size(); i++) {
            fields.put("facts[" + i + "]", result.facts().get(i));
        }
        for (int i = 0; i < result.guesses().size(); i++) {
            fields.put("guesses[" + i + "]", result.guesses().get(i));
        }
        fields.put("hints.observation", result.hints().observation());
        fields.put("hints.direction", result.hints().direction());
        fields.put("hints.principle", result.hints().principle());
        return fields;
    }

    private static Map<String, String> fields(CodeReviewResult result) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("summary", result.summary());
        CodeReviewResult.Complexity complexity = result.complexity();
        fields.put("complexity.basis", complexity.basis());
        fields.put("complexity.time", complexity.time());
        fields.put("complexity.space", complexity.space());
        fields.put("complexity.intendedTime", complexity.intendedTime());
        fields.put("complexity.comparison", complexity.comparison());
        for (int i = 0; i < result.improvements().size(); i++) {
            fields.put("improvements[" + i + "]", result.improvements().get(i));
        }
        for (int i = 0; i < result.nextConcepts().size(); i++) {
            fields.put("nextConcepts[" + i + "].name", result.nextConcepts().get(i).name());
            fields.put("nextConcepts[" + i + "].reason", result.nextConcepts().get(i).reason());
        }
        return fields;
    }

    private static boolean indentedCode(String text) {
        Matcher lines = INDENTED.matcher(text);
        while (lines.find()) {
            String line = lines.group();
            String code = LINE_COMMENT.split(line, 2)[0];
            if ((!HANGUL.matcher(code).find() && CODE_CHAR.matcher(code).find()) || CODE_SYMBOL.matcher(line).find()) {
                return true;
            }
        }
        return false;
    }

    // 맞은 글이 학습자 코드에 그대로 있으면 인용이다. 패턴은 문장의 앞부분(int sum =, .append(x))만 맞추기도 하므로
    // 그 문장 전체(statement)도 학습자 코드에 있어야 인용으로 본다. 초기값이나 호출 대상만 바꾼 글을 가리려는 것이다.
    private static boolean codePattern(String text, String compactSource, Set<String> assigned) {
        for (Pattern pattern : CODE_PATTERNS) {
            Matcher matcher = pattern.matcher(text);
            while (matcher.find()) {
                if (!quotedStatement(text, matcher.start(), matcher.end(), compactSource)) {
                    return true;
                }
            }
        }
        for (Pattern head : CALL_HEADS) {
            Matcher matcher = head.matcher(text);
            while (matcher.find()) {
                int end = callEnd(text, matcher.end() - 1);
                if (end > 0 && !quotedStatement(text, matcher.start(), end, compactSource)) {
                    return true;
                }
            }
        }
        // 학습자 코드에서 값을 넣는 변수에 다른 값을 넣는 글(c = a + b). 수식 설명("S = n * (n + 1) / 2")의 S는 보통
        // 학습자 코드의 변수가 아니다. 값이 수 하나인 것("n = 3이면")은 예시로 보고 넘긴다.
        Matcher matcher = ASSIGNMENT.matcher(text);
        while (matcher.find()) {
            if (assigned.contains(matcher.group(1))) {
                String statement = statement(text, matcher.start(), matcher.end());
                String value = statement.substring(Math.min(statement.length(), statement.indexOf('=') + 1)).strip();
                if (!value.isEmpty() && !NUMBER.matcher(value).matches()
                        && !quoted(compactSource, compact(statement))) {
                    return true;
                }
            }
        }
        return false;
    }

    // 학습자 코드에서 = 로 값을 넣는 변수 이름(a[i] = 의 a 포함)
    private static Set<String> assignedNames(String code) {
        Set<String> names = new HashSet<>();
        Matcher matcher = ASSIGNMENT.matcher(code);
        while (matcher.find()) {
            names.add(matcher.group(1));
        }
        return names;
    }

    private static boolean quotedStatement(String text, int start, int end, String compactSource) {
        return quoted(compactSource, compact(text.substring(start, end)))
                && quoted(compactSource, compact(statement(text, start, end)));
    }

    // open 자리의 여는 괄호와 짝인 닫는 괄호 다음 자리. 따옴표 밖에 한글이 있거나("int(32비트 정수)") 줄이 바뀌거나
    // 짝이 없으면 호출이 아니므로 -1이다. print('별')의 한글은 따옴표 안이라 호출이다. 따옴표 안의 \\는 다음 글자를 건너뛴다.
    // 길이는 제한하지 않는다(응답 필드 길이는 스키마가 막는다).
    private static int callEnd(String text, int open) {
        int depth = 0;
        char quote = 0;
        for (int i = open; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '\n') {
                return -1;
            }
            if (quote != 0) {
                if (c == '\\') {
                    i++;
                } else if (c == quote) {
                    quote = 0;
                }
            } else if (c == '\'' || c == '"') {
                quote = c;
            } else if (HANGUL.matcher(String.valueOf(c)).matches()) {
                return -1;
            } else if (c == '(') {
                depth++;
            } else if (c == ')' && --depth == 0) {
                return i + 1;
            }
        }
        return -1;
    }

    // 학습자 코드 안에 그 글이 있되, 앞뒤가 식별자 중간이 아니어야 한다(uint64_t 안의 int64_t는 인용이 아니다).
    static boolean quoted(String compactSource, String fragment) {
        if (fragment.isEmpty()) {
            return true;
        }
        boolean wordStart = isWord(fragment.charAt(0));
        boolean wordEnd = isWord(fragment.charAt(fragment.length() - 1));
        for (int at = compactSource.indexOf(fragment); at >= 0; at = compactSource.indexOf(fragment, at + 1)) {
            int after = at + fragment.length();
            if ((!wordStart || at == 0 || !isWord(compactSource.charAt(at - 1)))
                    && (!wordEnd || after == compactSource.length() || !isWord(compactSource.charAt(after)))) {
                return true;
            }
        }
        return false;
    }

    private static boolean isWord(char c) {
        return c == '_' || (c < 128 && Character.isLetterOrDigit(c));
    }

    // 맞은 곳을 앞으로는 붙어 있는 이름(a.append의 a)까지, 뒤로는 문장 끝까지 넓힌다. 한글·줄바꿈·백틱이나 괄호 밖의
    // ", "가 나오면 설명 글로 돌아온 것으로 보고, ;는 넣고 끊는다. 짝이 없는 닫는 괄호("4번 줄(range(1, n + 1))에서"의
    // 마지막 ")")에서도 끊고, 끝에 붙은 문장 부호는 뺀다. 괄호 깊이는 맞은 부분에서 이어받는다(int a[ 뒤의 10]).
    // 한글에서 끊을 때 바로 앞 낱말이 "n번", "3개"처럼 수를 세는 말에 붙어 있으면 그 낱말은 설명 글로 보고 뺀다.
    // "0으로", "b가"처럼 조사가 붙은 낱말은 코드의 일부로 남긴다.
    // 앞쪽은 대입 대상(answer = sum(a)의 answer)과 공백을 둔 호출 대상(b .append의 b)까지 넓힌다. 파이썬 머리처럼 맞은 부분이
    // :로 끝났거나 넓히다가 괄호 밖 :(::는 빼고)를 만나면 거기서 끊는다("for i in range(n): i가"의 i는 설명 글이다).
    private static String statement(String text, int start, int end) {
        start = head(text, start);
        if (text.substring(start, end).stripTrailing().endsWith(":")) {
            return STATEMENT_TAIL.matcher(text.substring(start, end)).replaceAll("");
        }
        int depth = Math.max(0, depth(text.substring(start, end)));
        char quote = 0;
        int lastSpace = -1;
        int limit = Math.min(text.length(), end + 120);
        while (end < limit) {
            char c = text.charAt(end);
            if (quote != 0) {
                if (c == '\n') {
                    break;
                }
                if (c == quote) {
                    quote = 0;
                }
            } else if (HANGUL.matcher(String.valueOf(c)).matches()) {
                if (lastSpace >= 0 && !Character.isWhitespace(text.charAt(end - 1))
                        && !PARTICLE.matcher(text.substring(end)).lookingAt()) {
                    end = lastSpace;
                }
                break;
            } else if (c == '\n' || c == '`') {
                break;
            } else if (Character.isWhitespace(c)) {
                lastSpace = end;
            } else if (c == ';') {
                end++;
                break;
            } else if (c == ':' && depth <= 0 && text.charAt(end - 1) != ':'
                    && (end + 1 == text.length() || text.charAt(end + 1) != ':')) {
                end++;
                break;
            } else if (c == '\'' || c == '"') {
                quote = c;
            } else if (c == '(' || c == '[' || c == '{') {
                depth++;
            } else if (c == ')' || c == ']' || c == '}') {
                if (--depth < 0) {
                    break;
                }
            } else if (c == ',' && depth <= 0 && end + 1 < text.length() && text.charAt(end + 1) == ' ') {
                break;
            }
            end++;
        }
        String statement = text.substring(start, end);
        return statement.endsWith(";") ? statement : STATEMENT_TAIL.matcher(statement).replaceAll("");
    }

    private static int head(String text, int start) {
        start = name(text, start);
        int i = start;
        while (i > 0 && text.charAt(i - 1) == ' ') {
            i--;
        }
        if (text.charAt(start) == '.' && i < start && i > 0 && isWord(text.charAt(i - 1))) {
            return name(text, i);
        }
        if (i > 0 && text.charAt(i - 1) == '=' && (i < 2 || "=!<>+-*/%&|^".indexOf(text.charAt(i - 2)) < 0)) {
            int j = i - 1;
            while (j > 0 && text.charAt(j - 1) == ' ') {
                j--;
            }
            int k = name(text, j);
            if (k < j) {
                return k;
            }
        }
        return start;
    }

    // start 앞에 붙어 있는 이름(a.b[i])의 시작 자리
    private static int name(String text, int start) {
        while (start > 0 && STATEMENT_HEAD.matcher(text.substring(start - 1, start)).matches()) {
            start--;
        }
        return start;
    }

    // 따옴표 밖의 여는 괄호 수에서 닫는 괄호 수를 뺀다.
    private static int depth(String code) {
        int depth = 0;
        char quote = 0;
        for (int i = 0; i < code.length(); i++) {
            char c = code.charAt(i);
            if (quote != 0) {
                if (c == quote) {
                    quote = 0;
                }
            } else if (c == '\'' || c == '"') {
                quote = c;
            } else if (c == '(' || c == '[' || c == '{') {
                depth++;
            } else if (c == ')' || c == ']' || c == '}') {
                depth--;
            }
        }
        return depth;
    }

    private static boolean similar(String text, List<List<String>> references, String sourceTokens) {
        if (references.isEmpty()) {
            return false;
        }
        for (String run : NON_ASCII.split(text)) {
            List<String> tokens = tokens(run);
            if (tokens.size() < MIN_SHARED_TOKENS) {
                continue;
            }
            for (List<String> reference : references) {
                if (sharesCode(tokens, reference, sourceTokens)) {
                    return true;
                }
            }
        }
        return false;
    }

    // 응답 토큰열과 정답 코드 토큰열에서 이어서 같은 부분을 끝 위치마다 구하고, 더 늘릴 수 없는 것만 본다.
    // 학습자 코드에도 그대로 있는 부분은 학습자 코드를 짚은 것이다(정답과 거의 같고 한 곳만 틀린 코드가 많다).
    private static boolean sharesCode(List<String> run, List<String> reference, String sourceTokens) {
        int n = run.size();
        int m = reference.size();
        int[] previous = new int[m + 1];
        int[] current = new int[m + 1];
        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= m; j++) {
                current[j] = run.get(i - 1).equals(reference.get(j - 1)) ? previous[j - 1] + 1 : 0;
                int length = current[j];
                if (length < MIN_SHARED_TOKENS || (i < n && j < m && run.get(i).equals(reference.get(j)))) {
                    continue;
                }
                List<String> shared = run.subList(i - length, i);
                if (shared.stream().filter(STRUCTURAL::contains).count() >= MIN_STRUCTURAL_TOKENS
                        && !sourceTokens.contains(join(shared))) {
                    return true;
                }
            }
            int[] swap = previous;
            previous = current;
            current = swap;
        }
        return false;
    }

    private record Name(String tag, Pattern pattern) {
    }

    // 문제 태그 중 알고리즘 이름과 그 다른 이름. 지문이나 학습자 코드에 이미 나온 이름은 뺀다. 학습자 코드는 주석을 뺀 것을
    // 받는다. 주석에 이름을 늘어놓아 검사를 끄지 못하게 한다(변수 이름 dp 같은 것은 그대로 뺀다).
    private static List<Name> names(Context context, String source) {
        String problem = normalize(context.problemText());
        List<Name> names = new ArrayList<>();
        for (String tag : context.conceptTags()) {
            String key = tag.replaceAll("\\s+", "");
            if (key.isEmpty() || GENERAL_CONCEPTS.contains(key)) {
                continue;
            }
            Set<String> all = new LinkedHashSet<>();
            all.add(tag);
            all.addAll(ALIAS_GROUPS.getOrDefault(aliasKey(tag), List.of()));
            for (String name : all) {
                Pattern pattern = namePattern(name);
                if (!pattern.matcher(problem).find() && !pattern.matcher(source).find()) {
                    names.add(new Name(tag, pattern));
                }
            }
        }
        return names;
    }

    private static Map<String, List<String>> aliasGroups() {
        Map<String, List<String>> groups = new HashMap<>();
        ALIASES.forEach((key, aliases) -> {
            List<String> group = new ArrayList<>();
            group.add(key);
            group.addAll(aliases);
            group.forEach(name -> groups.put(aliasKey(name), List.copyOf(group)));
        });
        return Map.copyOf(groups);
    }

    private static String aliasKey(String name) {
        return name.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }

    private static Pattern namePattern(String name) {
        String key = name.replaceAll("\\s+", "");
        String exclude = NOT_ALGORITHM_AFTER.get(key);
        String after = exclude == null ? "" : "(?!" + exclude + ")";
        if (HANGUL.matcher(key).find()) {
            String spaced = key.codePoints().mapToObj(c -> Pattern.quote(Character.toString(c)))
                    .collect(Collectors.joining("\\s*"));
            return Pattern.compile(spaced + after);
        }
        String words = List.of(name.strip().split("\\s+")).stream().map(Pattern::quote)
                .collect(Collectors.joining("[\\s_-]*"));
        int flags = name.equals(name.toUpperCase()) ? 0 : Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;
        return Pattern.compile("(?<![A-Za-z])" + words + "s?(?![A-Za-z])" + after, flags);
    }

    // 전각 글자와 수학 기호를 ASCII로 바꿔 "n − 1", "a × b"도 코드 토큰처럼 비교한다. 따옴표 안은 바꾸지 않는다.
    // print('×')와 print('*'), print('Ａ')와 print('A')는 다른 코드다. 둥근 따옴표와 전각 따옴표만은 따옴표를 알아보려고
    // 먼저 바꾼다. 따옴표는 줄이 바뀌면 닫는다(compact와 같다).
    static String normalize(String text) {
        String quotesFixed = text.replace('‘', '\'').replace('’', '\'').replace('“', '"').replace('”', '"')
                .replace('＇', '\'').replace('＂', '"');
        StringBuilder out = new StringBuilder(quotesFixed.length());
        StringBuilder plain = new StringBuilder();
        char quote = 0;
        for (int i = 0; i < quotesFixed.length(); i++) {
            char c = quotesFixed.charAt(i);
            if (quote != 0) {
                out.append(c);
                if (c == quote || c == '\n') {
                    quote = 0;
                }
            } else if (c == '\'' || c == '"') {
                out.append(plain(plain));
                plain.setLength(0);
                quote = c;
                out.append(c);
            } else {
                plain.append(c);
            }
        }
        return out.append(plain(plain)).toString();
    }

    // 따옴표 밖의 글. 전각 글자(NFKC)와 수학 기호를 ASCII로 바꾼다.
    private static String plain(CharSequence text) {
        return Normalizer.normalize(text, Normalizer.Form.NFKC)
                .replace('−', '-').replace('–', '-').replace('×', '*').replace('÷', '/')
                .replace("≤", "<=").replace("≥", ">=").replace("≠", "!=");
    }

    // 공백을 지워 띄어쓰기만 다른 인용도 학습자 코드와 맞춰 본다. 따옴표 안의 공백은 남긴다(' '.join과 ''.join은 다르다).
    // 식별자 글자 사이의 공백은 하나로 남긴다. "in range"가 "inrange"가 되면 식별자 경계(quoted)를 가릴 수 없다.
    // 문자열은 줄을 넘지 않는다고 보고 줄이 바뀌면 따옴표를 닫는다. 주석의 아포스트로피(don't)가 뒤 줄까지 번지지 않게 한다.
    static String compact(String text) {
        StringBuilder out = new StringBuilder(text.length());
        char quote = 0;
        boolean gap = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quote != 0) {
                if (c == '\n') {
                    quote = 0;
                    gap = true;
                    continue;
                }
                out.append(c);
                if (c == '\\' && i + 1 < text.length() && text.charAt(i + 1) != '\n') {
                    out.append(text.charAt(++i));
                } else if (c == quote) {
                    quote = 0;
                }
                continue;
            }
            if (Character.isWhitespace(c)) {
                gap = true;
                continue;
            }
            if (gap && !out.isEmpty() && isWord(out.charAt(out.length() - 1)) && isWord(c)) {
                out.append(' ');
            }
            gap = false;
            if (c == '\'' || c == '"') {
                quote = c;
            }
            out.append(c);
        }
        return out.toString();
    }

    // 정답 코드의 주석을 지운다. 파이썬은 #, C++는 //와 /* */만 주석이다. 파이썬의 //(몫)와 C++의 #include, 문자열 안의
    // #·//는 코드로 남긴다.
    static String stripComments(String code, String language) {
        boolean python = "PYTHON".equals(language);
        StringBuilder out = new StringBuilder(code.length());
        char quote = 0;
        for (int i = 0; i < code.length(); i++) {
            char c = code.charAt(i);
            if (quote != 0) {
                out.append(c);
                if (c == '\\' && i + 1 < code.length()) {
                    out.append(code.charAt(++i));
                } else if (c == quote || c == '\n') {
                    quote = 0;
                }
                continue;
            }
            if (c == '\'' || c == '"') {
                quote = c;
                out.append(c);
            } else if (python ? c == '#' : code.startsWith("//", i)) {
                int end = code.indexOf('\n', i);
                if (end < 0) {
                    break;
                }
                i = end - 1;
            } else if (!python && code.startsWith("/*", i)) {
                int end = code.indexOf("*/", i + 2);
                if (end < 0) {
                    break;
                }
                out.append(' ');
                i = end + 1;
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }

    static List<String> tokens(String code) {
        List<String> tokens = new ArrayList<>();
        Matcher matcher = TOKEN.matcher(code);
        while (matcher.find()) {
            tokens.add(matcher.group());
        }
        return tokens;
    }

    private static String join(List<String> tokens) {
        return tokens.stream().collect(Collectors.joining("\u0001", "\u0001", "\u0001"));
    }
}
