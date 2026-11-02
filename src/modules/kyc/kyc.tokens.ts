import { config } from "../../config/env";
import {
  decryptOrNull,
  encrypt,
  generateToken,
  hashToken,
} from "../../core/security/crypto";

/**
 * KYC link tokens: "<24-hex organizationId><64-hex random>" (88 chars).
 * The org prefix lets lookups target one organisation (shard-key friendly);
 * the 256-bit random part is the secret. Only a SHA-256 hash is used for
 * lookup; an encrypted copy lets admins re-share the same link.
 */
export const KYC_TOKEN_PATTERN = /^([0-9a-f]{24})?[0-9a-f]{64}$/;

export interface IssuedKycToken {
  token: string;
  kycTokenHash: string;
  kycTokenEnc: string;
  kycTokenExpires: Date;
}

export const issueKycToken = (organizationId: string): IssuedKycToken => {
  const token = `${organizationId}${generateToken(32)}`;
  return {
    token,
    kycTokenHash: hashToken(token),
    kycTokenEnc: encrypt(token),
    kycTokenExpires: new Date(
      Date.now() + config.auth.kycLinkTtlHours * 3_600_000,
    ),
  };
};

/** Org id embedded in a new-format token; null for legacy 64-char tokens. */
export const orgIdFromKycToken = (token: string): string | null =>
  token.length === 88 ? token.slice(0, 24) : null;

export const kycLinkFor = (token: string): string =>
  `${config.frontendUrl}/kyc/${token}`;

export const storedKycToken = (kycTokenEnc: string | null): string | null =>
  decryptOrNull(kycTokenEnc);
