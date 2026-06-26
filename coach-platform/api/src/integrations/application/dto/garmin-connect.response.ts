/**
 * Result of a Garmin connect attempt. `connected` means the login fully
 * succeeded; `mfa_required` means the caller must collect the 2FA code and call
 * the MFA endpoint with the returned `loginId`.
 */
export class GarminConnectResponse {
  status!: 'connected' | 'mfa_required';
  /** Present only when status is 'mfa_required'. */
  loginId?: string;
}
