package app.scene;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Module boundaries (architecture-v0.1 §2, modular monolith):
 *
 * <ul>
 *   <li>{@code common..} must not depend on {@code identity..}, {@code space..} or {@code event..}.
 *   <li>Domain packages may depend on {@code common..} (not restricted).
 *   <li>{@code event..} may depend on {@code identity..} and {@code space..}, but not the reverse.
 * </ul>
 */
class ArchitectureTest {

  static final String ROOT = "app.scene";

  static JavaClasses productionClasses;

  @BeforeAll
  static void importClasses() {
    productionClasses =
        new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages(ROOT);
  }

  static ArchRule commonMustNotDependOnDomains(String root) {
    return noClasses()
        .that()
        .resideInAPackage(root + ".common..")
        .should()
        .dependOnClassesThat()
        .resideInAnyPackage(root + ".identity..", root + ".space..", root + ".event..")
        .because("common is shared infrastructure and must stay domain-agnostic");
  }

  static ArchRule identityAndSpaceMustNotDependOnEvent(String root) {
    return noClasses()
        .that()
        .resideInAnyPackage(root + ".identity..", root + ".space..")
        .should()
        .dependOnClassesThat()
        .resideInAPackage(root + ".event..")
        .because("event depends on identity/space read ports, never the reverse")
        // identity/space hold only package-info in P0-01; keep the rule active as they fill up.
        .allowEmptyShould(true);
  }

  @Test
  void commonDoesNotDependOnDomainPackages() {
    commonMustNotDependOnDomains(ROOT).check(productionClasses);
  }

  @Test
  void identityAndSpaceDoNotDependOnEvent() {
    identityAndSpaceMustNotDependOnEvent(ROOT).check(productionClasses);
  }

  /** Guards against rules that silently match nothing: a known-bad fixture must be rejected. */
  @Test
  void rulesRejectViolatingFixture() {
    String fixtureRoot = "archfixture.violating";
    JavaClasses fixture = new ClassFileImporter().importPackages(fixtureRoot);

    assertThat(commonMustNotDependOnDomains(fixtureRoot).evaluate(fixture).hasViolation()).isTrue();
    assertThat(identityAndSpaceMustNotDependOnEvent(fixtureRoot).evaluate(fixture).hasViolation())
        .isTrue();
  }
}
