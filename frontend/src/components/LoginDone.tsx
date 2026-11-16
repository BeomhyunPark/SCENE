import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { takeLoginNext } from "../api/googleSignIn";

/** Where the server lands a finished Google sign-in. Replaces itself so Back skips it. */
export function LoginDone() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    queryClient.clear();
    navigate(takeLoginNext(), { replace: true });
  }, [navigate, queryClient]);
  return <p className="public-login__notice">로그인하는 중이에요.</p>;
}
