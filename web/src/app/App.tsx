import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { useState } from 'react'

import { createQueryClient } from './queryClient'
import { router } from './router'

export function App() {
  // QueryClient는 렌더마다 새로 만들지 않는다.
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
