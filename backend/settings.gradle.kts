plugins {
  // Lets Gradle download a matching JDK when no local Java 25 toolchain is found.
  id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "scene-backend"
