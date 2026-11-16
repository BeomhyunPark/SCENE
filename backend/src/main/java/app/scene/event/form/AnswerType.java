package app.scene.event.form;

/** Question types (DEC-068). Text answers keep the {@code {"text"}} value shape. */
public enum AnswerType {
  SHORT_TEXT,
  LONG_TEXT,
  SINGLE_CHOICE,
  MULTI_CHOICE,
  DROPDOWN,
  DATE,
  DATE_RANGE,
  NUMBER,
  YES_NO;

  /** Types that carry an {@code options} list. */
  public boolean hasOptions() {
    return this == SINGLE_CHOICE || this == MULTI_CHOICE || this == DROPDOWN;
  }

  /** Types another question's {@code showWhen} may point at. */
  public boolean isConditionTarget() {
    return hasOptions() || this == YES_NO;
  }

  public boolean isText() {
    return this == SHORT_TEXT || this == LONG_TEXT;
  }

  public static AnswerType parse(String raw) {
    for (AnswerType type : values()) {
      if (type.name().equals(raw)) {
        return type;
      }
    }
    return null;
  }
}
