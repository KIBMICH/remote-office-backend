import { IUser } from "../models/User";

export function serializeUser(u: any) {
  // Accept mongoose document or plain object
  const firstName = u.firstName ?? null;
  const lastName = u.lastName ?? null;
  const legacyName = u.name ?? null;
  const computedName = (firstName || lastName)
    ? `${firstName ?? ""} ${lastName ?? ""}`.trim()
    : legacyName;

  return {
    id: String(u._id ?? u.id),
    name: computedName ?? null,
    firstName,
    lastName,
    email: u.email,
    role: u.role,
    phone: u.phone ?? null,
    avatarUrl: u.avatarUrl ?? u.avatar ?? null,
    jobTitle: u.jobTitle ?? null,
    timezone: u.timezone ?? null,
    language: u.language ?? "en",
    status: u.status ?? "active",
    country: u.country ?? null,
    company: u.company ?? null,
    createdAt: u.createdAt ?? null,
    updatedAt: u.updatedAt ?? null,
  };
}

export default serializeUser;
