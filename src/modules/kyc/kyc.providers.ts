import crypto from "crypto";
import { config } from "../../config/env";
import { UnprocessableError, UpstreamError } from "../../core/errors/AppError";
import { fetchJson, getString, isRecord } from "../../core/utils/http";
import { maskAadhaar } from "../../core/utils/text";

export interface AadhaarOtpResponse {
  clientId: string;
  message: string;
  otpSentTo: string;
}

export interface AadhaarVerifyResponse {
  fullName: string;
  gender: string | null;
  maskedAadhaar: string;
  address: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postalCode: string;
  } | null;
}

export interface KycProvider {
  generateOtp(aadhaar: string): Promise<AadhaarOtpResponse>;
  submitOtp(clientId: string, otp: string): Promise<AadhaarVerifyResponse>;
}

/**
 * Offline provider for development/tests. Accepts any 6-digit OTP.
 * Refused in production by config validation (KYC_PROVIDER=mock).
 */
export class MockKycProvider implements KycProvider {
  private static sessions = new Map<string, string>();

  async generateOtp(aadhaar: string): Promise<AadhaarOtpResponse> {
    const clientId = `mock_${crypto.randomUUID()}`;
    MockKycProvider.sessions.set(clientId, aadhaar.slice(-4));
    return {
      clientId,
      message: `OTP sent to the mobile number linked with Aadhaar ending ${aadhaar.slice(-4)}`,
      otpSentTo: `XXXXXX${aadhaar.slice(-4)}`,
    };
  }

  async submitOtp(
    clientId: string,
    otp: string,
  ): Promise<AadhaarVerifyResponse> {
    const last4 = MockKycProvider.sessions.get(clientId);
    if (!last4)
      throw new UnprocessableError("OTP session expired. Request a new OTP.");
    if (!/^\d{6}$/.test(otp)) throw new UnprocessableError("Invalid OTP");
    MockKycProvider.sessions.delete(clientId);
    return {
      fullName: "Rahul S. Sharma",
      gender: "male",
      maskedAadhaar: `XXXX-XXXX-${last4}`,
      address: {
        addressLine1: "House No. 42, 3rd Main Road",
        addressLine2: "Indiranagar",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560038",
      },
    };
  }
}

/** Surepass Aadhaar e-KYC (UIDAI OTP). */
export class SurepassKycProvider implements KycProvider {
  private headers() {
    return {
      Authorization: `Bearer ${config.kyc.surepassToken}`,
      "Content-Type": "application/json",
    };
  }

  async generateOtp(aadhaar: string): Promise<AadhaarOtpResponse> {
    const res = await fetchJson(
      `${config.kyc.surepassBaseUrl}/aadhaar-v2/generate-otp`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ id_number: aadhaar }),
      },
    );
    const data = isRecord(res.body) ? res.body.data : undefined;
    const clientId = getString(data, "client_id");
    if (!res.ok || !clientId) {
      if (res.status >= 500)
        throw new UpstreamError("Aadhaar service is unavailable");
      throw new UnprocessableError(
        getString(res.body, "message") ?? "Could not send Aadhaar OTP",
      );
    }
    return {
      clientId,
      message:
        getString(res.body, "message") ??
        "OTP sent to Aadhaar-linked mobile number",
      otpSentTo: "UIDAI registered mobile",
    };
  }

  async submitOtp(
    clientId: string,
    otp: string,
  ): Promise<AadhaarVerifyResponse> {
    const res = await fetchJson(
      `${config.kyc.surepassBaseUrl}/aadhaar-v2/submit-otp`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ client_id: clientId, otp }),
      },
    );
    const data = isRecord(res.body) ? res.body.data : undefined;
    if (!res.ok || !isRecord(data)) {
      if (res.status >= 500)
        throw new UpstreamError("Aadhaar service is unavailable");
      throw new UnprocessableError("Aadhaar OTP verification failed");
    }
    const addr = isRecord(data.split_address) ? data.split_address : {};
    const part = (k: string) => getString(addr, k) ?? "";
    const aadhaarNumber = getString(data, "aadhaar_number") ?? "";
    return {
      fullName: getString(data, "full_name") ?? "",
      gender:
        (getString(data, "gender") ?? "").toLowerCase() === "m"
          ? "male"
          : (getString(data, "gender") ?? "").toLowerCase() === "f"
            ? "female"
            : null,
      maskedAadhaar: aadhaarNumber
        ? maskAadhaar(aadhaarNumber)
        : "XXXX-XXXX-XXXX",
      address: {
        addressLine1: [part("house"), part("street"), part("landmark")]
          .filter(Boolean)
          .join(", "),
        addressLine2: [part("loc"), part("vtc"), part("po")]
          .filter(Boolean)
          .join(", "),
        city: part("dist"),
        state: part("state"),
        postalCode: String(addr.pincode ?? ""),
      },
    };
  }
}

let provider: KycProvider | null = null;

export const getKycProvider = (): KycProvider => {
  if (!provider) {
    provider =
      config.kyc.provider === "surepass"
        ? new SurepassKycProvider()
        : new MockKycProvider();
  }
  return provider;
};

export const setKycProvider = (p: KycProvider | null): void => {
  provider = p;
};
