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

준비되면 `GET http://localhost:8080/actuator/health`가 `{"status":"UP"}`이다. Flyway가 V1을 적용한 뒤 `local`에서만 `db/seed/R__local_seed.sql`을 넣는다. 같은 행은 다시 넣지 않는다. 비울 때는 `docker compose down -v`로 볼륨을 지운다. dev, stg, prod와 테스트는 이 시드를 적용하지 않는다. 테스트는 compose 대신 Testcontainers를 띄운다.

시드는 로그인 계정이 아니다. 권한 override도 없다. MANAGER/STAFF 기본 권한은 아직 승인되지 않았다.

오류 응답은 `application/problem+json`이다. 분기 값은 `code`다. `detail` 문장으로 분기하지 않는다. 응답 헤더 `X-Request-Id`와 본문 `traceId`는 같은 값이다. 요청에 형식에 맞는 `X-Request-Id`가 있으면 그 값을 쓰고, 없으면 서버가 만든다. 이 값은 분산 trace id가 아니다.

콘솔 로그는 한 줄에 JSON 하나다. 요청이 끝나면 `requestId`, `method`, `path`, `status`, `durationMs`가 남는다. 경로의 쿼리는 로그에 넣지 않는다.

| id | 행 |
| --- | --- |
| `00000000-0000-4000-8000-000000000001` | Local owner. Space OWNER, Event OWNER |
| `00000000-0000-4000-8000-000000000002` | Local manager. Space MEMBER, Event MANAGER |
| `00000000-0000-4000-8000-000000000003` | Local staff. Space MEMBER, Event STAFF |
| `00000000-0000-4000-8000-000000000010` | Local space |
| `00000000-0000-4000-8000-000000000020` | Local event. DRAFT |
| `00000000-0000-4000-8000-000000000030` | 대기 초대 `local-invite@example.com`. 토큰이 아니다 |
