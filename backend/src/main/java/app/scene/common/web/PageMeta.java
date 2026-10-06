package app.scene.common.web;

/** The {@code page} object on a list response. */
public record PageMeta(int number, int size, long totalItems, int totalPages) {}
