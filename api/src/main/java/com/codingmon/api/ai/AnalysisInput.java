package com.codingmon.api.ai;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.codingmon.api.Language;
import com.codingmon.api.judge.RuntimeErrorType;
import com.codingmon.api.judge.StoredText;
import com.codingmon.api.judge.Verdict;
import com.fasterxml.jackson.annotation.JsonInclude;

import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.json.JsonMapper;

// AI 오답 분석(F1·F2)에 보내는 근거(AI_FEATURES 3절). AnalysisInputRepository가 제출 하나로 만든다.
// 비공개 테스트는 HiddenTests의 개수와 크기 등급만 담는다. 입력·기대 출력·stdout·stderr 원문과 몇 번째 케이스인지는
// 담을 필드가 없다(8절 비공개 테스트 보호, ARCHITECTURE 5.2).
// 글은 아래 상한까지만 넣고 뒤에 생략 표시를 붙인다. 모델 컨텍스트(OLLAMA_CONTEXT_LENGTH 16384토큰)에서 출력 4096토큰과
// 지시문을 빼고 남는 만큼이다. 글자 수는 JSON에 쓰일 길이로 센다(jsonLength). 모든 항목이 상한에 닿아도 JSON이
// 2만 자를 넘지 않는다(AnalysisInputTest).
record AnalysisInput(Problem problem, Submission submission, Samples samples, HiddenTests hiddenTests) {

    static final int STATEMENT_MAX_CHARS = 3_000;
    // 입력 설명·출력 설명·제약 각각
    static final int DESCRIPTION_MAX_CHARS = 800;
    static final int CODE_MAX_CHARS = 8_000;
    static final int CODE_MAX_LINES = 300;
    // 미리 계산한 표처럼 긴 줄 하나가 코드 상한을 다 써서 뒤 코드가 빠지지 않게 줄마다 자른다.
    static final int CODE_LINE_MAX_CHARS = 300;
    static final int COMPILER_MESSAGE_MAX_CHARS = 2_000;
    static final int SAMPLE_MAX_COUNT = 3;
    // 예제의 입력·기대 출력·실제 출력 각각
    static final int SAMPLE_TEXT_MAX_CHARS = 300;
    static final int SAMPLE_ERROR_MAX_CHARS = 500;

    // 빈 값(null)은 넣지 않는다. 필드 순서는 선언 순서 그대로 둔다(Jackson 3은 기본이 이름순이다).
    private static final JsonMapper JSON = JsonMapper.builder()
            .disable(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY)
            .changeDefaultPropertyInclusion(include -> include.withValueInclusion(JsonInclude.Include.NON_NULL))
            .build();

    record Problem(String title, String statement, String inputDescription, String outputDescription,
            String constraints, int timeLimitMs, int memoryLimitMb, List<String> conceptTags) {

        static Problem of(String title, String statement, String inputDescription, String outputDescription,
                String constraints, int timeLimitMs, int memoryLimitMb, List<String> conceptTags) {
            return new Problem(title, clip(statement, STATEMENT_MAX_CHARS), clip(inputDescription, DESCRIPTION_MAX_CHARS),
                    clip(outputDescription, DESCRIPTION_MAX_CHARS), clip(constraints, DESCRIPTION_MAX_CHARS),
                    timeLimitMs, memoryLimitMb, List.copyOf(conceptTags));
        }
    }

    // code는 "줄번호| 내용" 꼴이고, codeLines는 자르기 전 전체 줄 수다(줄 번호 범위 검사, #79).
    record Submission(Language language, Verdict verdict, RuntimeErrorType runtimeErrorType, Integer executionTimeMs,
            Integer memoryUsedKb, int codeLines, String code, String compilerMessage) {

        static Submission of(Language language, Verdict verdict, RuntimeErrorType runtimeErrorType,
                Integer executionTimeMs, Integer memoryUsedKb, String sourceCode, String compilerMessage) {
            return new Submission(language, verdict, runtimeErrorType, executionTimeMs, memoryUsedKb,
                    (int) sourceCode.lines().count(), numberLines(sourceCode),
                    clip(compilerMessage, COMPILER_MESSAGE_MAX_CHARS));
        }
    }

    // 실행한 공개 예제. total·failed는 전체 수이고, cases에는 상한까지 틀린 예제부터 골라 번호 순으로 싣는다.
    record Samples(int total, int failed, List<Sample> cases) {

