import {
  IKycProvider,
  AadhaarOtpResponse,
  AadhaarVerifyResponse,
} from "./kycProvider.interface";

export class SurepassKycProvider implements IKycProvider {
  private apiToken: string;
  private baseUrl: string;

  constructor(apiToken?: string, baseUrl?: string) {
    this.apiToken = apiToken || process.env.SUREPASS_API_TOKEN || "";
    this.baseUrl =
      baseUrl ||
      process.env.SUREPASS_BASE_URL ||
      "https://sandbox.surepass.io/api/v1";
  }

  async generateOtp(aadharNumber: string): Promise<AadhaarOtpResponse> {
    const cleaned = aadharNumber.replace(/\s+/g, "");
    if (!/^\d{12}$/.test(cleaned)) {
      throw new Error("Invalid Aadhaar number format. Expected 12 digits.");
    }

    try {
      const response = await fetch(`${this.baseUrl}/aadhaar-v2/generate-otp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id_number: cleaned }),
      });

      const data: any = await response.json();
      if (response.ok && data && data.success) {
        const result: AadhaarOtpResponse = {
          success: true,
          clientId: data.data.client_id,
          message: data.message || "OTP dispatched to Aadhaar linked mobile number",
        };
        if (data.data.otp_sent) {
          result.otpSentTo = "UIDAI registered mobile";
        }
        return result;
      }

      throw new Error(data?.message || "Failed to generate Aadhaar OTP");
    } catch (err: any) {
      throw new Error(err.message || "Surepass Aadhaar OTP generation failed");
    }
  }

  async submitOtp(clientId: string, otp: string): Promise<AadhaarVerifyResponse> {
    const cleanedOtp = otp.trim();
    if (!/^\d{6}$/.test(cleanedOtp)) {
      throw new Error("Invalid OTP format. Please enter a valid 6-digit OTP.");
    }

    try {
      const response = await fetch(`${this.baseUrl}/aadhaar-v2/submit-otp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ client_id: clientId, otp: cleanedOtp }),
      });

      const resData: any = await response.json();
      if (response.ok && resData && resData.success && resData.data) {
        const d = resData.data;
        const addr = d.split_address || {};
        const maskedAadhaar =
          d.aadhaar_number ||
          (d.id_number ? `XXXX-XXXX-${d.id_number.slice(-4)}` : "XXXX-XXXX-XXXX");

        return {
          verified: true,
          fullName: d.full_name || "",
          dob: d.dob || "",
          gender: d.gender || "",
          address: {
            addressLine1: [addr.house, addr.street, addr.landmark]
              .filter(Boolean)
              .join(", "),
            addressLine2: [addr.loc, addr.vtc, addr.po]
              .filter(Boolean)
              .join(", "),
            city: addr.dist || "",
            state: addr.state || "",
            postalCode: addr.pincode ? String(addr.pincode) : "",
          },
          maskedAadhar: maskedAadhaar,
          profileImage: d.profile_image || "",
        };
      }

      throw new Error(resData?.message || "OTP verification failed");
    } catch (err: any) {
      throw new Error(err.message || "Surepass Aadhaar verification failed");
    }
  }
}
