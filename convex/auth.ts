import Google from '@auth/core/providers/google'
import { convexAuth } from '@convex-dev/auth/server'

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
  callbacks: {
    createOrUpdateUser: async (context, args) => {
      const name = typeof args.profile.name === 'string' ? args.profile.name : undefined
      const email = typeof args.profile.email === 'string' ? args.profile.email : undefined
      const image = typeof args.profile.image === 'string' ? args.profile.image : undefined
      const emailVerified = args.profile.emailVerified === true ? Date.now() : undefined

      const userData = {
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(image ? { image } : {}),
        ...(emailVerified ? { emailVerificationTime: emailVerified } : {}),
      }

      if (args.existingUserId) {
        await context.db.patch(args.existingUserId, userData)
        return args.existingUserId
      }

      if (email && args.profile.emailVerified === true) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingUsers = await (context.db.query('users') as any)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((q: any) => q.eq(q.field('email'), email))
          .take(2)

        if (existingUsers.length === 1) {
          await context.db.patch(existingUsers[0]._id, userData)
          return existingUsers[0]._id
        }
      }

      return await context.db.insert('users', userData)
    },
  },
})
