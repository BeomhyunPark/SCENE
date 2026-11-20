package app.scene.event.home;

/** The participant's newest {@code checkin_logs.seq} and newest application revision, or null. */
public record ParticipantValuesRow(Long checkIn, Integer application) {}
