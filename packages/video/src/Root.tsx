import { Composition } from 'remotion'
import { RENDER_FORMATS, RENDER_TARGETS } from '@reelforge/shared'
import { Film } from './Film.js'
import { compositionId, DEFAULT_BRAND, renderPropsSchema, type RenderProps } from './props.js'
import { samplePropsFor } from './sample.js'

/**
 * One composition per output format. Duration comes from the EDL: the last
 * segment's end time is the film's length, which is what keeps a 30-second cut
 * exactly 30 seconds.
 */
export function RemotionRoot() {
  return (
    <>
      {RENDER_TARGETS.map((target) => {
        const format = RENDER_FORMATS[target]
        return (
          <Composition
            key={target}
            id={compositionId(target)}
            component={Film}
            schema={renderPropsSchema}
            width={format.width}
            height={format.height}
            fps={format.fps}
            durationInFrames={Math.max(1, Math.round((format.targetSeconds ?? 20) * format.fps))}
            defaultProps={samplePropsFor(target) as RenderProps}
            calculateMetadata={({ props }) => {
              const end = props.segments.at(-1)?.endSec ?? 0
              return {
                durationInFrames: Math.max(1, Math.round(end * format.fps)),
                props: { ...props, brand: { ...DEFAULT_BRAND, ...props.brand } },
              }
            }}
          />
        )
      })}
    </>
  )
}
