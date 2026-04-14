export const PRIMARY_ADMIN_EMAIL = (process.env.PRIMARY_ADMIN_EMAIL ?? '').trim().toLowerCase()

export function isPrimaryAdminEmail(email?: string | null): boolean {
  return Boolean(email && PRIMARY_ADMIN_EMAIL && email.toLowerCase() === PRIMARY_ADMIN_EMAIL)
}

export function hasAdminAccess(user: { email?: string | null; isAdmin?: boolean | null }): boolean {
  return Boolean(user.isAdmin) || isPrimaryAdminEmail(user.email)
}