        // 실행한 예제가 없으면 null이다.
        static Samples of(List<Sample> samples) {
            if (samples.isEmpty()) {
                return null;
            }
            int failed = (int) samples.stream().filter(s -> s.verdict() != Verdict.ACCEPTED).count();
            List<Sample> cases = samples.stream()
                    .sorted(Comparator.comparing((Sample s) -> s.verdict() == Verdict.ACCEPTED).thenComparingInt(Sample::no))
                    .limit(SAMPLE_MAX_COUNT)
                    .sorted(Comparator.comparingInt(Sample::no))
                    .toList();
            return new Samples(samples.size(), failed, cases);
        }
    }

    // no는 문제 상세의 예제 번호(1부터)다. 공개 데이터라 원문을 넣는다.
    record Sample(int no, Verdict verdict, RuntimeErrorType runtimeErrorType, String input, String expectedOutput,
            String actualOutput, String errorMessage, Integer executionTimeMs, Integer memoryUsedKb) {

        // stderr는 Judge0가 붙인 줄을 빼고, 남은 게 없으면 넣지 않는다(SubmissionRepository와 같다).
        static Sample of(int no, Verdict verdict, RuntimeErrorType runtimeErrorType, String input,
                String expectedOutput, String stdout, String stderr, Integer executionTimeMs, Integer memoryUsedKb) {
            String error = stderr == null ? null : StoredText.withoutJudgeLines(stderr);
            return new Sample(no, verdict, runtimeErrorType, clip(input, SAMPLE_TEXT_MAX_CHARS),
                    clip(expectedOutput, SAMPLE_TEXT_MAX_CHARS), clip(stdout, SAMPLE_TEXT_MAX_CHARS),
                    error == null || error.isBlank() ? null : clip(error, SAMPLE_ERROR_MAX_CHARS),
                    executionTimeMs, memoryUsedKb);
        }
    }

    // 비공개 케이스 하나. 원문 대신 판정과 입력 바이트 수만 갖는다.
    record HiddenCase(Verdict verdict, RuntimeErrorType runtimeErrorType, int inputBytes) {
    }

    // smallestFailed·largestFailed는 입력이 가장 작은·큰 케이스 중 실패한 것이 있는지다. 크기가 같다고 보면(sameSize) false다.
    record HiddenTests(int total, int passed, int failed, Map<Verdict, Integer> failedVerdicts,
            List<RuntimeErrorType> runtimeErrorTypes, List<SizeGroup> bySize, boolean smallestFailed,
            boolean largestFailed) {

        // 케이스가 없으면 null이다.
        static HiddenTests of(List<HiddenCase> cases) {
            if (cases.isEmpty()) {
                return null;
            }
            List<SizeGrade> grades = grades(cases.stream().map(HiddenCase::inputBytes).toList());
            int min = cases.stream().mapToInt(HiddenCase::inputBytes).min().getAsInt();
            int max = cases.stream().mapToInt(HiddenCase::inputBytes).max().getAsInt();
            boolean spread = !sameSize(min, max);
            Map<Verdict, Integer> failedVerdicts = new EnumMap<>(Verdict.class);
            Set<RuntimeErrorType> errorTypes = EnumSet.noneOf(RuntimeErrorType.class);
            int[][] counts = new int[SizeGrade.values().length][2];
            boolean smallestFailed = false;
            boolean largestFailed = false;
            for (int i = 0; i < cases.size(); i++) {
                HiddenCase c = cases.get(i);
                boolean failed = c.verdict() != Verdict.ACCEPTED;
                counts[grades.get(i).ordinal()][failed ? 1 : 0]++;
                if (failed) {
                    failedVerdicts.merge(c.verdict(), 1, Integer::sum);
                    if (c.runtimeErrorType() != null) {
                        errorTypes.add(c.runtimeErrorType());
                    }
                    smallestFailed |= spread && c.inputBytes() == min;
                    largestFailed |= spread && c.inputBytes() == max;
                }
            }
            List<SizeGroup> bySize = new ArrayList<>();
            for (SizeGrade grade : SizeGrade.values()) {
                int[] count = counts[grade.ordinal()];
                if (count[0] + count[1] > 0) {
                    bySize.add(new SizeGroup(grade, count[0], count[1]));
                }
            }
            int failed = failedVerdicts.values().stream().mapToInt(Integer::intValue).sum();
            return new HiddenTests(cases.size(), cases.size() - failed, failed, failedVerdicts, List.copyOf(errorTypes),
                    bySize, smallestFailed, largestFailed);
        }
    }

