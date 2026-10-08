package app.scene.event.application;

import java.util.UUID;
import tools.jackson.databind.JsonNode;

/** One submitted answer in field order. {@code value} is the scalar object. */
public record ApplicationAnswer(
    UUID fieldId, String kind, String systemKey, String label, int position, JsonNode value) {}
