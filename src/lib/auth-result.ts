export type AuthResult = {
  ok: boolean;
  message: string;
  redirectTo?:
    | '/account'
    | '/account?reason=profile-required'
    | '/login'
    | '/login?reason=password-changed';
};