    record SizeGroup(SizeGrade grade, int passed, int failed) {
    }

    // 같은 버전 비공개 케이스 안에서 입력 바이트 수의 상대 크기. 정확한 길이는 보내지 않는다.
    enum SizeGrade { SMALL, MEDIUM, LARGE }

    String toJson() {
        return JSON.writeValueAsString(this);
    }

    // 앞에서부터 JSON 길이로 maxChars까지 자른다. 잘랐으면 남은 글자 수를 적는다.
    static String clip(String text, int maxChars) {
        if (text == null) {
            return null;
        }
        int end = cut(text, maxChars);
        if (end == text.length()) {
            return text;
        }
        return text.substring(0, end) + "\n[…뒤 " + text.codePointCount(end, text.length()) + "자 생략]";
    }

    // 줄마다 1부터 번호를 붙인다. 줄 수나 글자 수 상한에 닿으면 그 앞 줄까지만 넣는다.
    static String numberLines(String code) {
        List<String> lines = code.lines().toList();
        StringBuilder out = new StringBuilder();
        int chars = 0;
        int written = 0;
        for (String line : lines) {
            int end = cut(line, CODE_LINE_MAX_CHARS);
            String text = end == line.length() ? line
                    : line.substring(0, end) + " […뒤 " + line.codePointCount(end, line.length()) + "자 생략]";
            String numbered = (written + 1) + "| " + text + "\n";
            int length = jsonLength(numbered);
            if (written == CODE_MAX_LINES || chars + length > CODE_MAX_CHARS) {
                break;
            }
            out.append(numbered);
            chars += length;
            written++;
        }
        if (written < lines.size()) {
            out.append("[…뒤 ").append(lines.size() - written).append("줄 생략]\n");
        }
        return out.toString();
    }

    // JSON 길이가 maxChars를 넘지 않는 앞부분이 끝나는 위치(char 인덱스).
    private static int cut(String text, int maxChars) {
        int end = 0;
        int length = 0;
        while (end < text.length()) {
            int codePoint = text.codePointAt(end);
            length += jsonWidth(codePoint);
            if (length > maxChars) {
                break;
            }
            end += Character.charCount(codePoint);
        }
        return end;
    }

    // JSON 문자열 안에서 차지하는 길이(코드 포인트 수).
    static int jsonLength(String text) {
        return text.codePoints().map(AnalysisInput::jsonWidth).sum();
    }

    // Jackson은 따옴표·역슬래시와 \b \t \n \f \r을 두 자로, 나머지 제어 문자는 유니코드 이스케이프 여섯 자로 쓴다.
    // 원문 글자 수로 세면 제어 문자로 채운 코드가 상한의 여섯 배가 된다.
    private static int jsonWidth(int codePoint) {
        return switch (codePoint) {
            case '"', '\\', '\b', '\t', '\n', '\f', '\r' -> 2;
            default -> codePoint < 0x20 ? 6 : 1;
        };
    }

    // 입력 크기는 몇 바이트부터 몇 MB까지 벌어지므로 로그 눈금에서 가장 작은 입력과 가장 큰 입력 사이를 셋으로 나눈다.
    // 크기가 같다고 보면(sameSize) 모두 MEDIUM이다.
    static List<SizeGrade> grades(List<Integer> inputBytes) {
        int min = inputBytes.stream().mapToInt(Integer::intValue).min().orElse(0);
        int max = inputBytes.stream().mapToInt(Integer::intValue).max().orElse(0);
        List<SizeGrade> grades = new ArrayList<>();
        for (int bytes : inputBytes) {
            double position = sameSize(min, max) ? 0.5
                    : (Math.log1p(bytes) - Math.log1p(min)) / (Math.log1p(max) - Math.log1p(min));
            grades.add(position < 1.0 / 3 ? SizeGrade.SMALL : position > 2.0 / 3 ? SizeGrade.LARGE : SizeGrade.MEDIUM);
        }
        return grades;
    }

    // 가장 큰 입력이 가장 작은 입력의 2배가 안 되면 크기가 같다고 본다. 몇 바이트 차이로 SMALL·LARGE가 갈리지 않게 한다.
    // 값의 자릿수 차이(예: "1 2"와 "1000000000 1000000000")는 2배를 넘어 그대로 나뉜다.
    static boolean sameSize(int min, int max) {
        return max == min || max < 2L * min;
    }
}
