import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router";
import { createQueryClient } from "./api/queryClient";
import { MockBanner } from "./components/MockBanner";
import { EventCreate } from "./components/EventCreate";
import { EventEnd } from "./components/EventEnd";
import { EventHome } from "./components/EventHome";
import { EventRetrospective } from "./components/EventRetrospective";
import { EventSettings } from "./components/EventSettings";
import { EventList } from "./components/EventList";
import { EventParticipation } from "./components/EventParticipation";
import { EventRegistrationSetup } from "./components/EventRegistrationSetup";
import { EventTasks } from "./components/EventTasks";
import { TaskDetail } from "./components/TaskDetail";
import { InvitationAccept } from "./components/InvitationAccept";
import { SpaceLeave } from "./components/SpaceLeave";
import { SpaceSettings } from "./components/SpaceSettings";
import { RequireOperator } from "./components/RequireOperator";
import { PublicHeader } from "./components/PublicHeader";
import { PublicHome } from "./components/PublicHome";
import { PublicLogin } from "./components/PublicLogin";
import { PublicSignup } from "./components/PublicSignup";
import { PublicFindOrganization } from "./components/PublicFindOrganization";
import { PublicJoinPending } from "./components/PublicJoinPending";
import { PublicForgotPassword } from "./components/PublicForgotPassword";
import { PublicRegisterOrganization } from "./components/PublicRegisterOrganization";
import { PublicResetPassword } from "./components/PublicResetPassword";
import { PublicVerifyEmail } from "./components/PublicVerifyEmail";

function Home() {
  return (
    <>
      <PublicHeader />
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

  return (
    <QueryClientProvider client={queryClient}>
      <MockBanner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<PublicLogin />} />
        <Route element={<RequireOperator />}>
          <Route path="/events" element={<EventList />} />
          <Route path="/settings" element={<SpaceSettings />} />
          <Route path="/spaces/:spaceId/leave" element={<SpaceLeave />} />
          <Route path="/events/new" element={<EventCreate />} />
          <Route path="/events/:eventId/settings" element={<EventSettings />} />
          <Route path="/events/:eventId/end" element={<EventEnd />} />
          <Route path="/events/:eventId/retrospective" element={<EventRetrospective />} />
          <Route path="/events/:eventId/tasks/:taskId" element={<TaskDetail />} />
          <Route path="/events/:eventId/tasks" element={<EventTasks />} />
          <Route path="/events/:eventId/participants/setup" element={<EventRegistrationSetup />} />
          <Route path="/events/:eventId/participants" element={<EventParticipation />} />
          <Route path="/events/:eventId" element={<EventHome />} />
        </Route>
        <Route path="/signup" element={<PublicSignup />} />
        <Route path="/verify-email" element={<PublicVerifyEmail />} />
        <Route path="/find-organization" element={<PublicFindOrganization />} />
        <Route path="/join-pending" element={<PublicJoinPending />} />
        <Route path="/register-organization" element={<PublicRegisterOrganization />} />
        <Route path="/forgot-password" element={<PublicForgotPassword />} />
        <Route path="/reset-password" element={<PublicResetPassword />} />
        <Route path="/operator/invitations" element={<InvitationAccept />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </QueryClientProvider>
  );
}
