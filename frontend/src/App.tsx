import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router";
import { PublicHeader } from "./components/PublicHeader";

function Shell() {
  return (
    <>
      <PublicHeader />
      <main />
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
        <Route path="/" element={<Shell />} />
        <Route path="/login" element={<Shell />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </QueryClientProvider>
  );
}
