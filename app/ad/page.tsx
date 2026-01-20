import type { Metadata } from 'next'
import Client from './Client'

export const metadata: Metadata = {
  title: 'Admin',
  description: 'Admin dashboard for Dreambooks',
}

export default function AdminPage() {
  return <Client />
}
