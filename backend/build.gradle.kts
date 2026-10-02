plugins {
  java
  alias(libs.plugins.spring.boot)
  alias(libs.plugins.spotless)
}

group = "app.scene" // BLOCKED-BY-DECISION: final group/package name (placeholder)

version = "0.0.1-SNAPSHOT"

java {
  toolchain {
    languageVersion = JavaLanguageVersion.of(25)
    vendor = JvmVendorSpec.ADOPTIUM
  }
}

repositories { mavenCentral() }

dependencies {
  implementation(platform(libs.spring.boot.bom))
  testImplementation(platform(libs.spring.boot.bom))

  implementation(libs.spring.boot.starter.webmvc)
  implementation(libs.spring.boot.starter.validation)
  implementation(libs.spring.boot.starter.actuator)
  implementation(libs.spring.boot.starter.flyway)
  implementation(libs.mybatis.spring.boot.starter)
  runtimeOnly(libs.flyway.database.postgresql)
  runtimeOnly(libs.postgresql)

  testImplementation(libs.spring.boot.starter.test)
  testImplementation(libs.spring.boot.testcontainers)
  testImplementation(libs.testcontainers.postgresql)
  testImplementation(libs.testcontainers.junit.jupiter)
  testImplementation(libs.archunit.junit5)
  testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.withType<JavaCompile>().configureEach {
  options.encoding = "UTF-8"
  options.compilerArgs.addAll(listOf("-Xlint:all", "-Xlint:-processing"))
}

tasks.withType<Test>().configureEach {
  useJUnitPlatform()
  testLogging {
    events("passed", "skipped", "failed")
    exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
  }
}

// `spotlessCheck` is attached to `check` by the Spotless plugin.
spotless {
  java {
    target("src/**/*.java")
    googleJavaFormat(libs.versions.google.java.format.get())
    trimTrailingWhitespace()
    endWithNewline()
  }
}
