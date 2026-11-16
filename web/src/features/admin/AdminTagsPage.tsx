import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { ConceptTag, ConceptTagInput } from '@/api/types'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, type TableColumn } from '@/components/ui/data-table'
import { Field, Input } from '@/components/ui/input'
import { problemCode, problemMessage } from '@/features/auth/problemCode'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { conceptTagsQuery } from '@/features/problems/problemsQuery'
import { TAG_NAME_MAX, TAG_SLUG_MAX, TAG_SLUG_PATTERN } from './tagRules'

/** 서버와 같은 규칙(계약 `ConceptTagInput`). 화면에서 먼저 막아 `code` 없는 400을 보지 않게 한다. */
const tagSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '이름을 입력해 주세요')
    .max(TAG_NAME_MAX, `이름은 ${TAG_NAME_MAX}자까지예요`),
  slug: z
    .string()
    .min(1, '영문 이름을 입력해 주세요')
    .max(TAG_SLUG_MAX, `영문 이름은 ${TAG_SLUG_MAX}자까지예요`)
    .regex(TAG_SLUG_PATTERN, '영문 소문자·숫자를 - 로 이어 주세요 (예: binary-search)'),
})

type TagForm = z.infer<typeof tagSchema>

async function createTag(input: ConceptTagInput): Promise<ConceptTag> {
  const result = await api.POST('/api/admin/concept-tags', { body: input })
  if (result.data === undefined) fail(result)
  return result.data
}

/** 관리자 태그 관리 (ADM-11). 목록과 등록만 있다 — 수정·삭제는 없다(#34). */
export function Component() {
  const queryClient = useQueryClient()
  const tags = useQuery(conceptTagsQuery())
  // 방금 등록한 태그. 표에서 표시한다(디자인 '방금 등록')
  const [justAdded, setJustAdded] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TagForm>({ resolver: zodResolver(tagSchema) })

  const create = useMutation({
    mutationFn: createTag,
    onSuccess: async (tag) => {
      // 문제 작성 화면의 태그 선택·문제 목록 필터가 같은 캐시를 읽는다. 길게 캐시하므로 바로 넣고(ADM-11),
      // 서버 목록으로 다시 맞춘다
      await queryClient.cancelQueries({ queryKey: conceptTagsQuery().queryKey })
      queryClient.setQueryData(conceptTagsQuery().queryKey, (old) => [...(old ?? []), tag])
      void queryClient.invalidateQueries({ queryKey: conceptTagsQuery().queryKey })
      setJustAdded(tag.slug)
      reset()
    },
    onError: (error) => forgetSessionIfUnauthorized(queryClient, error),
  })
  // 값을 고치면 지난 서버 오류(중복)는 더 맞지 않는다. 다시 보내기 전까지 남겨 두면 새 값도 중복처럼 보인다
  const clearServerError = () => {
    if (create.isError) create.reset()
  }

  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, tags.error)
  }, [queryClient, tags.error])

  const columns: TableColumn<ConceptTag & { id: string }>[] = [
    {
      key: 'name',
      header: '이름',
      render: (tag) => (
        <span className="text-foreground inline-flex items-center gap-2 font-semibold">
          {tag.name}
          {tag.slug === justAdded ? <Badge tone="brand">방금 등록</Badge> : null}
        </span>
      ),
    },
    {
      key: 'slug',
      header: '영문 이름 (slug)',
      render: (tag) => <span className="text-muted-foreground font-mono text-sm">{tag.slug}</span>,
    },
  ]

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-eyebrow text-primary-text">관리자</p>
        <h1 className="page-title">태그</h1>
        <p className="text-muted-foreground text-[15px]">
          문제에 붙이는 개념 태그예요. 등록한 태그는 문제 작성 화면의 태그 목록에 바로 나와요.
          수정·삭제는 할 수 없어요.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-label="태그 목록" className="bg-card min-w-0 rounded-lg border px-3 py-2">
          {tags.error ? (
            <ErrorState problem={tags.error} onRetry={() => void tags.refetch()} />
          ) : tags.isPending ? (
            <ListSkeleton rows={4} />
          ) : tags.data.length === 0 ? (
            <EmptyState
              title="아직 태그가 없어요"
              description="오른쪽에서 첫 태그를 등록해 주세요."
            />
          ) : (
            <Table
              columns={columns}
              rows={tags.data.map((tag) => ({ ...tag, id: tag.slug }))}
              caption="개념 태그"
            />
          )}
        </section>

        {/* 이름 붙은 랜드마크는 폼 하나다. 상자에도 같은 이름을 주면 '새 태그 등록'이 두 번 읽힌다 */}
        <div className="bg-muted flex flex-col gap-[18px] rounded-lg p-7">
          <h2 id="tag-new" className="text-foreground text-lg font-bold">
            새 태그 등록
          </h2>
          <form
            aria-labelledby="tag-new"
            noValidate
            className="flex flex-col gap-[18px]"
            onSubmit={handleSubmit((values) => create.mutate(values))}
          >
            <Field
              label="이름"
              htmlFor="tag-name"
              hint={`${TAG_NAME_MAX}자까지`}
              error={errors.name?.message}
            >
              <Input
                id="tag-name"
                placeholder="예: 이분 탐색"
                {...register('name', { onChange: clearServerError })}
              />
            </Field>
            <Field
              label="영문 이름 (slug)"
              htmlFor="tag-slug"
              hint={`영문 소문자·숫자를 - 로 이어요 · ${TAG_SLUG_MAX}자까지`}
              error={errors.slug?.message}
            >
              <Input
                id="tag-slug"
                placeholder="예: binary-search"
                autoCapitalize="none"
                spellCheck={false}
                className="font-mono"
                {...register('slug', { onChange: clearServerError })}
              />
            </Field>
            {create.isError ? (
              // 중복(409 CONCEPT_TAG_EXISTS)은 서버 문구를 그대로 보인다(ADM-11)
              <Alert tone="danger">
                {problemMessage(create.error)}
                {problemCode(create.error) === 'CONCEPT_TAG_EXISTS'
                  ? ' (CONCEPT_TAG_EXISTS)'
                  : null}
              </Alert>
            ) : null}
            <Button type="submit" fullWidth loading={create.isPending}>
              등록
            </Button>
          </form>
        </div>
      </div>
    </section>
  )
}
