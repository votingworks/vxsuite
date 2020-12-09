import { Rect } from '../types'
// import makeDebug, { Debugger } from 'debug'
import { toPNG } from './images'
import { v4 as uuid } from 'uuid'

export interface InspectImageLogger<Types extends string> {
  search(type: Types): SearchImageLogger
  landmark(type: Types, shape: Rect, comment?: string): this
  group(name: string, comment?: string): GroupedInspectImageLogger<Types>
}

export interface SearchImageLogger {
  begin(bounds: Rect, comment?: string): this
  test(shape: Rect, comment?: string): this
  add(shape: Rect, comment?: string): this
  update(shape: Rect, comment?: string): this
  reset(comment?: string): this
  cancel(comment?: string): void
  commit(comment?: string): void
}

export interface GroupedInspectImageLogger<Types extends string>
  extends InspectImageLogger<Types> {
  end(): void
}

// class DebugImageLogger implements InspectImageLogger {
//   public constructor(
//     private readonly namespace = 'hmpb-interpreter:image-log'
//   ) {}

//   public feature(shape: Rect, message = 'feature'): InspectImageFeatureLogger {
//     return new DebugFeatureImageLogger(shape, `${this.namespace}:${message}`)
//   }

//   public temp(shape: Rect, message = 'temp'): this {
//     makeDebug(`${this.namespace}:${message}`)('%s %o', message, shape)
//     return this
//   }

//   public group(name: string): GroupedInspectImageLogger {
//     return new DebugGroupedImageLogger(`${this.namespace}:${name}`)
//   }
// }

// class DebugGroupedImageLogger
//   extends DebugImageLogger
//   implements GroupedInspectImageLogger {
//   private debug: Debugger

//   public constructor(namespace: string) {
//     super(namespace)
//     this.debug = makeDebug(namespace)
//   }

//   public end(message?: string): void {
//     if (message) {
//       this.debug('%s', message)
//     }
//   }
// }

// class DebugFeatureImageLogger
//   extends DebugImageLogger
//   implements InspectImageFeatureLogger {
//   private debug: Debugger

//   public constructor(private shape: Rect, namespace: string) {
//     super()
//     this.debug = makeDebug(namespace)
//     this.debug('BEGIN %o', shape)
//   }

//   public update(shape: Rect, message = ''): this {
//     this.shape = shape
//     this.debug('UPDATE %s %o', message, this.shape)
//     return this
//   }

//   public commit(message = ''): this {
//     this.debug('COMMIT %s %o', message, this.shape)
//     return this
//   }

//   public cancel(message = ''): this {
//     this.debug('CANCEL', message, this.shape)
//     return this
//   }
// }

// export function makeDebugImageLogger(): InspectImageLogger {
//   return new DebugImageLogger()
// }

type GraphicalInspectImageLoggerAction<SearchType> =
  | {
      type: 'search.begin'
      data: {
        type: SearchType
        searchId: string
        bounds: Rect
        comment?: string
      }
    }
  | {
      type: 'search.test'
      data: { searchId: string; shape: Rect; comment?: string }
    }
  | {
      type: 'search.add'
      data: { searchId: string; shape: Rect; comment?: string }
    }
  | {
      type: 'search.update'
      data: { searchId: string; shape: Rect; comment?: string }
    }
  | {
      type: 'search.reset'
      data: { searchId: string; comment?: string }
    }
  | {
      type: 'search.cancel'
      data: { searchId: string; comment?: string }
    }
  | {
      type: 'search.commit'
      data: { searchId: string; comment?: string }
    }
declare const actions: GraphicalInspectImageLoggerAction<string>[]

