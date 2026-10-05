import { createBrowserRouter, redirect } from 'react-router'

import { RootLayout } from './RootLayout'

// 스택 문서 §4의 주소 설계. 각 화면은 담당 이슈에서 features/ 아래 컴포넌트로 채운다.
export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    children: [
      { index: true, loader: () => redirect('/problems') },
      { path: 'problems', lazy: () => import('@/features/problems/ProblemListPage') },
      { path: 'problems/:id', lazy: () => import('@/features/solve/SolvePage') },
      { path: 'submissions', lazy: () => import('@/features/history/SubmissionHistoryPage') },
      { path: 'submissions/:id', lazy: () => import('@/features/result/SubmissionResultPage') },
      { path: 'me/report', lazy: () => import('@/features/report/ReportPage') },
      { path: 'admin/*', lazy: () => import('@/features/admin/AdminPage') },
      { path: '*', lazy: () => import('@/app/NotFoundPage') },
    ],
  },
])
