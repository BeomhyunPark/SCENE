package archfixture.violating.identity;

import archfixture.violating.event.FixtureEvent;

/** ArchUnit fixture: violates "identity must not depend on event". */
public class IdentityUsesEvent {
  FixtureEvent event;
}
