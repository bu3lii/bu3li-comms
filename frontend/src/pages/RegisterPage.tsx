import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/layout/AuthLayout";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useRegister } from "../hooks/useAuthMutations";
import { ApiError, NetworkError } from "../api/client";

const MIN_PASSWORD_LENGTH = 8;

export function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const register = useRegister();
  const navigate = useNavigate();

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!username.trim()) errors.username = "Choose a username.";
    if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Enter a valid email.";
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (confirmPassword !== password) errors.confirmPassword = "Passwords don't match.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) {
      return;
    }

    register.mutate(
      { username: username.trim(), email: email.trim(), password },
      {
        onSuccess: () => navigate("/chat", { replace: true }),
        onError: (error) => {
          if (error instanceof ApiError && error.isRateLimited) {
            setFormError("Too many accounts created recently. Try again later.");
          } else if (error instanceof ApiError) {
            setFormError("Could not create that account. The email or username may already be taken.");
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
      <h1 className="mb-5 font-display text-lg font-semibold">Create an account</h1>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Input
          label="Username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={fieldErrors.username}
          required
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          required
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          required
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={fieldErrors.confirmPassword}
          required
        />
        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}
        <Button type="submit" loading={register.isPending} className="mt-1 w-full">
          Create account
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-accent hover:text-accent-strong">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
