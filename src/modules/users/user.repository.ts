import type { ClientSession, UpdateQuery } from "mongoose";
import { toObjectId } from "../../core/db/objectId";
import { User, type UserDoc } from "./user.model";

const SECRET_FIELDS =
  "+password +emailVerification +passwordReset +invite" as const;

export const userRepository = {
  findById(id: string) {
    return User.findById(id).lean<UserDoc>();
  },

  findByEmail(email: string) {
    return User.findOne({ email: email.toLowerCase() }).lean<UserDoc>();
  },

  findByEmailWithSecrets(email: string) {
    return User.findOne({ email: email.toLowerCase() })
      .select(SECRET_FIELDS)
      .lean<UserDoc>();
  },

  findByIdWithSecrets(id: string) {
    return User.findById(id).select(SECRET_FIELDS).lean<UserDoc>();
  },

  findByInviteTokenHash(tokenHash: string) {
    return User.findOne({ "invite.tokenHash": tokenHash })
      .select(SECRET_FIELDS)
      .lean<UserDoc>();
  },

  async create(data: Partial<UserDoc>, session?: ClientSession) {
    const [doc] = await User.create([data], { session: session ?? null });
    if (!doc) throw new Error("User insert returned no document");
    return doc.toObject<UserDoc>();
  },

  updateById(id: string, update: UpdateQuery<UserDoc>) {
    return User.findByIdAndUpdate(id, update, {
      returnDocument: "after",
      runValidators: true,
    }).lean<UserDoc>();
  },

  /** Conditional update — returns null when the filter no longer matches. */
  updateWhere(filter: Record<string, unknown>, update: UpdateQuery<UserDoc>) {
    return User.findOneAndUpdate(filter, update, {
      returnDocument: "after",
    }).lean<UserDoc>();
  },

  listAdmins(organizationId: string, skip: number, limit: number) {
    return User.find({
      superadminId: toObjectId(organizationId),
      role: "admin",
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<UserDoc[]>();
  },

  countAdmins(organizationId: string) {
    return User.countDocuments({
      superadminId: toObjectId(organizationId),
      role: "admin",
    });
  },

  findAdminInOrg(adminId: string, organizationId: string) {
    return User.findOne({
      _id: toObjectId(adminId),
      superadminId: toObjectId(organizationId),
      role: "admin",
    }).lean<UserDoc>();
  },
};
