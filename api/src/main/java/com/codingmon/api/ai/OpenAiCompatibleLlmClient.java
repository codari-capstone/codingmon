package com.codingmon.api.ai;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.BufferingClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// 팀 서버의 오픈 웨이트 모델을 OpenAI 호환 API(/v1/chat/completions)로 부른다.
// Ollama, llama.cpp, vLLM이 같은 규격이라 엔진을 바꿔도 LLM_URL과 LLM_MODEL만 고치면 된다.
// 프롬프트와 응답에는 제출 코드가 들어 있어 로그에 남기지 않는다.
@Component
class OpenAiCompatibleLlmClient implements LlmClient {

    private static final Logger log = LoggerFactory.getLogger(OpenAiCompatibleLlmClient.class);

    private static final String COMPLETIONS = "/v1/chat/completions";

    // 처음 요청과 스키마를 어겼을 때의 재요청 1회. 전송 오류(타임아웃·연결 실패·5xx·429)는 다시 부르지 않는다.
    // 응답을 못 받은 호출은 모델이 아직 만들고 있을 수 있어(불확실한 호출) 다시 부르면 팀 서버에 일이 쌓인다(#81).
    // 정답 코드 검사의 1회 재생성(AiReviewRunner)과 겹치면 사용자 요청 한 번에 최대 4번 부른다.
    private static final int MAX_ATTEMPTS = 2;

