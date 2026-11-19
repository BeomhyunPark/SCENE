package app.scene.event.application;

import app.scene.common.web.ItemPage;
import app.scene.identity.OperatorPrincipal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/**
 * Operator application reads, the summary, and the applicant CSV. These routes do not read {@code
 * Idempotency-Key}. Public and participant routes stay closed. There is no create or delete, and
 * the answers are never updated; the only write is the operator values (#335).
 */
@RestController
public class OperatorApplicationController {

  private static final MediaType CSV = new MediaType("text", "csv", StandardCharsets.UTF_8);

  private final OperatorApplicationService applications;
  private final ApplicationExportService exports;
  private final ApplicationSummaryService summaries;
  private final ApplicationOperationService operations;

  public OperatorApplicationController(
      OperatorApplicationService applications,
      ApplicationExportService exports,
      ApplicationSummaryService summaries,
      ApplicationOperationService operations) {
    this.applications = applications;
    this.exports = exports;
    this.summaries = summaries;
    this.operations = operations;
  }

  @GetMapping("/api/v1/operator/events/{eventId}/applications")
  ItemPage<ApplicationListItem> list(
      @PathVariable UUID eventId,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size,
      @RequestParam(required = false) List<String> sort,
      @RequestParam(required = false) List<String> status) {
    return applications.list(actor(), eventId, page, size, sort, status);
  }

  /** Counts for the summary screen (#251, DEC-073). The literal path wins over {@code {id}}. */
  @GetMapping("/api/v1/operator/events/{eventId}/applications/summary")
  ApplicationSummary summary(@PathVariable UUID eventId) {
    return summaries.summary(actor(), eventId);
  }

  @GetMapping("/api/v1/operator/events/{eventId}/applications/{applicationId}")
  ApplicationDetail read(@PathVariable UUID eventId, @PathVariable UUID applicationId) {
    return applications.read(actor(), eventId, applicationId);
  }

  /** Revisions of the application's participant, newest first (DEC-078 §4). */
  @GetMapping("/api/v1/operator/events/{eventId}/applications/{applicationId}/revisions")
  ApplicationRevisionList revisions(@PathVariable UUID eventId, @PathVariable UUID applicationId) {
    return applications.revisions(actor(), eventId, applicationId);
  }

  /**
   * Operator values of one application (#335, DEC-075): the operator memo in the first round. The
   * participant's answers do not change. CSRF applies; {@code Idempotency-Key} is not read.
   */
  @PutMapping("/api/v1/operator/events/{eventId}/applications/{applicationId}/operation")
  ApplicationOperation writeOperation(
      @PathVariable UUID eventId, @PathVariable UUID applicationId, @RequestBody JsonNode body) {
    return operations.write(actor(), eventId, applicationId, body);
  }

  /**
   * Applicant CSV (#233). POST with CSRF because each download writes an audit row. The body is the
   * file; errors stay problem JSON.
   */
  @PostMapping("/api/v1/operator/events/{eventId}/applications/export")
  ResponseEntity<byte[]> export(@PathVariable UUID eventId) {
    ApplicationExportService.ExportFile file = exports.export(actor(), eventId);
    return ResponseEntity.ok()
        .contentType(CSV)
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment()
                .filename(file.fileName(), StandardCharsets.UTF_8)
                .build()
                .toString())
        .header("X-Export-Count", Integer.toString(file.count()))
        .cacheControl(CacheControl.noStore())
        .body(file.body());
  }

  private static UUID actor() {
    return OperatorPrincipal.require(SecurityContextHolder.getContext().getAuthentication())
        .userId();
  }
}
