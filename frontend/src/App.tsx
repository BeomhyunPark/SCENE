import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router";
import { EventCreate } from "./components/EventCreate";
import { EventHome } from "./components/EventHome";
import { EventList } from "./components/EventList";
import { EventParticipation } from "./components/EventParticipation";
import { EventRegistrationSetup } from "./components/EventRegistrationSetup";
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
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<PublicLogin />} />
        <Route path="/events" element={<EventList />} />
        <Route path="/events/new" element={<EventCreate />} />
        <Route path="/events/:eventId/participants/setup" element={<EventRegistrationSetup />} />
        <Route path="/events/:eventId/participants" element={<EventParticipation />} />
        <Route path="/events/:eventId" element={<EventHome />} />
        <Route path="/signup" element={<PublicSignup />} />
        <Route path="/verify-email" element={<PublicVerifyEmail />} />
        <Route path="/find-organization" element={<PublicFindOrganization />} />
        <Route path="/join-pending" element={<PublicJoinPending />} />
        <Route path="/register-organization" element={<PublicRegisterOrganization />} />
        <Route path="/forgot-password" element={<PublicForgotPassword />} />
        <Route path="/reset-password" element={<PublicResetPassword />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </QueryClientProvider>
  );
}