function runGraphicalInspectVisualizer(): void {
  let currentActionIndex = -1

  document.body.addEventListener('keyup', (event) => {
    switch (event.key) {
      case 'j': {
        next()
        break
      }

      case 'k': {
        prev()
        break
      }
    }
  })

  document.addEventListener('DOMContentLoaded', async () => {
    for (const _ of play()) {
      await sleep(10)
    }
  })

  function position(element: HTMLElement, shape: Rect): HTMLElement {
    element.style.left = `${shape.x}px`
    element.style.top = `${shape.y}px`
    element.style.width = `${shape.width}px`
    element.style.height = `${shape.height}px`
    return element
  }

  function shape(
    shape: Rect,
    { classes = [] }: { classes?: string[] } = {}
  ): HTMLElement {
    const element = document.createElement('div')
    element.classList.add('shape', ...classes)
    position(element, shape)
    return element
  }

  function group({ classes = [] }: { classes?: string[] } = {}): HTMLElement {
    const element = document.createElement('div')
    element.classList.add('group', ...classes)
    return element
  }

  interface Search {
    container: HTMLElement
    cutout: HTMLElement
    lastTest?: HTMLElement
    added?: readonly HTMLElement[]
  }

  function* play(): Generator<void> {
    console.log(actions)
    const page = document.querySelector('.page')!
    const log = document.querySelector('.log')!
    let currentSearch: Search | undefined

    for (const action of actions) {
      if (currentSearch?.lastTest) {
        // currentSearch.lastTest.parentElement?.removeChild(
        //   currentSearch.lastTest
        // )
        currentSearch.lastTest = undefined
      }

      if (action.data.comment) {
        log.appendChild(document.createTextNode(action.data.comment))
        log.appendChild(document.createElement('br'))
      }

      switch (action.type) {
        case 'search.begin': {
          currentSearch = {
            container: group({
              classes: ['search', 'current', action.data.type],
            }),
            cutout: shape(action.data.bounds, { classes: ['search--cutout'] }),
          }
          currentSearch.container.appendChild(currentSearch.cutout)
          page.appendChild(currentSearch.container)
          break
        }

        case 'search.test': {
          if (!currentSearch) {
            throw new Error('no current search')
          }
          currentSearch.lastTest = shape(action.data.shape, {
            classes: ['search--test'],
          })
          currentSearch.container.appendChild(currentSearch.lastTest)
          break
        }

        case 'search.add': {
          if (!currentSearch) {
            throw new Error('no current search')
          }
          const added = shape(action.data.shape, {
            classes: ['search--added'],
          })
          currentSearch.added = [...(currentSearch.added ?? []), added]
          currentSearch.container.appendChild(added)
          break
        }

        case 'search.reset': {
          if (!currentSearch) {
            throw new Error('no current search')
          }
          if (currentSearch.added) {
            for (const element of currentSearch.added) {
              element.classList.add('reset')
            }
            delete currentSearch.added
          }
          break
        }

        case 'search.cancel':
        case 'search.commit': {
          if (!currentSearch) {
            throw new Error('no current search')
          }
          if (action.type === 'search.commit') {
            currentSearch.container.classList.add('commit')
          } else {
            currentSearch.container.classList.add('cancel')
          }
          currentSearch.container.classList.remove('current')
          currentSearch = undefined
        }
      }

      yield
    }
  }

  async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }

  function next(): void {
    if (currentActionIndex === actions.length) {
      return
    }

    currentActionIndex++
    console.log({ currentActionIndex })
  }

  function prev(): void {
    if (currentActionIndex === -1) {
      return
    }

    currentActionIndex--
    console.log({ currentActionIndex })
  }
}

class GraphicalSearchImageLogger<Types extends string>
  implements SearchImageLogger {
  public constructor(
    private readonly type: Types,
    private readonly searchId: string,
    private readonly out: NodeJS.WritableStream
  ) {}

  public begin(bounds: Rect, comment?: string): this {
    return this.writeAction({
      type: 'search.begin',
      data: {
        type: this.type,
        searchId: this.searchId,
        bounds,
        comment,
      },
    })
  }

  public test(shape: Rect, comment?: string): this {
    return this.writeAction({
      type: 'search.test',
      data: {
        searchId: this.searchId,
        shape,
        comment,
      },
    })
  }

  public add(shape: Rect, comment?: string): this {
    return this.writeAction({
      type: 'search.add',
      data: {
        searchId: this.searchId,
        shape,
        comment,
      },
    })
  }

  public update(shape: Rect, comment?: string): this {
    return this.writeAction({
      type: 'search.update',
      data: {
        searchId: this.searchId,
        shape,
        comment,
      },
    })
  }

  public reset(comment?: string): this {
    return this.writeAction({
      type: 'search.reset',
      data: {
        searchId: this.searchId,
        comment,
      },
    })
  }

  public cancel(comment?: string): void {
    this.writeAction({
      type: 'search.cancel',
      data: {
        searchId: this.searchId,
        comment,
      },
    })
  }

  public commit(comment?: string): void {
    this.writeAction({
      type: 'search.commit',
      data: {
        searchId: this.searchId,
        comment,
      },
    })
  }

  private writeAction(action: GraphicalInspectImageLoggerAction<Types>): this {
    return this.writeScript(`actions.push(${JSON.stringify(action)})`)
  }

  private writeScript(script: string): this {
    this.out.write(`<script>${script}</script>`)
    return this
  }
}

