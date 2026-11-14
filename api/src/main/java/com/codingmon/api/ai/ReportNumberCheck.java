package com.codingmon.api.ai;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

// 학습 리포트(F4) 문장 속 수치를 서버 통계와 대조한다(AI_FEATURES 7절, #85). 저장하기 전에 LearningReportService가 부른다.
// 모델에는 수치를 화면 표기 그대로 문자열로 주고(LearningReportInput) 입력에 있는 값만 쓰게 했다. 그래도 어긴 문장은 지운다.
// 모델이 원래 어느 값을 뜻했는지 알 수 없으므로 고치지 않는다. 표기만 다른 같은 값(1.50번, 50 퍼센트)은 맞는 것으로 본다.
// 이 검사로는 다시 만들지 않는다. 글의 문장이 모두 지워지면 그 글은 null이고, 화면은 서버 값인 수치와 목록만 보여 준다.
//
// 보는 수
// - 백분율: "50%", "50 퍼센트", "50프로". 입력의 해결률이어야 한다.
// - 소수: "1.5". 입력의 평균 시도·평균 힌트 단계, 또는 개수여야 한다.
// - 횟수·개수 단위가 붙은 정수: "4문제", "3번", "2회", "2개", "3차례". 입력의 개수나 평균 값이어야 한다.
//   "2번째"(순서), "1번 문제"(번호), "2단계"(힌트 단계 이름 0~3), 단위가 없는 정수는 보지 않는다. 한글로 쓴 수("두 번")도 보지 않는다.
// 천 단위 쉼표가 든 수("1,000")는 한 수로 읽는다. 그 밖의 쉼표 뒤 수("50%,80%"의 80%)는 따로 본다.
// 문제 제목과 개념 이름 속 숫자("2차원 배열", "369 게임")는 수치가 아니라 이름이므로 가리고 본다.
//
// 글마다 쓸 수 있는 값이 다르다. 다른 개념의 수치를 끌어다 쓴 문장을 잡으려는 것이다.
// - 취약 개념의 설명·연습 방법: 그 개념의 통계와 전체 값(맞힌 문제 수, 취약 개념 수, 추천 수)
// - 추천 이유: 근거 개념의 통계와 전체 값. 도전 문제는 전체 값만
// - 요약: 모든 개념의 통계, 전체 값, 다음 개념을 권한 리뷰 수
final class ReportNumberCheck {

    // 같은 응답의 결과가 달라지게 규칙을 바꾸면 올린다. learning_reports.content의 numberCheck에 함께 저장한다.
    static final int VERSION = 1;

    // 어긴 규칙. PERCENT는 입력에 없는 백분율, NUMBER는 입력에 없는 소수·횟수다.
    enum Kind { PERCENT, NUMBER }

    // field는 응답 안의 위치다(예: weakConcepts[0].explanation, recommendations[1].reason, summary).
    record Fix(Kind kind, String field) {
    }

    // learning_reports.content의 numberCheck. removed는 지운 문장 수, emptied는 문장이 모두 지워져 null이 된 글 수,
    // fixes는 어긴 수마다 "규칙@위치"다. 응답 글은 담지 않는다.
    record Meta(int version, int removed, int emptied, List<String> fixes) {
    }

    record Outcome(LearningReportContent content, List<Fix> fixes) {

        Outcome {
            fixes = List.copyOf(fixes);
        }

        String label() {
            return fixes.isEmpty() ? "PASSED" : "FIXED";
        }
    }

    // 수 하나. 앞은 숫자·영문·점이 아닌 곳에서 시작한다(v1.2의 2를 따로 보지 않는다). 천 단위 쉼표("1,000")는 한 수로 읽고
    // 값은 쉼표를 빼고 본다. 뒤의 백분율 표기를 함께 읽는다. "프로그램"의 "프로"는 백분율이 아니다.
    private static final Pattern NUMBER = Pattern.compile(
            "(?<![0-9A-Za-z.])((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)(?![0-9]|\\.\\d)(\\s*(?:%|퍼센트|프로(?!그)))?");
    // 정수 뒤에 붙으면 횟수·개수로 보는 단위. "2번째"는 순서, "1번 문제"는 번호, "2개념"·"2회차"는 다른 말이다.
    private static final Pattern COUNT_UNIT = Pattern.compile("^\\s*(?:문제|번(?!째|\\s*문제)|회(?!차)|개(?!념)|차례)");
    // 문장 끝(마침표·물음표·느낌표 뒤 공백)이나 줄바꿈에서 나눈다. "1.5"처럼 공백 없이 이어진 점은 나누지 않는다.
    private static final Pattern SENTENCE_BREAK = Pattern.compile("(?<=[.!?。])\\s+|\\s*\\n\\s*");
    // 가린 이름의 글자마다 넣는 글자. 숫자나 문장 끝 표시가 아니면 된다.
    private static final String MASK = "□";

