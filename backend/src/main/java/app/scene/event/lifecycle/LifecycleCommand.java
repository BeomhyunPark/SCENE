package app.scene.event.lifecycle;

enum LifecycleCommand {
  ACTIVATE("DRAFT", "ACTIVE"),
  END("ACTIVE", "ENDED"),
  REOPEN("ENDED", "ACTIVE"),
  ARCHIVE("ENDED", "ARCHIVED"),
  UNARCHIVE("ARCHIVED", "ENDED");

  private final String from;
  private final String to;

  LifecycleCommand(String from, String to) {
    this.from = from;
    this.to = to;
  }

  String fromStatus() {
    return from;
  }

  String toStatus() {
    return to;
  }

  boolean needsWarningAck() {
    return this == END || this == ARCHIVE;
  }

  boolean spaceOwnerDirect() {
    return this == ARCHIVE || this == UNARCHIVE;
  }
}
