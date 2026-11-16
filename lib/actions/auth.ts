"use server"

import { AuthError } from "next-auth"
import bcrypt from "bcryptjs"
import { signIn, signOut } from "@/auth"
import { db } from "@/lib/db"
import { claimGuestOrders } from "@/lib/auth/claim"

export type AuthState = { error?: string; fieldErrors?: Record<string, string> } | undefined

/** Only same-site paths, so ?next= can't send people to another domain. */
function safeNext(value: FormDataEntryValue | null, fallback = "/account") {
  const v = typeof value === "string" ? value : ""
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : fallback
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function loginAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase()
  const password = String(form.get("password") ?? "")
  const fieldErrors: Record<string, string> = {}
  if (!EMAIL.test(email)) fieldErrors.email = "Enter a valid email address"
  if (!password) fieldErrors.password = "Enter your password"
  if (Object.keys(fieldErrors).length) return { fieldErrors }

  try {
    await signIn("credentials", { email, password, redirectTo: safeNext(form.get("next")) })
  } catch (e) {
    if (e instanceof AuthError) {
      const code = (e as AuthError & { code?: string }).code
      return { error: code === "suspended" ? "This account is suspended. Contact support." : "Email or password is incorrect" }
    }
    throw e // NEXT_REDIRECT on success
  }
}

export async function registerAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const name = String(form.get("name") ?? "").trim()
  const email = String(form.get("email") ?? "").trim().toLowerCase()
  const password = String(form.get("password") ?? "")
  const fieldErrors: Record<string, string> = {}
  if (name.length < 2 || name.length > 80) fieldErrors.name = "Enter your full name"
  if (!EMAIL.test(email) || email.length > 254) fieldErrors.email = "Enter a valid email address"
  if (password.length < 8 || password.length > 128) fieldErrors.password = "Password must be at least 8 characters"
  if (!form.get("terms")) fieldErrors.terms = "Please accept the terms to continue"
  if (Object.keys(fieldErrors).length) return { fieldErrors }

  const existing = await db.user.findUnique({ where: { email }, select: { id: true, status: true } })
  const inviteToken = String(form.get("invite") ?? "")
  let userId: string
  if (existing?.status === "INVITED") {
    // Staff invite: the emailed token proves the address; the role was set when inviting
    const invite = inviteToken && (await db.verificationToken.findUnique({ where: { token: inviteToken } }))
    if (!invite || invite.identifier !== email || invite.expires < new Date())
      return { error: "This invitation link is invalid or has expired. Ask an admin to resend it." }
    await db.verificationToken.delete({ where: { token: inviteToken } })
    await db.user.update({
      where: { id: existing.id },
      data: { name, passwordHash: await bcrypt.hash(password, 10), status: "ACTIVE", emailVerified: new Date(), lastActiveAt: new Date() },
    })
    userId = existing.id
  } else if (existing) {
    return { fieldErrors: { email: "An account with this email already exists. Sign in instead." } }
  } else {
    const user = await db.user.create({ data: { name, email, passwordHash: await bcrypt.hash(password, 10), lastActiveAt: new Date() } })
    userId = user.id
  }
  await claimGuestOrders(userId, email)

  try {
    await signIn("credentials", { email, password, redirectTo: safeNext(form.get("next")) })
  } catch (e) {
    if (e instanceof AuthError) return { error: "Account created, but signing in failed. Try signing in." }
    throw e
  }
}

export async function googleSignInAction(form: FormData) {
  await signIn("google", { redirectTo: safeNext(form.get("next")) })
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" })
}
