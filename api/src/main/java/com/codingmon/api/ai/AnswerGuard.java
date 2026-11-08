package com.codingmon.api.ai;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

// 정답 코드 금지 검사(AI_FEATURES 8절, #78). F1·F2 응답의 글마다 아래 규칙을 보고 어긴 곳을 돌려준다.
// 어기면 AnalysisService가 지시를 강화해 한 번 다시 만들고, 또 어기면 결과를 보여 주지 않는다.
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

    // sourceCode는 학습자가 낸 코드 원문, problemText는 제목·지문·입출력 설명·제약을 이은 글이다.
    // referenceSolutions는 그 문제 버전의 검증 정답 코드다. 사용자에게도 모델에게도 보내지 않는다.
    record Context(String sourceCode, String problemText, List<String> conceptTags,
            List<Reference> referenceSolutions) {

        Context {
            sourceCode = sourceCode == null ? "" : sourceCode;
            problemText = problemText == null ? "" : problemText;
            conceptTags = List.copyOf(conceptTags);
            referenceSolutions = List.copyOf(referenceSolutions);
        }
    }

    // language는 reference_solutions.language(PYTHON, CPP)다. 주석 모양이 언어마다 달라 함께 둔다.
    record Reference(String language, String code) {
    }

    // 정답 코드와 이만큼 이어서 같은 토큰이 나오면 같은 코드 조각으로 본다. 단, 그 안에 코드에만 나오는 토큰(STRUCTURAL)이
    // 둘 이상 있어야 한다. 3단계 힌트는 규칙을 식으로 보여 주므로 "2 * (n - i) + 1"처럼 정답 코드와 같은 식이 나올 수 있다.
    static final int MIN_SHARED_TOKENS = 8;
    static final int MIN_STRUCTURAL_TOKENS = 2;

    // 호출의 괄호. 따옴표 밖에 한글이 있으면 "int(32비트 정수)" 같은 설명 글이라 호출로 보지 않는다. print('별')은 호출이다.
    private static final String ARG = "(?:'[^'\\n]*'|\"[^\"\\n]*\"|[^()\\n'\"\\p{IsHangul}])";
    private static final String ARGS = "\\((?:" + ARG + "|\\(" + ARG + "*\\))*\\)";
    private static final String NO_HANGUL = "[^\\n\\p{IsHangul}]";

    // 언어 키워드가 이어지는 꼴(AI-002). 하나라도 맞고 그 글이 학습자 코드에 없으면 위반이다.
    private static final List<Pattern> CODE_PATTERNS = List.of(
            // Python
            Pattern.compile("\\bfor\\s+[A-Za-z_]\\w*(?:\\s*,\\s*[A-Za-z_]\\w*)*\\s+in\\s+" + NO_HANGUL + "{1,60}:"),
            Pattern.compile("\\b(?:if|elif|while)\\s+" + NO_HANGUL + "{1,60}:(?!\\d)"),
            Pattern.compile("\\belse\\s*:"),
            Pattern.compile("\\bdef\\s+[A-Za-z_]\\w*\\s*\\("),
            Pattern.compile("\\bimport\\s+[A-Za-z_][\\w.]*|\\bfrom\\s+[A-Za-z_][\\w.]*\\s+import\\b"),
            Pattern.compile("\\blambda\\b[^:\\n]{0,30}:"),
            // 함수·메서드 호출. 인자까지 맞춰 학습자 코드의 호출과 고친 호출을 가린다(예: range(n + 1)은 인용, range(n)은 고친 것).
            Pattern.compile("(?<![\\w.])(?:range|print|input|len|map|list|int|str|split|join|sorted|enumerate|zip|open"
                    + "|sum|set|dict|tuple|max|min|abs|any|all|reversed|round|pow|divmod|ord|chr"
                    + "|readline|printf|scanf|getline|puts|getchar|memset|sizeof|strlen)\\s*" + ARGS),
            Pattern.compile("\\.\\s*(?:append|add|extend|update|remove|discard|setdefault|sort|split|join|strip|rstrip"
                    + "|lower|upper|replace|pop|push_back|pop_back|insert|reverse|items|keys|values|get|count|index"
                    + "|find|substr|size|length|begin|end|readline)\\s*" + ARGS),
            // C++
            Pattern.compile("#\\s*include\\b|\\busing\\s+namespace\\b|\\bint\\s+main\\s*\\(|\\bstd\\s*::"),
            // 입출력 문장은 끝까지 맞춘다. 학습자 코드의 "cin >> a >> b"를 짚은 글과 ";"를 붙여 고친 글을 가리려는 것이다.
            // 한글, 쉼표, 백틱이 나오면 설명 글로 돌아온 것으로 보고 거기서 끊는다.
            Pattern.compile("\\b(?:cout|cerr)\\s*<<[^;\\n\\p{IsHangul},`]*;?|\\bcin\\s*>>[^;\\n\\p{IsHangul},`]*;?"),
            Pattern.compile("\\bfor\\s*\\([^)\\n]*;[^)\\n]*;[^)\\n]*\\)"),
            Pattern.compile("\\b(?:if|while|switch)\\s*\\([^)\\n]*\\)\\s*\\{"),
            Pattern.compile("\\b(?:int|long|short|unsigned|double|float|char|bool|string|auto|void|size_t|int64_t)"
                    + "\\s+[A-Za-z_]\\w*\\s*[=;\\[({,]"),
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

    // 들여 쓴 줄은 주석(#, //) 앞부분에 한글이 없거나 코드 기호가 있으면 코드 줄로 본다. "n = 3일 때"처럼 들여 쓴 설명 글은
    // 넘기고, "n = n - 1  # 한 줄 줄이기"처럼 한글 주석을 단 코드는 잡는다.
    private static final Pattern INDENTED = Pattern.compile("(?m)^(?: {4,}|\\t)\\S.*$");
    private static final Pattern HANGUL = Pattern.compile("\\p{IsHangul}");
    private static final Pattern CODE_SYMBOL = Pattern.compile("[;{}]|\\w\\(");
    private static final Pattern LINE_COMMENT = Pattern.compile("#|//");
    // 인용 비교에서 문장을 넓힐 때 앞에 붙은 이름과 끝에서 뺄 문장 부호(statement)
    private static final Pattern STATEMENT_HEAD = Pattern.compile("[\\w.\\[\\]]");
    private static final Pattern STATEMENT_TAIL = Pattern.compile("[\\s.,:!?]+$");

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
    private static final Pattern TOKEN = Pattern.compile("'(?:[^'\\\\\\n]|\\\\.)*'|\"(?:[^\"\\\\\\n]|\\\\.)*\""
            + "|[A-Za-z_][A-Za-z0-9_]*|[0-9]+(?:\\.[0-9]+)?"
            + "|<<=|>>=|\\*\\*=|//=|->|\\+\\+|--|<<|>>|<=|>=|==|!=|&&|\\|\\||\\+=|-=|\\*=|/=|%=|\\*\\*|//|::"
            + "|[!-/:-@\\[-^`{-~]");
    // 응답 글은 한글 같은 ASCII 밖 글자에서 끊어, 코드처럼 이어진 부분끼리만 정답 코드와 비교한다.
    private static final Pattern NON_ASCII = Pattern.compile("[^\\x00-\\x7F]+");

    private AnswerGuard() {
    }

    static List<Violation> check(AnalysisResult result, Context context) {
        String source = normalize(context.sourceCode());
        String compactSource = compact(source);
        String sourceTokens = join(tokens(source));
        List<List<String>> references = context.referenceSolutions().stream()
                .map(reference -> tokens(stripComments(normalize(reference.code()), reference.language())))
                .toList();
        List<Name> names = names(context, source);

        List<Violation> violations = new ArrayList<>();
        fields(result).forEach((field, raw) -> {
            String text = normalize(raw);
            if (text.contains("```") || text.contains("~~~")) {
                violations.add(new Violation(Rule.CODE_BLOCK, field, null));
            }
            if (indentedCode(text)) {
                violations.add(new Violation(Rule.INDENTED_CODE, field, null));
            }
            if (codePattern(text, compactSource)) {
                violations.add(new Violation(Rule.CODE_PATTERN, field, null));
            }
            if (similar(text, references, sourceTokens)) {
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

    private static boolean indentedCode(String text) {
        Matcher lines = INDENTED.matcher(text);
        while (lines.find()) {
            String line = lines.group();
            String code = LINE_COMMENT.split(line, 2)[0];
            if ((!code.isBlank() && !HANGUL.matcher(code).find()) || CODE_SYMBOL.matcher(line).find()) {
                return true;
            }
        }
        return false;
    }

    // 맞은 글이 학습자 코드에 그대로 있으면 인용이다. 패턴은 문장의 앞부분(int sum =, .append(x))만 맞추기도 하므로
    // 그 문장 전체(statement)도 학습자 코드에 있어야 인용으로 본다. 초기값이나 호출 대상만 바꾼 글을 가리려는 것이다.
    private static boolean codePattern(String text, String compactSource) {
        for (Pattern pattern : CODE_PATTERNS) {
            Matcher matcher = pattern.matcher(text);
            while (matcher.find()) {
                if (!compactSource.contains(compact(matcher.group()))
                        || !compactSource.contains(compact(statement(text, matcher.start(), matcher.end())))) {
                    return true;
                }
            }
        }
        return false;
    }

    // 맞은 곳을 앞으로는 붙어 있는 이름(a.append의 a)까지, 뒤로는 문장 끝까지 넓힌다. 한글·줄바꿈·백틱이나 괄호 밖의
    // ", "가 나오면 설명 글로 돌아온 것으로 보고, ;는 넣고 끊는다. 끝에 붙은 닫는 괄호와 문장 부호는 뺀다
    // 짝이 없는 닫는 괄호("4번 줄(range(1, n + 1))에서"의 마지막 ")")에서도 끊는다.
    private static String statement(String text, int start, int end) {
        while (start > 0 && STATEMENT_HEAD.matcher(text.substring(start - 1, start)).matches()) {
            start--;
        }
        int depth = 0;
        char quote = 0;
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
            } else if (c == '\n' || c == '`' || HANGUL.matcher(String.valueOf(c)).matches()) {
                break;
            } else if (c == ';') {
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

    // 문제 태그 중 알고리즘 이름과 그 다른 이름. 지문이나 학습자 코드에 이미 나온 이름은 뺀다.
    private static List<Name> names(Context context, String source) {
        String problem = normalize(context.problemText());
        List<Name> names = new ArrayList<>();
        for (String tag : context.conceptTags()) {
            String key = tag.replaceAll("\\s+", "");
            if (key.isEmpty() || GENERAL_CONCEPTS.contains(key)) {
                continue;
            }
            List<String> all = new ArrayList<>();
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

    // 전각 글자와 수학 기호를 ASCII로 바꿔 "n − 1", "a × b"도 코드 토큰처럼 비교한다.
    static String normalize(String text) {
        return Normalizer.normalize(text, Normalizer.Form.NFKC)
                .replace('−', '-').replace('–', '-').replace('×', '*').replace('÷', '/')
                .replace("≤", "<=").replace("≥", ">=").replace("≠", "!=")
                .replace('‘', '\'').replace('’', '\'').replace('“', '"').replace('”', '"');
    }

    // 공백을 지워 띄어쓰기만 다른 인용도 학습자 코드와 맞춰 본다. 따옴표 안의 공백은 남긴다(' '.join과 ''.join은 다르다).
    // 문자열은 줄을 넘지 않는다고 보고 줄이 바뀌면 따옴표를 닫는다. 주석의 아포스트로피(don't)가 뒤 줄까지 번지지 않게 한다.
    static String compact(String text) {
        StringBuilder out = new StringBuilder(text.length());
        char quote = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quote != 0) {
                if (c == '\n') {
                    quote = 0;
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
                continue;
            }
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
