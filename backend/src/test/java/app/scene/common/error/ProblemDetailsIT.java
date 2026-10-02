package app.scene.common.error;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.scene.support.PostgresTestcontainer;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest
@Import({PostgresTestcontainer.class, ProblemDetailsIT.Probe.class})
class ProblemDetailsIT {

  @Autowired WebApplicationContext context;

  MockMvc mvc;

  @BeforeEach
  void mockMvc() {
    mvc = MockMvcBuilders.webAppContextSetup(context).build();
  }

  @Test
  void sceneExceptionIsProblemJson() throws Exception {
    mvc.perform(get("/__probe/conflict").header("X-Request-Id", "req-42"))
        .andExpect(status().isConflict())
        .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.type").value("urn:scene:problem:task-version-conflict"))
        .andExpect(jsonPath("$.title").value("Task version conflict"))
        .andExpect(jsonPath("$.status").value(409))
        .andExpect(jsonPath("$.code").value("TASK_VERSION_CONFLICT"))
        .andExpect(jsonPath("$.detail").value("다른 사람이 먼저 이 업무를 바꿨습니다."))
        .andExpect(jsonPath("$.traceId").value("req-42"));
  }

  @Test
  void fieldDetailBecomesErrorsAndOtherDetailsStayExtensions() throws Exception {
    mvc.perform(get("/__probe/field"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.errors[0].field").value("keepEventIds"))
        .andExpect(jsonPath("$.lifecycleVersion").value(3));
  }

  @Test
  void invalidBodyUsesRequiredFieldCode() throws Exception {
    mvc.perform(post("/__probe/body").contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isBadRequest())
        .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
        .andExpect(jsonPath("$.errors[0].field").value("name"))
        .andExpect(jsonPath("$.errors[0].code").value("REQUIRED"));
  }

  @Test
  void unsafeTraceIdIsReplaced() throws Exception {
    mvc.perform(get("/__probe/conflict").header("X-Request-Id", "bad id"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.traceId").exists())
        .andExpect(jsonPath("$.traceId").value(org.hamcrest.Matchers.not("bad id")));
  }

  @Test
  void unexpectedFailureDoesNotLeakTheExceptionMessage() throws Exception {
    mvc.perform(get("/__probe/boom"))
        .andExpect(status().isInternalServerError())
        .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").doesNotExist())
        .andExpect(
            content()
                .string(
                    org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString("secret-db-password"))));
  }

  @RestController
  static class Probe {

    @GetMapping("/__probe/conflict")
    void conflict() {
      throw new SceneException(ErrorCode.TASK_VERSION_CONFLICT);
    }

    @GetMapping("/__probe/field")
    void field() {
      throw new SceneException(
          ErrorCode.VALIDATION_FAILED, Map.of("field", "keepEventIds", "lifecycleVersion", 3));
    }

    @PostMapping("/__probe/body")
    void body(@Valid @RequestBody Name name) {}

    @GetMapping("/__probe/boom")
    void boom() {
      throw new IllegalStateException("secret-db-password");
    }

    record Name(@NotBlank String name) {}
  }
}
