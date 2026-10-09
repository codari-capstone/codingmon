import { createBrowserRouter, redirect } from 'react-router'

import { RootLayout } from './RootLayout'
import { RouteErrorBoundary } from './RouteErrorBoundary'

// 스택 문서 §4의 주소 설계. 각 화면은 담당 이슈에서 features/ 아래 컴포넌트로 채운다.
export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    // 모든 화면이 lazy 청크다. 배포 후 옛 청크가 404가 되는 경우를 여기서 받는다.
    ErrorBoundary: RouteErrorBoundary,
    children: [
      { index: true, loader: () => redirect('/problems') },
      { path: 'problems', lazy: () => import('@/features/problems/ProblemListPage') },
      { path: 'problems/:id', lazy: () => import('@/features/solve/SolvePage') },
      { path: 'submissions', lazy: () => import('@/features/history/SubmissionHistoryPage') },
      { path: 'submissions/:id', lazy: () => import('@/features/result/SubmissionResultPage') },
      { path: 'me/report', lazy: () => import('@/features/report/ReportPage') },
      // 헤더의 로그인 버튼이 가는 곳. 인증 방식(#18)이 정해지면 내용을 채운다.
      { path: 'login', lazy: () => import('@/app/LoginPage') },
      { path: 'forbidden', lazy: () => import('@/app/ForbiddenPage') },
      { path: 'admin/*', lazy: () => import('@/features/admin/AdminPage') },
      { path: '*', lazy: () => import('@/app/NotFoundPage') },
    ],
  },
])
