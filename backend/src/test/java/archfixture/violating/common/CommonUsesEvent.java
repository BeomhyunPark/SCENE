package archfixture.violating.common;

import archfixture.violating.event.FixtureEvent;

/** ArchUnit fixture: violates "common must not depend on domains". */
public class CommonUsesEvent {
  FixtureEvent event;
}
