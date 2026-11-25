package app.scene.event.application;

import app.scene.identity.OperatorPrincipal;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** 식수 현황 (#454, DEC-089). A read; no CSRF, no {@code Idempotency-Key}. */
@RestController
public class MealCountController {

  private final MealCountService meals;

  public MealCountController(MealCountService meals) {
    this.meals = meals;
  }

  @GetMapping("/api/v1/operator/events/{eventId}/meal-counts")
  ResponseEntity<MealCounts> read(@PathVariable UUID eventId) {
    UUID actor =
        OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication()).userId();
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .body(meals.read(actor, eventId));
  }
}