    private ReportNumberCheck() {
    }

    // result는 alignedTo로 입력 순서에 맞춘 응답이다(취약 개념은 입력의 weak 순, 추천은 순위 순).
    static Outcome verify(LearningReportResult result, LearningReportInput input) {
        List<String> names = maskedNames(input);
        Values global = global(input);
        List<Fix> fixes = new ArrayList<>();
        int[] counts = new int[2]; // 지운 문장 수, 비워진 글 수

        List<LearningReportContent.ConceptText> concepts = new ArrayList<>();
        for (int i = 0; i < result.weakConcepts().size(); i++) {
            LearningReportResult.WeakConcept weak = result.weakConcepts().get(i);
            Values allowed = global.with(concept(input, weak.concept()));
            String prefix = "weakConcepts[" + i + "].";
            concepts.add(new LearningReportContent.ConceptText(weak.concept(),
                    check(weak.explanation(), allowed, names, prefix + "explanation", fixes, counts),
                    check(weak.practice(), allowed, names, prefix + "practice", fixes, counts)));
        }

        List<LearningReportContent.Reason> reasons = new ArrayList<>();
        for (int i = 0; i < result.recommendations().size(); i++) {
            LearningReportResult.RecommendationReason reason = result.recommendations().get(i);
            Values allowed = input.recommendations().stream()
                    .filter(r -> r.rank() == reason.rank() && r.concept() != null)
                    .findFirst()
                    .map(r -> global.with(concept(input, r.concept())))
                    .orElse(global);
            reasons.add(new LearningReportContent.Reason(reason.rank(),
                    check(reason.reason(), allowed, names, "recommendations[" + i + "].reason", fixes, counts)));
        }

        Values everything = global;
        for (LearningReportInput.Concept concept : input.concepts()) {
            everything = everything.with(Optional.of(concept));
        }
        everything = everything.withNumbers(input.nextConcepts().stream().map(c -> BigDecimal.valueOf(c.count())));
        String summary = check(result.summary(), everything, names, "summary", fixes, counts);

        Meta meta = new Meta(VERSION, counts[0], counts[1], fixes.stream().map(ReportNumberCheck::describe).toList());
        return new Outcome(new LearningReportContent(concepts, reasons, summary, meta), fixes);
    }

    // 예: PERCENT@weakConcepts[0].explanation,NUMBER@summary
    static String describe(List<Fix> fixes) {
        return fixes.stream().map(ReportNumberCheck::describe).collect(Collectors.joining(","));
    }

    private static String describe(Fix fix) {
        return fix.kind() + "@" + fix.field();
    }

    // 맞지 않는 수가 있는 문장을 지운 글. 지울 것이 없으면 받은 글 그대로이고, 모두 지웠으면 null이다.
    // 이름을 먼저 가리고 문장을 나눈다("몇 개일까? 7개 고르기"가 두 문장으로 갈라져 가려지지 않는 일을 막는다).
    // 가린 글은 원문과 길이가 같으므로 가린 글에서 찾은 문장 경계로 원문을 자른다.
    private static String check(String text, Values allowed, List<String> names, String field, List<Fix> fixes,
            int[] counts) {
        if (text == null) {
            return null;
        }
        String original = text.strip();
        String masked = mask(original, names);
        List<int[]> spans = new ArrayList<>();
        Matcher sentenceBreak = SENTENCE_BREAK.matcher(masked);
        int start = 0;
        while (sentenceBreak.find()) {
            spans.add(new int[] {start, sentenceBreak.start()});
            start = sentenceBreak.end();
        }
        spans.add(new int[] {start, masked.length()});
        List<String> kept = new ArrayList<>();
        boolean removed = false;
        for (int[] span : spans) {
            String sentence = original.substring(span[0], span[1]);
            if (sentence.isBlank()) {
                continue;
            }
            List<Kind> violations = violations(masked.substring(span[0], span[1]), allowed);
            if (violations.isEmpty()) {
                kept.add(sentence);
            } else {
                violations.forEach(kind -> fixes.add(new Fix(kind, field)));
                counts[0]++;
                removed = true;
            }
        }
        if (!removed) {
            return text;
        }
        if (kept.isEmpty()) {
            counts[1]++;
            return null;
        }
        return String.join(" ", kept);
    }

