package com.codingmon.api.user;

import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String email;

    private String passwordHash;

    private int tokenVersion;

    private String nickname;

    private String avatarUrl;

    @Enumerated(EnumType.STRING)
    private Role role = Role.USER;

    // 관리자가 정지한 시각(ADM-16). 바꾸는 쪽은 관리자 정지 API의 SQL이다. 가입 INSERT에서는 늘 비어 있다.
    // created_at·suspension_reason은 DB 기본값과 관리자 SQL이 다뤄 여기에 두지 않는다.
    private Instant suspendedAt;

    protected User() {
    }

    public User(String email, String passwordHash, String nickname) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.nickname = nickname;
    }

    // GitHub 가입 계정은 이메일과 비밀번호가 없다.
    public static User github(String nickname, String avatarUrl) {
        User user = new User(null, null, nickname);
        user.avatarUrl = avatarUrl;
        return user;
    }

    public Long getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getNickname() {
        return nickname;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public int getTokenVersion() {
        return tokenVersion;
    }

    public Instant getSuspendedAt() {
        return suspendedAt;
    }

    public Role getRole() {
        return role;
    }
}