    // 스키마에 $schema가 없으면 이 판으로 읽는다.
    private static final SchemaRegistry SCHEMAS = SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12);

    private final RestClient rest;
    private final boolean configured;
    private final String model;
    private final Map<ReviewType, String> promptVersions;
    private final int maxOutputTokens;
    private final JsonMapper json;
    private final Validator validator;

    @Autowired
    OpenAiCompatibleLlmClient(@Value("${app.llm.url}") String url, @Value("${app.llm.api-key}") String apiKey,
            @Value("${app.llm.model}") String model,
            @Value("${app.llm.prompt-version.analysis}") String analysisPromptVersion,
            @Value("${app.llm.prompt-version.code-review}") String codeReviewPromptVersion,
            @Value("${app.llm.connect-timeout}") Duration connectTimeout,
            @Value("${app.llm.read-timeout}") Duration readTimeout,
            @Value("${app.llm.max-output-tokens}") int maxOutputTokens, JsonMapper json, Validator validator) {
        this(build(url, apiKey, connectTimeout, readTimeout), !url.isBlank() && !model.isBlank(), model,
                Map.of(ReviewType.ANALYSIS, analysisPromptVersion, ReviewType.CODE_REVIEW, codeReviewPromptVersion),
                maxOutputTokens, json, validator);
    }

    OpenAiCompatibleLlmClient(RestClient rest, boolean configured, String model,
            Map<ReviewType, String> promptVersions, int maxOutputTokens, JsonMapper json, Validator validator) {
        this.rest = rest;
        this.configured = configured;
        this.model = model;
        this.promptVersions = promptVersions;
        this.maxOutputTokens = maxOutputTokens;
        this.json = json;
        this.validator = validator;
    }

    private static RestClient build(String url, String apiKey, Duration connectTimeout, Duration readTimeout) {
        SimpleClientHttpRequestFactory requests = new SimpleClientHttpRequestFactory();
        requests.setConnectTimeout(connectTimeout);
        requests.setReadTimeout(readTimeout);
        RestClient.Builder builder = RestClient.builder()
                .requestFactory(new BufferingClientHttpRequestFactory(requests)).baseUrl(url);
        if (!apiKey.isBlank()) {
            builder.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey);
        }
        return builder.build();
    }

    @Override
    public String model() {
        return model;
    }

    @Override
    public String promptVersion(ReviewType type) {
        return promptVersions.get(type);
    }

    @Override
    public <T> LlmResponse<T> complete(LlmRequest<T> request) {
        if (!configured) {
            throw new LlmException(LlmException.Kind.UNAVAILABLE, "LLM_URL이나 LLM_MODEL이 비어 있다", null, LlmUsage.NONE);
        }
        Map<String, Object> body = body(request);
        Schema schema = SCHEMAS.getSchema(json.<JsonNode>valueToTree(request.schema()));
        LlmUsage usage = LlmUsage.NONE;
        String problem = "";
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            ChatResponse response = call(body, usage);
            usage = usage.plus(response.tokens());
            String content = response.content();
            try {
                return new LlmResponse<>(read(content, schema, request.responseType()), content, usage);
            } catch (InvalidOutput e) {
                problem = e.getMessage();
                log.warn("LLM 응답이 스키마를 어겼다({}번째): {}", attempt, problem);
            }
        }
        throw new LlmException(LlmException.Kind.INVALID_RESPONSE, "LLM 응답이 스키마를 어겼다: " + problem, null, usage);
    }

    private <T> Map<String, Object> body(LlmRequest<T> request) {
        Map<String, Object> format = Map.of("name", request.schemaName(), "strict", true, "schema", request.schema());
        return Map.of("model", model, "max_tokens", maxOutputTokens, "stream", false,
                "messages", List.of(Map.of("role", "system", "content", request.system()),
                        Map.of("role", "user", "content", request.user())),
                "response_format", Map.of("type", "json_schema", "json_schema", format));
    }

    private ChatResponse call(Map<String, Object> body, LlmUsage usedSoFar) {
        ChatResponse response;
        try {
            response = rest.post().uri(COMPLETIONS).contentType(MediaType.APPLICATION_JSON).body(body).retrieve()
                    .body(ChatResponse.class);
        } catch (RestClientResponseException e) {
            // 본문에는 요청 내용이 섞일 수 있어 상태 코드만 남긴다. e의 메시지에 본문이 들어 있어 cause로도 넘기지 않는다.
            int status = e.getStatusCode().value();
            String message = "LLM 서버가 " + status + "로 응답했다";
            if (status == 429) {
                throw new LlmException(LlmException.Kind.RATE_LIMITED, message, null, usedSoFar);
            }
            // 키, 모델 이름, 요청 형식이 틀리면 모든 호출이 같은 이유로 실패한다.
            log.warn(message);
            throw new LlmException(LlmException.Kind.UNAVAILABLE, message, null, usedSoFar);
        } catch (RestClientException e) {
            // 타임아웃, 연결 실패, 해석할 수 없는 응답. 실패 로그(AiReviewRunner)에서 타임아웃과 연결 실패를 가를 수 있게
            // 원인 예외의 이름(SocketTimeoutException, ConnectException 등)만 붙인다. 원인 메시지에는 주소가 들어 있다.
            String cause = e.getMostSpecificCause().getClass().getSimpleName();
            throw new LlmException(LlmException.Kind.UNAVAILABLE, "LLM 서버를 호출하지 못했다(" + cause + ")", e, usedSoFar);
        }
        if (response == null) {
            throw new LlmException(LlmException.Kind.UNAVAILABLE, "LLM 서버가 빈 응답을 보냈다", null, usedSoFar);
        }
        return response;
    }

    // 응답 원문을 요청한 스키마로 먼저 검증한다. Jackson이 형을 바꿔 읽으면 저장하는 원문이 스키마를 어긴 채로 남는다.
    // 예외 메시지에는 응답 값이 들어갈 수 있어 어긴 스키마 위치만 옮긴다.
    private <T> T read(String content, Schema schema, Class<T> type) {
        if (content == null || content.isBlank()) {
            throw new InvalidOutput("응답이 비어 있다");
        }
        JsonNode tree;
        try {
            tree = json.readTree(content);
        } catch (JacksonException e) {
            throw new InvalidOutput("JSON으로 읽을 수 없다");
        }
        List<com.networknt.schema.Error> errors = schema.validate(tree);
        if (!errors.isEmpty()) {
            throw new InvalidOutput(errors.stream().map(e -> e.getEvaluationPath().toString()).distinct().sorted()
                    .collect(Collectors.joining(", ", "스키마를 어긴 곳: ", "")));
        }
        T value;
        try {
            value = json.treeToValue(tree, type);
        } catch (JacksonException e) {
            throw new InvalidOutput("응답을 " + type.getSimpleName() + "으로 옮길 수 없다");
        }
        if (value == null) {
            throw new InvalidOutput("JSON 값이 null이다");
        }
        Set<ConstraintViolation<T>> violations = validator.validate(value);
        if (!violations.isEmpty()) {
            throw new InvalidOutput(violations.stream().map(v -> v.getPropertyPath().toString()).sorted()
                    .collect(Collectors.joining(", ", "조건을 어긴 항목: ", "")));
        }
        return value;
    }

    private static final class InvalidOutput extends RuntimeException {
        InvalidOutput(String message) {
            super(message);
        }
    }

    record ChatResponse(List<Choice> choices, Usage usage) {

        String content() {
            if (choices == null || choices.isEmpty() || choices.getFirst().message() == null) {
                return null;
            }
            return choices.getFirst().message().content();
        }

        LlmUsage tokens() {
            return usage == null ? LlmUsage.NONE : new LlmUsage(usage.promptTokens(), usage.completionTokens());
        }
    }

    record Choice(Message message) {
    }

    record Message(String content) {
    }

    record Usage(@JsonProperty("prompt_tokens") int promptTokens,
            @JsonProperty("completion_tokens") int completionTokens) {
    }
}
