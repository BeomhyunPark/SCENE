package app.scene.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.ServletException;
import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestIdFilterTest {

  private final RequestIdFilter filter = new RequestIdFilter();

  @Test
  void keepsAValidRequestIdOnTheResponseAndInMdcWhileTheChainRuns()
      throws ServletException, IOException {
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/health");
    request.setQueryString("token=secret");
    request.addHeader(RequestIds.HEADER, "req-42");
    MockHttpServletResponse response = new MockHttpServletResponse();
    String[] seen = new String[1];

    filter.doFilter(
        request,
        response,
        (req, res) -> {
          seen[0] = MDC.get(RequestIds.MDC_KEY);
          assertThat(req.getAttribute(RequestIds.ATTRIBUTE)).isEqualTo("req-42");
        });

    assertThat(seen[0]).isEqualTo("req-42");
    assertThat(response.getHeader(RequestIds.HEADER)).isEqualTo("req-42");
    assertThat(MDC.get(RequestIds.MDC_KEY)).isNull();
  }

  @Test
  void replacesAnInvalidRequestId() throws ServletException, IOException {
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/events");
    request.addHeader(RequestIds.HEADER, "bad id");
    MockHttpServletResponse response = new MockHttpServletResponse();

    filter.doFilter(request, response, new MockFilterChain());

    String assigned = response.getHeader(RequestIds.HEADER);
    assertThat(assigned).isNotEqualTo("bad id");
    assertThat(assigned).matches("[0-9a-f\\-]{36}");
    assertThat(request.getAttribute(RequestIds.ATTRIBUTE)).isEqualTo(assigned);
    assertThat(MDC.get(RequestIds.MDC_KEY)).isNull();
  }
}
