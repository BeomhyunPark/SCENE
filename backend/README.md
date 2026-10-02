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

로컬 실행 프로필(`local`)과 docker-compose는 P0-03에서 추가한다.
