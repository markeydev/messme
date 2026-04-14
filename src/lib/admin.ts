export const PRIMARY_ADMIN_EMAIL = 'matvey.bibin@mai.ru'

export function isPrimaryAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.toLowerCase() === PRIMARY_ADMIN_EMAIL)
}

export function hasAdminAccess(user: { email?: string | null; isAdmin?: boolean | null }): boolean {
  return Boolean(user.isAdmin) || isPrimaryAdminEmail(user.email)
}
