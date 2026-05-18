// Pure email/password validators, extracted from session.ts so node --test
// (with --experimental-strip-types) can import them without dragging in the
// browser-only supabase client.

export const PASSWORD_MIN_LENGTH = 12;

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (trimmed.length === 0) return "Enter your email.";
  if (trimmed.length > 254) return "That email is too long.";
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(trimmed) ? null : "That email doesn't look right.";
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[A-Z]/.test(password)) return "Password needs an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password needs a number.";
  return null;
}
