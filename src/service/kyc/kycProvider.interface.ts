export interface AadhaarOtpResponse {
  success: boolean;
  clientId: string;
  message: string;
  otpSentTo?: string; // e.g. "******1234"
}

export interface AadhaarVerifyResponse {
  verified: boolean;
  fullName: string;
  dob?: string;
  gender?: string;
  address: {
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  maskedAadhar: string; // e.g. "XXXX-XXXX-1234"
  profileImage?: string;
}

export interface IKycProvider {
  generateOtp(aadharNumber: string): Promise<AadhaarOtpResponse>;
  submitOtp(clientId: string, otp: string): Promise<AadhaarVerifyResponse>;
}

