# SCENE backend

Modular monolith (`architecture-v0.1.md` §2): Java 25, Spring Boot 4.0, MyBatis, PostgreSQL, Flyway.

## 요구 사항
- JDK 25 (Temurin). 로컬에 없으면 Gradle toolchain(foojay)이 내려받는다.
- Docker: 통합 테스트가 Testcontainers `postgres:17`을 띄운다.

## 명령
```bash
./gradlew check      # spotlessCheck(google-java-format) + 테스트(ArchUnit, Testcontainers)
./gradlew assemble   # bootJar
./gradlew spotlessApply  # 포맷 자동 수정
```

## 로컬 실행

`local`만 compose의 PostgreSQL에 접속한다. 계정 `scene` / 비밀번호 `scene`은 이 노트북용이다. dev, stg, prod는 호스트를 정하지 않았고 `SCENE_DB_URL`, `SCENE_DB_USER`, `SCENE_DB_PASSWORD`가 없으면 기동하지 않는다.

```bash
docker compose up -d --wait
./gradlew bootRun --args='--spring.profiles.active=local'
```

준비되면 `GET http://localhost:8080/actuator/health`가 `{"status":"UP"}`이다. Flyway가 빈 데이터베이스에 V1을 적용한다. 테스트는 이 compose를 쓰지 않고 Testcontainers를 띄운다.