    private static List<Kind> violations(String sentence, Values allowed) {
        List<Kind> found = new ArrayList<>();
        Matcher m = NUMBER.matcher(sentence);
        while (m.find()) {
            BigDecimal value = new BigDecimal(m.group(1).replace(",", ""));
            if (m.group(2) != null) {
                if (!allowed.hasPercent(value)) {
                    found.add(Kind.PERCENT);
                }
                continue;
            }
            boolean decimal = m.group(1).contains(".");
            boolean counted = COUNT_UNIT.matcher(sentence.substring(m.end())).find();
            if ((decimal || counted) && !allowed.hasNumber(value)) {
                found.add(Kind.NUMBER);
            }
        }
        return found;
    }

    // 긴 이름부터 가린다. 짧은 이름이 긴 이름의 일부면 긴 이름이 먼저 통째로 가려진다. 글자 수를 그대로 둔다.
    private static String mask(String text, List<String> names) {
        String masked = text;
        for (String name : names) {
            masked = masked.replace(name, MASK.repeat(name.length()));
        }
        return masked;
    }

    // 입력에 있는 이름(개념, 추천 문제 제목, 다음 개념과 그 문제 제목) 중 숫자나 문장 끝 표시(. ! ?)가 든 것
    private static List<String> maskedNames(LearningReportInput input) {
        return Stream.of(
                        input.concepts().stream().map(LearningReportInput.Concept::name),
                        input.recommendations().stream().map(LearningReportInput.Recommendation::title),
                        input.nextConcepts().stream().map(LearningReportInput.NextConcept::name),
                        input.nextConcepts().stream().flatMap(c -> c.problems().stream()))
                .flatMap(s -> s)
                .filter(name -> name != null
                        && name.chars().anyMatch(ch -> Character.isDigit(ch) || ".!?。".indexOf(ch) >= 0))
                .map(String::strip)
                .distinct()
                .sorted(Comparator.comparingInt(String::length).reversed())
                .toList();
    }

    private static Optional<LearningReportInput.Concept> concept(LearningReportInput input, String name) {
        return input.concepts().stream().filter(c -> c.name().equals(name)).findFirst();
    }

    // 어느 글에서나 쓸 수 있는 값. 추천 수와 취약 개념 수는 화면에 보이는 목록의 길이다.
    private static Values global(LearningReportInput input) {
        return new Values(List.of(), List.of()).withNumbers(Stream.of(input.solvedProblemCount(),
                input.recommendations().size(), input.weakConceptNames().size()).map(BigDecimal::valueOf));
    }

    // 쓸 수 있는 백분율과 수. 값으로 비교하므로 "1.5"와 "1.50", "50%"와 "50.0%"는 같다.
    private record Values(List<BigDecimal> percents, List<BigDecimal> numbers) {

        Values with(Optional<LearningReportInput.Concept> concept) {
            if (concept.isEmpty()) {
                return this;
            }
            LearningReportInput.Concept c = concept.get();
            List<BigDecimal> p = new ArrayList<>(percents);
            p.add(new BigDecimal(c.solveRate().replace("%", "")));
            return new Values(p, numbers).withNumbers(Stream.of(BigDecimal.valueOf(c.problemCount()),
                    BigDecimal.valueOf(c.solvedCount()), new BigDecimal(c.averageAttempts()),
                    new BigDecimal(c.averageHintLevel())));
        }

        Values withNumbers(Stream<BigDecimal> more) {
            return new Values(percents, Stream.concat(numbers.stream(), more).toList());
        }

        boolean hasPercent(BigDecimal value) {
            return percents.stream().anyMatch(p -> p.compareTo(value) == 0);
        }

        boolean hasNumber(BigDecimal value) {
            return numbers.stream().anyMatch(n -> n.compareTo(value) == 0);
        }
    }
}
