package app.scene.event.participant;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** DEC-078 §2 number rules. */
class ParticipantPinsTest {

  private static final String PHONE = "01073914826";

  @Test
  void acceptsSixDigitsThatAreNotAPattern() {
    assertThat(ParticipantPins.accepted("730915", PHONE)).isTrue();
    assertThat(ParticipantPins.accepted("112233", PHONE)).isTrue();
    assertThat(ParticipantPins.accepted("135790", PHONE)).isTrue();
  }

  @Test
  void rejectsRepeatsRunsPhoneDigitsAndOtherShapes() {
    for (String pin :
        new String[] {
          "000000", "777777", "012345", "123456", "456789", "987654", "543210", "739148", "914826",
          "010739", "12345", "1234567", "12a456", "", " 73091"
        }) {
      assertThat(ParticipantPins.accepted(pin, PHONE)).as(pin).isFalse();
    }
    assertThat(ParticipantPins.accepted(null, PHONE)).isFalse();
  }

  @Test
  void temporaryNumbersPassTheSameRules() {
    ParticipantPins pins =
        new ParticipantPins(
            new ParticipantProperties(
                null, null, null, null, null, null, null, null, null, 4, null, null));
    for (int i = 0; i < 200; i++) {
      String pin = pins.temporary(PHONE);
      assertThat(ParticipantPins.accepted(pin, PHONE)).as(pin).isTrue();
    }
    String hash = pins.hash("730915");
    assertThat(hash).doesNotContain("730915");
    assertThat(pins.matches("730915", hash)).isTrue();
    assertThat(pins.matches("730916", hash)).isFalse();
    assertThat(pins.matches("730915", null)).isFalse();
  }

  @Test
  void phoneKeyUsesDigitsAndNamesFoldSpaces() {
    assertThat(ParticipantPins.phoneKey("010-7391-4826"))
        .isEqualTo(ParticipantPins.phoneKey(PHONE));
    assertThat(ParticipantPins.normalizeName("  김   하늘 ")).isEqualTo("김 하늘");
  }
}
