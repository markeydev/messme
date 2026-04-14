import { db } from '@/lib/db'
import { hasAdminAccess } from '@/lib/admin'

export async function getAdminByPanelToken(token: string) {
  const link = await db.adminPanelLinkToken.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          isAdmin: true,
          isBlocked: true,
        },
      },
    },
  })

  if (!link) return null
  if (link.revokedAt) return null
  if (link.expiresAt < new Date()) return null
  if (link.user.isBlocked) return null
  if (!hasAdminAccess(link.user)) return null

  return {
    adminId: link.user.id,
    tokenRecordId: link.id,
  }
}
