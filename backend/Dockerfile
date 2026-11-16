# Backend image for the home server (docs/devops/home-server.md). Build context: backend/.
FROM eclipse-temurin:25-jdk AS build
WORKDIR /src
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle gradle
RUN chmod +x gradlew && ./gradlew --no-daemon --version
COPY src src
RUN ./gradlew --no-daemon bootJar -x test && cp build/libs/scene-backend-*.jar /app.jar

FROM eclipse-temurin:25-jre
RUN useradd --system --uid 10001 scene
USER scene
COPY --from=build /app.jar /app/app.jar
ENV SPRING_PROFILES_ACTIVE=prod \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=60 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
