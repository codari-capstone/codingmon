import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { RouterProvider } from 'react-router'

import { createQueryClient } from './queryClient'
import { router } from './router'
import { ThemeProvider } from './ThemeProvider'

export function App() {
  // QueryClient는 렌더마다 새로 만들지 않는다.
  const [queryClient] = useState(createQueryClient)

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