class GraphicalInspectImageLogger<Types extends string>
  implements InspectImageLogger<Types> {
  public constructor(
    private readonly imageData: ImageData,
    protected readonly out: NodeJS.WritableStream
  ) {}

  public search(type: Types): SearchImageLogger {
    return new GraphicalSearchImageLogger<Types>(type, uuid(), this.out)
  }

  public landmark(type: Types, shape: Rect): this {
    return this.writeAction({
      type: 'landmark',
      data: { type, shape },
    })
  }

  public group(name: string): GroupedGraphicalInspectImageLogger<Types> {
    return new GroupedGraphicalInspectImageLogger<Types>(
      this.imageData,
      this.out,
      name
    ).begin()
  }

  public async init(): Promise<this> {
    this.out.write(`
      <head>
        <style>
          body {
            font-family: -apple-system,BlinkMacSystemFont,"Segoe UI","Roboto","Oxygen","Ubuntu","Cantarell","Fira Sans","Droid Sans","Helvetica Neue",sans-serif;
          }

          .page {
            position: relative;
          }

          .page-image {
            image-rendering: pixelated;
          }

          .log {
            z-index: 999;
            position: fixed;
            display: flex;
            flex-direction: column-reverse;
            overflow: auto;
            height: 150px;
            bottom: 0;
            right: 0;
            background-color: #ffffffcc;
            font-size: 1.2em;
            box-shadow: 0 0 5px #00000099;
          }

          .shape {
            position: absolute;
            min-height: 1px;
            min-width: 1px;
            opacity: 0.8;
          }

          .group {}

          .search--cutout {
            display: none;
          }
          .search.current .search--cutout {
            display: block;
          }
          .search--cutout:after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height:100%;
            box-shadow: 0px 0px 0px 99999px rgba(0,0,0,.8);
          }

          .search--test {
            display: none;
            background-color: #f542e3;
          }

          .search--added {
            display: none;
            background-color: #00ff00;
          }

          .contest-left-line .search--added {
            background-color: cyan;
          }
          .contest-right-line .search--added {
            background-color: magenta;
          }
          .contest-top-line .search--added {
            background-color: yellow;
          }
          .contest-bottom-line .search--added {
            background-color: salmon;
          }

          .search--added.reset {
            background-color: #666666;
          }

          .search.current .search--test,
          .search.current .search--added,
          .search.commit .search--added {
            display: block;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="page">
            <img class="page-image" src="data:image/png;base64,${(
              await toPNG(this.imageData)
            ).toString('base64')}">
            <div class="log"></div>
          </div>
        </div>
        <script>
        var actions = []
        ;(${runGraphicalInspectVisualizer.toString()})()
        </script>
      </body>
    `)
    return this
  }

  protected writeAction(action: Record<string, unknown>): this {
    return this.writeScript(`actions.push(${JSON.stringify(action)})`)
  }

  protected writeScript(script: string): this {
    this.out.write(`<script>${script}</script>`)
    return this
  }
}

class GroupedGraphicalInspectImageLogger<Types extends string>
  extends GraphicalInspectImageLogger<Types>
  implements GroupedInspectImageLogger<Types> {
  public constructor(
    imageData: ImageData,
    out: NodeJS.WritableStream,
    private readonly name: string
  ) {
    super(imageData, out)
  }

  public begin(): this {
    return this.writeAction({
      type: 'group.begin',
      data: { name: this.name },
    })
  }

  public end(): void {
    this.writeAction({
      type: 'group.end',
      data: { name: this.name },
    })
  }
}

export async function makeGraphicalLogger<Types extends string>(
  imageData: ImageData,
  out: NodeJS.WritableStream
): Promise<InspectImageLogger<Types>> {
  return await new GraphicalInspectImageLogger<Types>(imageData, out).init()
}
