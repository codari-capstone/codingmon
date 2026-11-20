import { createBrowserRouter } from 'react-router'

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
          // 히어로 남색 무대가 좌우 끝까지 간다 (#244)
          // 제목이 없으면 사이트 기본 제목이다(PageHead)
          {
            index: true,
            lazy: () => import('@/features/landing/LandingPage'),
            handle: { bleed: true } satisfies PageHandle,
          },
          // 필터는 화면 안에 둔다. 제목·검색칸이 필터와 표 위 전체 폭에 걸친다 (#235)
          {
            path: 'problems',
            lazy: () => import('@/features/problems/ProblemListPage'),
            handle: {
              title: '문제 목록',
              description:
                'Python·C++로 풀 수 있는 코딩 문제 목록이에요. 난이도와 개념으로 골라 풀고, 틀리면 AI가 이유를 짚어 줘요.',
            } satisfies PageHandle,
          },
          // 요금제 (PRICE-01~03, #331). 로그인 없이 본다. 구역마다 폭과 여백을 직접 잡아 랜딩처럼 bleed다
          {
            path: 'pricing',
            lazy: () => import('@/features/pricing/PricingPage'),
            handle: {
              bleed: true,
              title: '요금제',
              description:
                '코딩몬의 무료·프로 요금제예요. 문제 풀이와 채점은 언제나 무료이고, 프로는 AI 오답 분석과 힌트를 더 많이 쓸 수 있어요.',
            } satisfies PageHandle,
          },
          // 이용약관·개인정보 처리방침·환불 정책 (LEGAL-01~03, #335). 로그인 없이 본다.
          // 문서가 760px 폭과 위아래 여백을 직접 잡아 bleed다(페이지 여백이 겹치지 않게)
          {
            path: 'terms',
            lazy: () => import('@/features/legal/TermsPage'),
            handle: {
              bleed: true,
              title: '이용약관',
              description:
                '코딩몬 서비스의 이용 조건과 유료 서비스(프로 플랜)의 결제·해지 조건이에요.',
            } satisfies PageHandle,
          },
          {
            path: 'privacy',
            lazy: () => import('@/features/legal/PrivacyPage'),
            handle: {
              bleed: true,
              title: '개인정보 처리방침',
              description:
                '코딩몬이 처리하는 개인정보의 항목, 보유 기간, 위탁과 국외 이전을 알려 드려요.',
            } satisfies PageHandle,
          },
          {
            path: 'refund',
            lazy: () => import('@/features/legal/RefundPage'),
            handle: {
              bleed: true,
              title: '환불 정책',
              description: '코딩몬 프로 플랜의 청약철회, 해지, 환불 기준이에요.',
            } satisfies PageHandle,
          },
          // 왼쪽 남색 패널이 좌우 끝까지 간다 (#241)
          {
            path: 'login',
            lazy: () => import('@/features/auth/LoginPage'),
            // 남색 패널이 화면 높이를 채운다. 바닥글을 두면 화면이 한 번 더 내려간다
            handle: { bleed: true, title: '로그인', noFooter: true } satisfies PageHandle,
          },
          // GitHub 로그인이 돌아오는 자리 (COM-02). 주소는 계약이 정했다.
          {
            path: 'login/github',
            lazy: () => import('@/features/auth/GitHubCallbackPage'),
            handle: { title: 'GitHub 로그인', noindex: true } satisfies PageHandle,
          },
          {
            path: 'signup',
            lazy: () => import('@/features/auth/SignupPage'),
            handle: { pageTone: 'subtle', title: '회원가입' } satisfies PageHandle,
          },
          {
            path: 'password-reset',
            lazy: () => import('@/features/auth/PasswordResetPage'),
            handle: { pageTone: 'subtle', title: '비밀번호 찾기' } satisfies PageHandle,
          },
          {
            path: 'forbidden',
            lazy: () => import('@/app/ForbiddenPage'),
            handle: { title: '권한이 없어요', noindex: true } satisfies PageHandle,
          },
          {
            // 로그인이 필요한 화면들 (COM-05). 가드는 막거나 통과시킬 뿐 AppShell을 만들지 않으므로,
            // RootLayout 밖의 형제로 두면 헤더가 없어진다. 그래서 RootLayout의 자식으로 둔다.
            // 검색에는 내보내지 않는다. 아래 화면이 모두 받는다(#309)
            Component: RequireAuth,
            handle: { noindex: true } satisfies PageHandle,
            children: [
              {
                path: 'problems/:id',
                lazy: () => import('@/features/solve/SolvePage'),
                // 코드를 넓게 쓰도록 본문 폭을 넓힌다(#327). 에디터가 화면에 붙어 따라오는 작업 화면이라 바닥글은 두지 않는다
                handle: { wide: true, title: '문제 풀이', noFooter: true } satisfies PageHandle,
              },
              {
                // 처음 안내 (WELCOME-01). 카드가 옅은 바탕 위에 놓인다(디자인 Onboarding의 `cmx-subtle`)
                path: 'welcome',
                lazy: () => import('@/features/welcome/WelcomePage'),
                handle: { pageTone: 'subtle', title: '처음 안내' } satisfies PageHandle,
              },
              {
                path: 'submissions',
                lazy: () => import('@/features/history/SubmissionHistoryPage'),
                handle: { title: '제출 기록' } satisfies PageHandle,
              },
              {
                // 'submissions/:id'와 겹치지 않는다 — 구간 수가 다르다.
                path: 'submissions/problems/:problemId',
                lazy: () => import('@/features/history/ProblemSubmissionsPage'),
                handle: { title: '문제별 제출 기록' } satisfies PageHandle,
              },
              {
                path: 'submissions/:id',
                lazy: () => import('@/features/result/SubmissionResultPage'),
                // 시안 ResultWrong·ResultAccepted도 옅은 바탕 위의 카드다(#275)
                handle: { pageTone: 'subtle', wide: true, title: '채점 결과' } satisfies PageHandle,
              },
              {
                path: 'me',
                lazy: () => import('@/features/mypage/MyPage'),
                // 카드가 옅은 바탕 위에 놓인다(디자인 MyPage의 `cmx-subtle`). AppShell이 읽는다
                handle: { pageTone: 'subtle', title: '마이페이지' } satisfies PageHandle,
              },
              // 마이페이지 메뉴의 나머지 화면들(MyNav). 같은 옅은 바탕이다
              {
                path: 'me/account',
                lazy: () => import('@/features/mypage/MyAccountPage'),
                handle: { pageTone: 'subtle', title: '계정 설정' } satisfies PageHandle,
              },
              {
                path: 'me/display',
                lazy: () => import('@/features/mypage/MyDisplayPage'),
                handle: { pageTone: 'subtle', title: '화면 설정' } satisfies PageHandle,
              },
              {
                path: 'me/withdraw',
                lazy: () => import('@/features/mypage/MyWithdrawPage'),
                handle: { pageTone: 'subtle', title: '회원 탈퇴' } satisfies PageHandle,
              },
              {
                path: 'me/report',
                lazy: () => import('@/features/report/ReportPage'),
                handle: { title: '학습 리포트' } satisfies PageHandle,
              },
              // 리포트와 내 학습 탭(LearnNav)을 같이 쓰는 화면이라 바탕도 같게 둔다
              {
                path: 'me/badges',
                lazy: () => import('@/features/badges/MyBadgesPage'),
                handle: { title: '배지' } satisfies PageHandle,
              },
              {
                // RequireAdmin은 역할만 본다. 비로그인이 403을 보지 않도록 RequireAuth 안에 둔다.
                Component: RequireAdmin,
                children: [
                  {
                    // 문제 관리를 /admin 자체에 둔다. 관리자 첫 화면이라 리다이렉트를
                    // 둘 이유가 없고, AppHeader의 /admin 링크도 그대로 쓴다.
                    path: 'admin',
                    children: [
                      {
                        index: true,
                        lazy: () => import('@/features/admin/AdminProblemListPage'),
                        handle: { title: '문제 관리' } satisfies PageHandle,
                      },
                      // 대시보드·회원 목록 (ADM-12·14, #228). 대시보드를 index로 올리지 않는다 —
                      // /admin 링크·e2e가 문제 목록을 가리킨다
                      {
                        path: 'dashboard',
                        lazy: () => import('@/features/admin/AdminDashboardPage'),
                        handle: { title: '대시보드' } satisfies PageHandle,
                      },
                      {
                        path: 'members',
                        lazy: () => import('@/features/admin/AdminMembersPage'),
                        handle: { title: '회원' } satisfies PageHandle,
                      },
                      // 회원 상세·정지·강제 탈퇴 (ADM-15·16)
                      {
                        path: 'members/:id',
                        lazy: () => import('@/features/admin/AdminMemberDetailPage'),
                        handle: { pageTone: 'subtle', title: '회원 상세' } satisfies PageHandle,
                      },
                      // 개념 태그 목록·등록 (ADM-11, #221)
                      {
                        path: 'tags',
                        lazy: () => import('@/features/admin/AdminTagsPage'),
                        handle: { title: '개념 태그' } satisfies PageHandle,
                      },
                      // 신고 목록·상세 (ADM-13, #226)
                      {
                        path: 'reports',
                        lazy: () => import('@/features/admin/AdminReportsPage'),
                        handle: { title: '신고' } satisfies PageHandle,
                      },
                      {
                        path: 'reports/:id',
                        lazy: () => import('@/features/admin/AdminReportDetailPage'),
                        handle: { pageTone: 'subtle', title: '신고 상세' } satisfies PageHandle,
                      },
                      // 등록·수정·버전 보기가 한 컴포넌트다. 폼이 같고 어디서 값을 읽는지만
                      // 다르다 (AdminProblemFormPage 주석).
                      {
                        path: 'problems/new',
                        lazy: () => import('@/features/admin/AdminProblemFormPage'),
                        handle: { pageTone: 'subtle', title: '문제 등록' } satisfies PageHandle,
                      },
                      {
                        path: 'problems/:id',
                        lazy: () => import('@/features/admin/AdminProblemFormPage'),
                        handle: { pageTone: 'subtle', title: '문제 수정' } satisfies PageHandle,
                      },
                      {
                        path: 'problems/:id/versions/:versionNo',
                        lazy: () => import('@/features/admin/AdminProblemFormPage'),
                        handle: { pageTone: 'subtle', title: '문제 버전' } satisfies PageHandle,
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            path: '*',
            lazy: () => import('@/app/NotFoundPage'),
            handle: { title: '페이지를 찾을 수 없어요', noindex: true } satisfies PageHandle,
          },
        ],
      },
    ],
  },
])
