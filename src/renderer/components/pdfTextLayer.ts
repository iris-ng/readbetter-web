export interface RunBox {
  left: number
  top: number
  width: number
  height: number
  fontSize: number
}

/** LiteParse coords are top-left, page-unit; one scale maps them to displayed CSS px. */
export function mapRun(run: { x: number; y: number; w: number; h: number }, scale: number): RunBox {
  return {
    left: run.x * scale,
    top: run.y * scale,
    width: run.w * scale,
    height: run.h * scale,
    fontSize: run.h * scale
  }
}
