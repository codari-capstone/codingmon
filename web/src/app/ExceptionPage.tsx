interface ExceptionPageProps {
  /** 장면 그림 주소. 장식이라 alt를 비운다 */
  scene: string
  sceneWidth: number
  sceneHeight: number
  code: string
  title: string
  description: string
  /** 첫 버튼이 주 동작(primary)이다 */
  actions: React.ReactNode
}

/** UX-04 404·403 화면의 같은 틀: 장면 + 상태 코드 + 제목 + 설명 + 버튼. */
export function ExceptionPage({
  scene,
  sceneWidth,
  sceneHeight,
  code,
  title,
  description,
  actions,
}: ExceptionPageProps) {
  return (
    <section className="flex flex-col items-center gap-4 px-6 py-20 text-center">
      <img
        src={scene}
        alt=""
        width={sceneWidth}
        height={sceneHeight}
        className="block h-auto max-w-full"
      />
      <p className="text-primary-text mt-2 font-mono text-[15px] font-medium tracking-[0.04em]">
        {code}
      </p>
      {/* 디자인은 32px이지만 화면 h1은 모두 page-title로 맞춘다 (index.css) */}
      <h1 className="page-title">{title}</h1>
      <p className="text-muted-foreground max-w-[440px] text-[17px] break-keep leading-[1.65]">
        {description}
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2.5">{actions}</div>
    </section>
  )
}
