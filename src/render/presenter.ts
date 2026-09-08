/**
 * Puts an RGBA frame onto a <canvas>.
 *
 * The frame always lives in an `ImageData` whose `.data` is the buffer the
 * pixel writer fills. Presenting it takes one of two paths:
 *
 *   webgl2  upload the bytes with texSubImage2D into a NEAREST-filtered
 *           texture and draw one full-screen triangle. This is the fast path:
 *           the browser does no format conversion and the copy is a straight
 *           memcpy into the GPU upload queue.
 *   2d      ctx.putImageData(imageData, 0, 0). Universal fallback.
 *
 * The canvas's intrinsic size is the grid size; CSS scales it up with
 * `image-rendering: pixelated` so every cell is a crisp block.
 */
export type PresentMode = 'webgl2' | '2d'

const VERT = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  // Full-screen triangle from gl_VertexID; flip Y so row 0 is the top.
  vec2 p = vec2(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0);
  v_uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 o_color;
void main() { o_color = vec4(texture(u_tex, v_uv).rgb, 1.0); }`

export class Presenter {
  readonly canvas: HTMLCanvasElement
  readonly width: number
  readonly height: number
  readonly mode: PresentMode
  readonly image: ImageData
  private gl: WebGL2RenderingContext | null = null
  private ctx2d: CanvasRenderingContext2D | null = null
  private tex: WebGLTexture | null = null
  private program: WebGLProgram | null = null
  private lost = false

  constructor(canvas: HTMLCanvasElement, width: number, height: number, preferWebGL = true) {
    this.canvas = canvas
    this.width = width
    this.height = height
    canvas.width = width
    canvas.height = height
    this.image = new ImageData(width, height)
    const gl = preferWebGL ? this.initWebGL() : null
    if (gl) {
      this.gl = gl
      this.mode = 'webgl2'
    } else {
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) throw new Error('Neither WebGL2 nor 2D canvas is available')
      ctx.imageSmoothingEnabled = false
      this.ctx2d = ctx
      this.mode = '2d'
    }
  }

  /** The RGBA buffer to write frames into (ImageData.data). */
  get pixels(): Uint8ClampedArray {
    return this.image.data
  }

  private initWebGL(): WebGL2RenderingContext | null {
    let gl: WebGL2RenderingContext | null = null
    try {
      gl = this.canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      })
    } catch {
      return null
    }
    if (!gl) return null
    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)
      if (!sh) return null
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh)
        return null
      }
      return sh
    }
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!vs || !fs || !program) return null
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
    gl.useProgram(program)
    const tex = gl.createTexture()
    if (!tex) return null
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.uniform1i(gl.getUniformLocation(program, 'u_tex'), 0)
    gl.viewport(0, 0, this.width, this.height)
    gl.disable(gl.BLEND)
    this.tex = tex
    this.program = program
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.lost = true
    })
    return gl
  }

  /** Push the current contents of `pixels` to the screen. */
  present(): void {
    const gl = this.gl
    if (gl && !this.lost) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, this.image.data)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      return
    }
    if (!this.ctx2d) {
      // Context was lost after construction: fall back to a fresh 2D canvas is
      // impossible on the same element, so just stop presenting.
      return
    }
    this.ctx2d.putImageData(this.image, 0, 0)
  }

  dispose(): void {
    const gl = this.gl
    if (gl) {
      if (this.tex) gl.deleteTexture(this.tex)
      if (this.program) gl.deleteProgram(this.program)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
    this.gl = null
    this.ctx2d = null
  }
}
