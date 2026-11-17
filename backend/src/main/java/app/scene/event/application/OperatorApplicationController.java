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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Operator application reads and the applicant CSV. These routes do not read {@code
 * Idempotency-Key}. Public and participant routes stay closed. There is no create, update, or
 * delete.
 */
@RestController
public class OperatorApplicationController {

  private static final MediaType CSV = new MediaType("text", "csv", StandardCharsets.UTF_8);

  private final OperatorApplicationService applications;
  private final ApplicationExportService exports;

  public OperatorApplicationController(
      OperatorApplicationService applications, ApplicationExportService exports) {
    this.applications = applications;
    this.exports = exports;
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

  @GetMapping("/api/v1/operator/events/{eventId}/applications/{applicationId}")
  ApplicationDetail read(@PathVariable UUID eventId, @PathVariable UUID applicationId) {
    return applications.read(actor(), eventId, applicationId);
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
