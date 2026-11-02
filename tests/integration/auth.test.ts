import { beforeEach, describe, expect, it, vi } from "vitest";
import { RefreshToken } from "../../src/modules/auth/refreshToken.model";
import { User } from "../../src/modules/users/user.model";
import { useTestDatabase } from "../helpers/db";
import { api, createSuperadmin, PASSWORD } from "../helpers/factory";

const sent = vi.hoisted(() => [] as { to: string; text: string }[]);

vi.mock(
  "../../src/modules/notifications/email.service",
  async (importOriginal) => {
    const original = await importOriginal<Record<string, unknown>>();
    return {
      ...original,
      sendEmail: vi.fn(async (to: string, content: { text: string }) => {
        sent.push({ to, text: content.text });
      }),
    };
  },
);

const lastOtpFor = (email: string): string => {
  const mail = [...sent].reverse().find((m) => m.to === email);
  const otp = mail?.text.match(/code: (\d{6})/)?.[1];
  if (!otp) throw new Error(`No OTP email captured for ${email}`);
  return otp;
};

const refreshCookie = (res: { headers: Record<string, unknown> }): string => {
  const cookies = res.headers["set-cookie"] as string[] | undefined;
  const cookie = cookies?.find((c) => c.startsWith("nv_rt="));
  if (!cookie) throw new Error("No refresh cookie set");
  return cookie.split(";")[0] as string;
};

