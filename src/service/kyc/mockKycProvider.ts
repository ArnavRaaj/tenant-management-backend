import {
  IKycProvider,
  AadhaarOtpResponse,
  AadhaarVerifyResponse,
} from "./kycProvider.interface";

export class MockKycProvider implements IKycProvider {
  private static store: Map<string, { aadharNumber: string }> = new Map();

  async generateOtp(aadharNumber: string): Promise<AadhaarOtpResponse> {
    const cleaned = aadharNumber.replace(/\s+/g, "");
    if (!/^\d{12}$/.test(cleaned)) {
      throw new Error("Invalid Aadhaar number format. Expected 12 digits.");
    }

    const clientId = `mock_cli_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    MockKycProvider.store.set(clientId, { aadharNumber: cleaned });

    const last4 = cleaned.slice(-4);
    return {
      success: true,
      clientId,
      message: `OTP sent successfully to registered mobile number ending with ${last4}`,
      otpSentTo: `XXXXXX${last4}`,
    };
  }

  async submitOtp(clientId: string, otp: string): Promise<AadhaarVerifyResponse> {
    const cleanedOtp = otp.trim();
    if (!/^\d{6}$/.test(cleanedOtp)) {
      throw new Error("Invalid OTP format. Please enter a valid 6-digit OTP.");
    }

    const stored = MockKycProvider.store.get(clientId);
    const last4 = stored ? stored.aadharNumber.slice(-4) : "8901";

    return {
      verified: true,
      fullName: "Rahul S. Sharma",
      dob: "1995-07-24",
      gender: "MALE",
      address: {
        addressLine1: "House No. 42, 3rd Main Road",
        addressLine2: "Indiranagar",
        city: "Bengaluru",
        state: "Karnataka",
        postalCode: "560038",
      },
      maskedAadhar: `XXXX-XXXX-${last4}`,
      profileImage: "",
    };
  }
}

