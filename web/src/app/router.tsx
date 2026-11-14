import { createBrowserRouter, redirect } from 'react-router'

import type { PageHandle } from './AppShell'
import { RequireAdmin } from './RequireAdmin'
import { RequireAuth } from './RequireAuth'
import { RootLayout } from './RootLayout'
import { RouteErrorBoundary } from './RouteErrorBoundary'
import { ScrollRoot } from './ScrollRoot'

// 스택 문서 §4의 주소 설계. 각 화면은 담당 이슈에서 features/ 아래 컴포넌트로 채운다.
export const router = createBrowserRouter([
  {
    path: '/',
    // 모든 화면이 lazy 청크다. 배포 후 옛 청크가 404가 되는 경우를 여기서 받는다.
    ErrorBoundary: RouteErrorBoundary,
    // 화면을 옮기면 맨 위에서, 뒤로 가기는 떠났던 위치에서 연다 (#190)
    Component: ScrollRoot,
    children: [
      {
        Component: RootLayout,
        children: [
          { index: true, loader: () => redirect('/problems') },
          // 필터는 화면 안에 둔다. 제목·검색칸이 필터와 표 위 전체 폭에 걸친다 (#235)
          { path: 'problems', lazy: () => import('@/features/problems/ProblemListPage') },
          // 왼쪽 남색 패널이 좌우 끝까지 간다 (#241)
          {
            path: 'login',
            lazy: () => import('@/features/auth/LoginPage'),
            handle: { bleed: true } satisfies PageHandle,
          },
          // GitHub 로그인이 돌아오는 자리 (COM-02). 주소는 계약이 정했다.
          { path: 'login/github', lazy: () => import('@/features/auth/GitHubCallbackPage') },
          {
            path: 'signup',
            lazy: () => import('@/features/auth/SignupPage'),
            handle: { pageTone: 'subtle' } satisfies PageHandle,
          },
          {
            path: 'password-reset',
            lazy: () => import('@/features/auth/PasswordResetPage'),
            handle: { pageTone: 'subtle' } satisfies PageHandle,
          },
          { path: 'forbidden', lazy: () => import('@/app/ForbiddenPage') },
          {
            // 로그인이 필요한 화면들 (COM-05). 가드는 막거나 통과시킬 뿐 AppShell을 만들지 않으므로,
            // RootLayout 밖의 형제로 두면 헤더가 없어진다. 그래서 RootLayout의 자식으로 둔다.
            Component: RequireAuth,
            children: [
              { path: 'problems/:id', lazy: () => import('@/features/solve/SolvePage') },
              {
                path: 'submissions',
                lazy: () => import('@/features/history/SubmissionHistoryPage'),
              },
              {
                // 'submissions/:id'와 겹치지 않는다 — 구간 수가 다르다.
                path: 'submissions/problems/:problemId',
                lazy: () => import('@/features/history/ProblemSubmissionsPage'),
              },
              {
                path: 'submissions/:id',
                lazy: () => import('@/features/result/SubmissionResultPage'),
                // 시안 ResultWrong·ResultAccepted도 옅은 바탕 위의 카드다(#275)
                handle: { pageTone: 'subtle' } satisfies PageHandle,
              },
              {
                path: 'me',
                lazy: () => import('@/features/mypage/MyPage'),
                // 카드가 옅은 바탕 위에 놓인다(디자인 MyPage의 `cmx-subtle`). AppShell이 읽는다
                handle: { pageTone: 'subtle' } satisfies PageHandle,
              },
              // 마이페이지 메뉴의 나머지 화면들(MyNav). 같은 옅은 바탕이다
              {
                path: 'me/account',
                lazy: () => import('@/features/mypage/MyAccountPage'),
                handle: { pageTone: 'subtle' } satisfies PageHandle,
              },
              {
                path: 'me/display',
                lazy: () => import('@/features/mypage/MyDisplayPage'),
                handle: { pageTone: 'subtle' } satisfies PageHandle,
              },
              {
                path: 'me/withdraw',
                lazy: () => import('@/features/mypage/MyWithdrawPage'),
                handle: { pageTone: 'subtle' } satisfies PageHandle,
              },
              { path: 'me/report', lazy: () => import('@/features/report/ReportPage') },
              {
                // RequireAdmin은 역할만 본다. 비로그인이 403을 보지 않도록 RequireAuth 안에 둔다.
                Component: RequireAdmin,
                children: [
                  {
                    // 문제 관리를 /admin 자체에 둔다. 관리자 화면이 이것뿐이라 리다이렉트를
                    // 둘 이유가 없고, AppHeader의 /admin 링크도 그대로 쓴다. #50 관리자
                    // 대시보드가 오면 그쪽이 index가 되고 목록은 'problems'로 내려간다.
                    path: 'admin',
                    children: [
                      { index: true, lazy: () => import('@/features/admin/AdminProblemListPage') },
                      // 등록·수정·버전 보기가 한 컴포넌트다. 폼이 같고 어디서 값을 읽는지만
                      // 다르다 (AdminProblemFormPage 주석).
                      {
                        path: 'problems/new',
                        lazy: () => import('@/features/admin/AdminProblemFormPage'),
                        handle: { pageTone: 'subtle' } satisfies PageHandle,
                      },
                      {
                        path: 'problems/:id',
                        lazy: () => import('@/features/admin/AdminProblemFormPage'),
                        handle: { pageTone: 'subtle' } satisfies PageHandle,
                      },
                      {
                        path: 'problems/:id/versions/:versionNo',
                        lazy: () => import('@/features/admin/AdminProblemFormPage'),
                        handle: { pageTone: 'subtle' } satisfies PageHandle,
                      },
                    ],
                  },
                ],
              },
            ],
          },
          { path: '*', lazy: () => import('@/app/NotFoundPage') },
        ],
      },
    ],
  },
])
