export interface AadhaarOtpResponse {
  success: boolean;
  clientId: string;
  message: string;
  otpSentTo?: string | undefined; // e.g. "******1234"
}

export interface AadhaarVerifyResponse {
  verified: boolean;
  fullName: string;
  dob?: string | undefined;
  gender?: string | undefined;
  address: {
    addressLine1?: string | undefined;
    addressLine2?: string | undefined;
    city?: string | undefined;
    state?: string | undefined;
    postalCode?: string | undefined;
  };
  maskedAadhar: string; // e.g. "XXXX-XXXX-1234"
  profileImage?: string | undefined;
}

export interface IKycProvider {
  generateOtp(aadharNumber: string): Promise<AadhaarOtpResponse>;
  submitOtp(clientId: string, otp: string): Promise<AadhaarVerifyResponse>;
}

