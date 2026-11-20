import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router";
import { createQueryClient } from "./api/queryClient";
import { MockBanner } from "./components/MockBanner";
import { EventCreate } from "./components/EventCreate";
import { EventEnd } from "./components/EventEnd";
import { EventField } from "./components/EventField";
import { EventNotifications } from "./components/EventNotifications";
import { OrgNotifications } from "./components/OrgNotifications";
import { EventGroups } from "./components/EventGroups";
import { EventHome } from "./components/EventHome";
import { EventRetrospective } from "./components/EventRetrospective";
import { EventSettings } from "./components/EventSettings";
import { EventList } from "./components/EventList";
import { EventApplication } from "./components/EventApplication";
import { EventApplicationSummary } from "./components/EventApplicationSummary";
import { EventMenuPending } from "./components/EventMenuPending";
import { EventOperators } from "./components/EventOperators";
import { EventParticipation } from "./components/EventParticipation";
import { EventRegistrationSetup } from "./components/EventRegistrationSetup";
import { EventTasks } from "./components/EventTasks";
import { TaskDetail } from "./components/TaskDetail";
import { InvitationAccept } from "./components/InvitationAccept";
import { ParticipantEnter } from "./components/ParticipantEnter";
import { PublicApply } from "./components/PublicApply";
import { SpaceLeave } from "./components/SpaceLeave";
import { SpaceMembers } from "./components/SpaceMembers";
import { SpaceSettings } from "./components/SpaceSettings";
import { RequireOperator } from "./components/RequireOperator";
import { PublicHeader } from "./components/PublicHeader";
import { PublicHome } from "./components/PublicHome";
import { PublicInviteOnly } from "./components/PublicInviteOnly";
import { PublicLogin } from "./components/PublicLogin";
import { PublicSignup } from "./components/PublicSignup";
import { PublicFindOrganization } from "./components/PublicFindOrganization";
import { PublicJoinPending } from "./components/PublicJoinPending";
import { PublicForgotPassword } from "./components/PublicForgotPassword";
import { PublicRegisterOrganization } from "./components/PublicRegisterOrganization";
import { PublicResetPassword } from "./components/PublicResetPassword";
import { PublicVerifyEmail } from "./components/PublicVerifyEmail";
import { LoginDone } from "./components/LoginDone";
import { MenuPending } from "./components/MenuPending";
import { prototypeScreensEnabled } from "./prototypeScreens";

function Home() {
  return (
    <>
      <PublicHeader login={false} />
      <PublicHome />
    </>
  );
}

function NotFound() {
  return (
    <>
      <PublicHeader />
      <main>
        <p>페이지를 찾을 수 없어요.</p>
      </main>
    </>
  );
}

export function App() {
  const [queryClient] = useState(() => createQueryClient());
  const prototypes = prototypeScreensEnabled();
  const inviteOnly = <Navigate to="/find-organization" replace />;

  return (
    <QueryClientProvider client={queryClient}>
      <MockBanner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<PublicLogin />} />
        <Route path="/login/done" element={<LoginDone />} />
        <Route element={<RequireOperator />}>
          <Route path="/events" element={<EventList />} />
          <Route path="/members" element={<SpaceMembers />} />
          <Route path="/settings" element={<SpaceSettings />} />
          <Route path="/notifications" element={<OrgNotifications />} />
          <Route path="/history" element={<MenuPending title="기록" />} />
          <Route path="/guides" element={<MenuPending title="안내" />} />
          <Route path="/schedule" element={<MenuPending title="일정" />} />
          <Route path="/integrations" element={<MenuPending title="연동" />} />
          {/* Event operation menus live only inside an event (#376); old organization links open the event list. */}
          {["/field", "/tasks", "/participants", "/operators"].map((path) => (
            <Route key={path} path={path} element={<Navigate to="/events" replace />} />
          ))}
          <Route path="/spaces/:spaceId/leave" element={<SpaceLeave />} />
          <Route path="/events/new" element={<EventCreate />} />
          <Route path="/events/:eventId/settings" element={<EventSettings />} />
          <Route
            path="/events/:eventId/areas"
            element={<EventMenuPending title="다른 기능 시작" message="이 행사에서 쓸 기능을 고르는 화면은 아직 만들고 있어요." />}
          />
          <Route path="/events/:eventId/field" element={<EventField />} />
          <Route path="/events/:eventId/notifications" element={<EventNotifications />} />
          <Route path="/events/:eventId/groups" element={<EventGroups />} />
          <Route path="/events/:eventId/end" element={<EventEnd />} />
          <Route path="/events/:eventId/retrospective" element={<EventRetrospective />} />
          <Route path="/events/:eventId/tasks/:taskId" element={<TaskDetail />} />
          <Route path="/events/:eventId/tasks" element={<EventTasks />} />
          <Route path="/events/:eventId/participants/setup" element={<EventRegistrationSetup />} />
          <Route path="/events/:eventId/participants/summary" element={<EventApplicationSummary />} />
          <Route path="/events/:eventId/operators" element={<EventOperators />} />
          <Route path="/events/:eventId/participants/:applicationId" element={<EventApplication />} />
          <Route path="/events/:eventId/participants" element={<EventParticipation />} />
          <Route path="/events/:eventId" element={<EventHome />} />
        </Route>
        <Route path="/signup" element={<PublicSignup />} />
        <Route path="/verify-email" element={<PublicVerifyEmail />} />
        <Route path="/find-organization" element={prototypes ? <PublicFindOrganization /> : <PublicInviteOnly />} />
        <Route path="/join-pending" element={prototypes ? <PublicJoinPending /> : inviteOnly} />
        <Route
          path="/register-organization"
          element={prototypes ? <PublicRegisterOrganization /> : inviteOnly}
        />
        <Route path="/forgot-password" element={<PublicForgotPassword />} />
        <Route path="/reset-password" element={<PublicResetPassword />} />
        <Route path="/operator/invitations" element={<InvitationAccept />} />
        <Route path="/apply/:eventId/:formId" element={<PublicApply />} />
        <Route path="/participate/:eventId/*" element={<ParticipantEnter />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </QueryClientProvider>
  );
}
