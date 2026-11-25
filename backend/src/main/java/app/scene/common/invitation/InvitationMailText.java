package app.scene.common.invitation;

/** Korean subject and body for one invitation mail. Plain text first, HTML as the alternative. */
final class InvitationMailText {

  private InvitationMailText() {}

  static String subject(InvitationMail mail) {
    return "[SCENE] " + mail.targetName() + " " + what(mail) + "에 초대받았어요";
  }

  static String plain(InvitationMail mail, String address, String expires) {
    return mail.inviterName()
        + "님이 "
        + mail.targetName()
        + " "
        + what(mail)
        + "로 초대했어요. 역할: "
        + role(mail.role())
        + "\n\n"
        + "아래 링크를 열어 초대를 수락해 주세요.\n"
        + address
        + "\n\n"
        + "- "
        + mail.recipient()
        + " 계정으로 로그인해야 수락할 수 있어요.\n"
        + "- 링크는 "
        + expires
        + "까지 쓸 수 있어요.\n"
        + "- 초대받을 일이 없었다면 이 메일은 무시해 주세요.\n";
  }

  static String html(InvitationMail mail, String address, String expires) {
    String href = escape(address);
    return "<!doctype html><html lang=\"ko\"><body style=\"margin:0;padding:24px;"
        + "font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;"
        + "color:#1a1a1a;background:#ffffff\">"
        + "<p style=\"font-size:16px;line-height:1.6\"><strong>"
        + escape(mail.inviterName())
        + "</strong>님이 <strong>"
        + escape(mail.targetName())
        + "</strong> "
        + what(mail)
        + "로 초대했어요. 역할: "
        + escape(role(mail.role()))
        + "</p>"
        + "<p style=\"margin:24px 0\"><a href=\""
        + href
        + "\" style=\"display:inline-block;padding:12px 20px;border-radius:8px;"
        + "background:#1a1a1a;color:#ffffff;text-decoration:none;font-weight:600\">"
        + "초대 수락하기</a></p>"
        + "<p style=\"font-size:13px;line-height:1.6;color:#555555\">"
        + escape(mail.recipient())
        + " 계정으로 로그인해야 수락할 수 있어요.<br>링크는 "
        + escape(expires)
        + "까지 쓸 수 있어요.<br>버튼이 열리지 않으면 이 주소를 붙여 넣어 주세요.<br>"
        + "<a href=\""
        + href
        + "\" style=\"color:#555555;word-break:break-all\">"
        + href
        + "</a></p>"
        + "<p style=\"font-size:13px;color:#888888\">초대받을 일이 없었다면 이 메일은 무시해 주세요.</p>"
        + "</body></html>";
  }

  private static String what(InvitationMail mail) {
    return mail.kind() == InvitationMail.Kind.EVENT ? "운영 멤버" : "조직 멤버";
  }

  /** Same labels as the operator screens (eventFormat.ts). */
  static String role(String code) {
    return switch (code) {
      case "MANAGER" -> "Manager";
      case "STAFF" -> "Staff";
      case "ADMIN" -> "Admin";
      case "MEMBER" -> "Member";
      default -> code;
    };
  }

  static String escape(String raw) {
    StringBuilder out = new StringBuilder(raw.length());
    for (char c : raw.toCharArray()) {
      switch (c) {
        case '&' -> out.append("&amp;");
        case '<' -> out.append("&lt;");
        case '>' -> out.append("&gt;");
        case '"' -> out.append("&quot;");
        case '\'' -> out.append("&#39;");
        default -> out.append(c);
      }
    }
    return out.toString();
  }
}
