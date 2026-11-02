import bcrypt from "bcryptjs";
import { config } from "../../config/env";

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, config.auth.bcryptRounds);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

/** Pre-computed hash compared against when the user does not exist, so
 * login timing does not reveal whether an email is registered. */
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 4);
export const burnPasswordCheck = (plain: string): Promise<boolean> =>
  bcrypt.compare(plain, DUMMY_HASH);

/** 8+ chars with upper, lower, digit and special character. */
export const PASSWORD_POLICY =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()\-_=+])[A-Za-z\d@$!%*?&#^()\-_=+]{8,128}$/;