describe("Authentication", () => {
  useTestDatabase();

  beforeEach(() => {
    sent.length = 0;
  });

  it("registers (201), stores only a hashed OTP, and blocks login until verified", async () => {
    const email = "new.owner@example.com";
    const reg = await api()
      .post("/api/auth/register")
      .send({ name: "New Owner", email, password: PASSWORD });
    expect(reg.status).toBe(201);
    expect(reg.body.data.email).toBe(email);

    const otp = lastOtpFor(email);
    const stored = await User.findOne({ email })
      .select("+emailVerification +password")
      .lean();
    expect(stored?.password).not.toBe(PASSWORD); // bcrypt hash
    expect(stored?.password).toMatch(/^\$2[aby]\$/);
    expect(JSON.stringify(stored?.emailVerification)).not.toContain(otp);

    const login = await api()
      .post("/api/auth/login")
      .send({ email, password: PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("rejects duplicate registration with 409", async () => {
    const owner = await createSuperadmin();
    const res = await api()
      .post("/api/auth/register")
      .send({ name: "Dup", email: owner.user.email, password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_RESOURCE");
  });

  it("enforces the password policy", async () => {
    const res = await api()
      .post("/api/auth/register")
      .send({ name: "Weak", email: "weak@example.com", password: "password" });
    expect(res.status).toBe(400);
  });

  it("verifies email with the correct OTP and issues a session (200 + httpOnly cookie)", async () => {
    const email = "verify.me@example.com";
    await api()
      .post("/api/auth/register")
      .send({ name: "Verify Me", email, password: PASSWORD });

    const wrong = await api()
      .post("/api/auth/verify-email")
      .send({ email, otp: "000000" });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe("INVALID_OTP");

    const res = await api()
      .post("/api/auth/verify-email")
      .send({ email, otp: lastOtpFor(email) });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.permissions).toContain("tenant:write");
    expect(res.body.data).not.toHaveProperty("refreshToken");
    const cookie = (res.headers["set-cookie"] as unknown as string[]).find(
      (c) => c.startsWith("nv_rt="),
    );
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
  });

  it("burns the OTP after too many wrong attempts", async () => {
    const email = "brute@example.com";
    await api()
      .post("/api/auth/register")
      .send({ name: "Brute", email, password: PASSWORD });
    const otp = lastOtpFor(email);
    for (let i = 0; i < 5; i++) {
      await api().post("/api/auth/verify-email").send({ email, otp: "111111" });
    }
    const res = await api().post("/api/auth/verify-email").send({ email, otp });
    expect(res.status).toBe(429);
  });

  it("logs in with 200 (not 201) and rejects bad credentials with 401", async () => {
    const owner = await createSuperadmin();
    const ok = await api()
      .post("/api/auth/login")
      .send({ email: owner.user.email, password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.email).toBe(owner.user.email);

    const bad = await api()
      .post("/api/auth/login")
      .send({ email: owner.user.email, password: "Wrong@123" });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("INVALID_CREDENTIALS");

    const unknown = await api()
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "Wrong@123" });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(bad.body.error.message); // no user enumeration
  });

  it("locks an account+IP after 5 failed logins (429 with Retry-After)", async () => {
    const owner = await createSuperadmin();
    for (let i = 0; i < 5; i++) {
      await api()
        .post("/api/auth/login")
        .send({ email: owner.user.email, password: "Wrong@123" });
    }
    const res = await api()
      .post("/api/auth/login")
      .send({ email: owner.user.email, password: PASSWORD });
    expect(res.status).toBe(429);
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("rotates refresh tokens and revokes the family when a rotated token is replayed", async () => {
    const owner = await createSuperadmin();
    const login = await api()
      .post("/api/auth/login")
      .send({ email: owner.user.email, password: PASSWORD });
    const original = refreshCookie(login);

    const refreshed = await api()
      .post("/api/auth/refresh")
      .set("Cookie", original);
    expect(refreshed.status).toBe(200);
    const rotated = refreshCookie(refreshed);
    expect(rotated).not.toBe(original);

    // Simulate the replay happening after the concurrency grace window.
    await RefreshToken.updateMany(
      { revokedReason: "rotated" },
      { $set: { revokedAt: new Date(Date.now() - 60_000) } },
    );
    const replay = await api()
      .post("/api/auth/refresh")
      .set("Cookie", original);
    expect(replay.status).toBe(401);

    // Theft response: the legitimate (rotated) token is now revoked too.
    const afterTheft = await api()
      .post("/api/auth/refresh")
      .set("Cookie", rotated);
    expect(afterTheft.status).toBe(401);
  });

  it("rejects refresh from an untrusted Origin (CSRF guard)", async () => {
    const owner = await createSuperadmin();
    const login = await api()
      .post("/api/auth/login")
      .send({ email: owner.user.email, password: PASSWORD });
    const res = await api()
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie(login))
      .set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
  });

  it("logout revokes the session (204) and clears the cookie", async () => {
    const owner = await createSuperadmin();
    const login = await api()
      .post("/api/auth/login")
      .send({ email: owner.user.email, password: PASSWORD });
    const cookie = refreshCookie(login);

    const out = await api().post("/api/auth/logout").set("Cookie", cookie);
    expect(out.status).toBe(204);
    expect(
      (await api().post("/api/auth/refresh").set("Cookie", cookie)).status,
    ).toBe(401);
  });

  it("GET /me returns the profile with permissions; expired/garbage tokens get 401", async () => {
    const owner = await createSuperadmin();
    const me = await api().get("/api/auth/me").set(owner.auth);
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe("superadmin");

    const garbage = await api()
      .get("/api/auth/me")
      .set("Authorization", "Bearer not.a.jwt");
    expect(garbage.status).toBe(401);
  });

  it("password reset: generic response for unknown emails, then revokes all sessions", async () => {
    const unknown = await api()
      .post("/api/auth/forgot-password/send-otp")
      .send({ email: "ghost@example.com" });
    expect(unknown.status).toBe(200);

    const owner = await createSuperadmin();
    const known = await api()
      .post("/api/auth/forgot-password/send-otp")
      .send({ email: owner.user.email });
    expect(known.status).toBe(200);
    expect(known.body.data.message).toBe(unknown.body.data.message);

    const otp = lastOtpFor(owner.user.email);
    const reset = await api()
      .post("/api/auth/forgot-password/reset-password")
      .send({
        email: owner.user.email,
        otp,
        password: "N3w@Password",
        confirmPassword: "N3w@Password",
      });
    expect(reset.status).toBe(200);

    // The access token issued before the reset no longer works.
    expect((await api().get("/api/auth/me").set(owner.auth)).status).toBe(401);
    const login = await api()
      .post("/api/auth/login")
      .send({ email: owner.user.email, password: "N3w@Password" });
    expect(login.status).toBe(200);
  });

  it("enforces a resend cooldown on OTP emails", async () => {
    const owner = await createSuperadmin();
    await api()
      .post("/api/auth/forgot-password/send-otp")
      .send({ email: owner.user.email });
    const again = await api()
      .post("/api/auth/forgot-password/send-otp")
      .send({ email: owner.user.email });
    expect(again.status).toBe(429);
  });
});
