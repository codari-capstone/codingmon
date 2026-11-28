import { createCn } from 'cn/config'

// 기본 cn은 index.css @theme에 더한 글자 크기를 모르고 글자색으로 보아, 같은 호출의 글자색을 지운다 (#262).
// @theme의 --text-* 이름을 바꾸거나 더하면 여기도 고친다.
export const cn = createCn({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display',
            'title-1',
            'title-2',
            'title-3',
            'eyebrow',
            'body-lg',
            'body',
            'body-sm',
            'label',
            'caption',
            'code',
          ],
        },
      ],
    },
  },
})

/** 투명한 1×1 GIF. <picture>에서 좁은 화면이 고르는 빈 그림이라 요청을 만들지 않는다 */
export const BLANK_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
