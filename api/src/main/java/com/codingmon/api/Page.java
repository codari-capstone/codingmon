package com.codingmon.api;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

// 목록 API가 함께 쓰는 페이지 응답과 검사. 크기 상한을 한곳에서 바꿔 API마다 200/400이 갈리지 않게 한다.
// 마지막 페이지보다 큰 page는 빈 content를 준다. 마지막 페이지로 옮기는 건 프런트가 totalElements로 한다.
public record Page<T>(List<T> content, long totalElements) {

    public static final int MAX_SIZE = 20;

    public static void check(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "page는 0 이상, size는 1~" + MAX_SIZE + "이다");
        }
    }
}
