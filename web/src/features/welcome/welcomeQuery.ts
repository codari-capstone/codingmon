import { api } from '@/api/client'
import { fail } from '@/api/fail'

/** 처음 안내를 봤음 (WELCOME-01). 화면이 열리면 부른다. 이미 봤어도 204다(계약). */
export async function markWelcomeSeen(): Promise<void> {
  const result = await api.POST('/api/users/me/welcome-seen')
  if (!result.response.ok) fail(result)
}
