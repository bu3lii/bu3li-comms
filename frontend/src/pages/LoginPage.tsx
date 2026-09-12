import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/layout/AuthLayout";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useLogin } from "../hooks/useAuthMutations";
import { ApiError, NetworkError } from "../api/client";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!email.trim() || !password) {
      setFormError("Enter your email and password.");
      return;
    }

    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: () => {
          const from = (location.state as { from?: string } | null)?.from ?? "/chat";
          navigate(from, { replace: true });
        },
        onError: (error) => {
          if (error instanceof ApiError && (error.isUnauthorized || error.status === 400)) {
            setFormError("Incorrect email or password.");
          } else if (error instanceof NetworkError) {
            setFormError(error.message);
          } else {
            setFormError("Something went wrong. Try again.");
          }
        },
      },
    );
  }

  return (
    <AuthLayout>
      <h1 className="mb-5 font-display text-lg font-semibold">Log in</h1>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}
        <Button type="submit" loading={login.isPending} className="mt-1 w-full">
          Log in
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-text-secondary">
        No account?{" "}
        <Link to="/register" className="font-medium text-accent hover:text-accent-strong">
          Register
        </Link>
      </p>
    </AuthLayout>
  );
}
