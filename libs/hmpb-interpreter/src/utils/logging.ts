import { Rect } from '../types'
// import makeDebug, { Debugger } from 'debug'
import { toPNG } from './images'
import { v4 as uuid } from 'uuid'
import { strict as assert } from 'assert'

export interface InspectImageLogger<Types extends string> {
  search(type: Types): SearchImageLogger<Types>
  landmark(type: Types, shape: Rect, comment?: string): this
  group(name: string, comment?: string): GroupedInspectImageLogger<Types>
}

export interface SearchImageLogger<Types extends string>
  extends InspectImageLogger<Types> {
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

type GraphicalInspectImageLoggerSearchBeginAction<SearchType> = {
  type: 'search.begin'
  data: {
    type: SearchType
    searchId: string
    bounds: Rect
    comment?: string
  }
}

type GraphicalInspectImageLoggerAction<SearchType> =
  | GraphicalInspectImageLoggerSearchBeginAction<SearchType>
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
  | {
      type: 'group.begin'
      data: { groupId: string; name: string; comment?: string }
    }
  | {
      type: 'group.end'
      data: { groupId: string; name: string; comment?: string }
    }
  | {
      type: 'landmark'
      data: { type: string; shape: Rect; comment?: string }
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

  // const page = document.querySelector<HTMLImageElement>('.page')!
  // const pageImage = document.querySelector<HTMLImageElement>('.page-image')!
  // const toolbarCoordinates = document.querySelector('.toolbar--coordinates')!
  // pageImage.addEventListener('mousemove', (event) => {
  //   toolbarCoordinates.textContent = `X: ${event.offsetX}, Y: ${event.offsetY}`
  // })

  document.addEventListener('DOMContentLoaded', async () => {
    setup()
    // for (const _ of play()) {
    //   // await sleep(10)
    // }
  })

  const $page = document.querySelector<HTMLInputElement>('.page')!
  const $scale = document.querySelector<HTMLInputElement>('.scale')!
  $scale.addEventListener('input', () => {
    $page.style.transform = `scale(${$scale.valueAsNumber / 100})`
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
    searchId: string
    container: HTMLElement
    cutout: HTMLElement
    log: HTMLElement
    lastTest?: HTMLElement
    added?: readonly HTMLElement[]
  }

  interface Group {
    groupId: string
    name: string
    container: HTMLElement
    log: HTMLElement
  }

  function appendLog(container: HTMLElement, entry: HTMLElement): void {
    container.appendChild(entry)
  }

  const $overlay = document.querySelector<HTMLElement>('.overlay')!
  const $log = document.querySelector<HTMLElement>('.log')!

  function logSectionHeader(
    title: string,
    subtitle?: string,
    className?: string
  ): HTMLElement {
    const $header = document.createElement('div')
    $header.classList.add('log--section--header')
    if (className) {
      $header.classList.add(className)
    }
    const $sectionTitle = document.createElement('h2')
    $sectionTitle.textContent = title
    $header.appendChild($sectionTitle)

    if (subtitle) {
      const $sectionSubtitle = document.createElement('h3')
      $sectionSubtitle.textContent = subtitle
      $header.appendChild($sectionSubtitle)
    }

    $log.appendChild($header)
    return $header
  }

  function logSectionEntry(
    text: string,
    ...classNames: (string | null | undefined)[]
  ): HTMLElement {
    const $entry = document.createElement('div')
    $entry.classList.add('log--section--entry')
    for (const className of classNames) {
      if (className) {
        $entry.classList.add(className)
      }
    }
    const $sectionText = document.createElement('p')
    $sectionText.textContent = text
    $entry.appendChild($sectionText)

    $log.appendChild($entry)
    return $entry
  }

  function logSectionEnd(
    title: string,
    subtitle?: string,
    className?: string
  ): HTMLElement {
    const $footer = document.createElement('div')
    $footer.classList.add('log--section--footer')
    if (className) {
      $footer.classList.add(className)
    }
    const $sectionTitle = document.createElement('h2')
    $sectionTitle.textContent = title
    $footer.appendChild($sectionTitle)

    if (subtitle) {
      const $sectionSubtitle = document.createElement('h3')
      $sectionSubtitle.textContent = subtitle
      $footer.appendChild($sectionSubtitle)
    }

    $log.appendChild($footer)
    return $footer
  }

  function buildShape(shape: Rect, ...classNames: string[]): HTMLElement {
    const $shape = document.createElement('div')
    $shape.classList.add('shape')
    for (const className of classNames) {
      $shape.classList.add(className)
    }
    position($shape, shape)
    return $shape
  }

  function renderActions(
    actionsToRender: readonly GraphicalInspectImageLoggerAction<string>[]
  ): HTMLElement[] {
    const elements: HTMLElement[] = []

    for (const action of actionsToRender) {
      switch (action.type) {
        case 'group.begin': {
          const groupBeginIndex = actions.indexOf(action)
          const groupEndIndex = actions.findIndex(
            (a) =>
              a.type === 'group.end' && a.data.groupId === action.data.groupId
          )
          const groupActions = actions.slice(groupBeginIndex + 1, groupEndIndex)
          elements.push(...renderActions(groupActions))
          break
        }

        case 'group.end': {
          const groupBeginIndex = actions.findIndex(
            (a) =>
              a.type === 'group.begin' && a.data.groupId === action.data.groupId
          )
          const groupEndIndex = actions.indexOf(action)
          const groupActions = actions.slice(groupBeginIndex + 1, groupEndIndex)
          elements.push(...renderActions(groupActions))
          break
        }

        case 'search.begin': {
          const searchBeginIndex = actions.indexOf(action)
          const searchEndIndex = actions.findIndex(
            (a) =>
              (a.type === 'search.commit' || a.type === 'search.cancel') &&
              a.data.searchId === action.data.searchId
          )
          const searchActions = actions.slice(
            searchBeginIndex + 1,
            searchEndIndex
          )
          elements.push(
            ...(actionsToRender.length === 1
              ? [buildShape(action.data.bounds, 'search--cutout')]
              : []),
            ...renderActions(searchActions)
          )
          break
        }

        case 'search.test': {
          elements.push(buildShape(action.data.shape, 'search--test'))
          break
        }

        case 'search.add': {
          elements.push(buildShape(action.data.shape, 'search--added'))
          break
        }

        case 'search.update': {
          elements.push(buildShape(action.data.shape, 'search--updated'))
          break
        }

        case 'search.commit':
        case 'search.cancel': {
          elements.push(
            ...renderActions(
              actions.filter(
                (a) =>
                  (a.type === 'search.add' ||
                    a.type === 'search.update' ||
                    a.type === 'search.reset' ||
                    a.type === 'search.test') &&
                  a.data.searchId === action.data.searchId
              )
            )
          )
          break
        }

        case 'landmark': {
          elements.push(
            buildShape(action.data.shape, 'landmark', action.data.type)
          )
          break
        }
      }
    }

    return elements
  }

  function renderOnMouseOver(
    element: HTMLElement,
    actions: readonly GraphicalInspectImageLoggerAction<string>[]
  ): void {
    let $shapes: readonly HTMLElement[] | undefined
    let pinned = false

    element.addEventListener('mouseenter', () => {
      if (!pinned) {
        $shapes = renderActions(actions)
        for (const child of $shapes) {
          $overlay.appendChild(child)
        }
      }
    })
    element.addEventListener('mouseleave', () => {
      if (!pinned) {
        for (const $shape of $shapes ?? []) {
          $shape.parentElement?.removeChild($shape)
        }
      }
    })
    element.addEventListener('click', () => {
      pinned = !pinned
      element.classList.toggle('active', pinned)
    })
  }

  function setup(): void {
    for (const action of actions) {
      switch (action.type) {
        case 'group.begin':
        case 'group.end': {
          renderOnMouseOver(
            (action.type === 'group.begin' ? logSectionHeader : logSectionEnd)(
              action.data.name,
              action.data.comment,
              action.type === 'group.begin' ? 'group-begin' : 'group-end'
            ),
            [action]
          )
          break
        }

        case 'search.begin':
        case 'search.commit':
        case 'search.cancel': {
          const searchBegin = actions.find(
            (a): a is GraphicalInspectImageLoggerSearchBeginAction<string> =>
              a.type === 'search.begin' &&
              a.data.searchId === action.data.searchId
          )
          renderOnMouseOver(
            (action.type === 'search.begin' ? logSectionHeader : logSectionEnd)(
              searchBegin?.data.type ?? 'search',
              action.data.comment,
              action.type === 'search.begin'
                ? 'search-begin'
                : action.type === 'search.cancel'
                ? 'search-cancel'
                : 'search-commit'
            ),
            [action]
          )
          break
        }

        case 'search.test': {
          renderOnMouseOver(
            logSectionEntry(action.data.comment ?? 'test', 'search-test'),
            [action]
          )
          break
        }

        case 'search.add': {
          renderOnMouseOver(
            logSectionEntry(action.data.comment ?? 'add', 'search-add'),
            [action]
          )
          break
        }

        case 'search.update': {
          renderOnMouseOver(
            logSectionEntry(action.data.comment ?? 'add', 'search-add'),
            [action]
          )
          break
        }

        case 'landmark': {
          renderOnMouseOver(
            logSectionEntry(action.data.comment ?? 'landmark', 'landmark'),
            [action]
          )
          break
        }
      }
    }
  }

  function* play(): Generator<void> {
    console.log(actions)
    const $page = document.querySelector<HTMLElement>('.page')!
    const $log = document.querySelector<HTMLElement>('.log')!
    const searches = new Map<string, Search>()
    const groups: Group[] = []

    for (const action of actions) {
      // if (action.data.comment) {
      //   const comment = document.createElement('div')
      //   comment.classList.add('log--search--comment')
      //   comment.appendChild(document.createTextNode(action.data.comment))

      //   let commentContainer = log
      //   if ('searchId' in action.data) {
      //     const search = searches.get(action.data.searchId)

      //     if (search) {
      //       commentContainer = search.log
      //     }
      //   }

      //   commentContainer.appendChild(comment)
      // }

      switch (action.type) {
        case 'search.begin': {
          const search: Search = {
            searchId: action.data.searchId,
            container: group({
              classes: ['search', 'current', action.data.type],
            }),
            cutout: shape(action.data.bounds, { classes: ['search--cutout'] }),
            log: document.createElement('div'),
          }

          searches.set(action.data.searchId, search)
          search.container.appendChild(search.cutout)

          const searchLogHeader = document.createElement('h1')
          searchLogHeader.classList.add('log--search--header')
          searchLogHeader.textContent = action.data.type
          appendLog(search.log, searchLogHeader)
          appendLog($log, search.log)

          $page.appendChild(search.container)
          break
        }

        case 'search.test': {
          const search = searches.get(action.data.searchId)
          if (!search) {
            throw new Error('no current search')
          }
          search.lastTest = shape(action.data.shape, {
            classes: ['search--test'],
          })
          search.container.appendChild(search.lastTest)
          break
        }

        case 'search.add': {
          const search = searches.get(action.data.searchId)
          if (!search) {
            throw new Error('no current search')
          }
          const added = shape(action.data.shape, {
            classes: ['search--added'],
          })
          search.added = [...(search.added ?? []), added]
          search.container.appendChild(added)
          break
        }

        case 'search.reset': {
          const search = searches.get(action.data.searchId)
          if (!search) {
            throw new Error('no current search')
          }
          if (search.added) {
            for (const element of search.added) {
              element.classList.add('reset')
            }
            delete search.added
          }
          break
        }

        case 'search.cancel':
        case 'search.commit': {
          const search = searches.get(action.data.searchId)
          if (!search) {
            throw new Error('no current search')
          }
          if (action.type === 'search.commit') {
            search.container.classList.add('commit')
          } else {
            search.container.classList.add('cancel')
          }
          search.container.classList.remove('current')
          break
        }

        case 'group.begin': {
          const g: Group = {
            groupId: action.data.groupId,
            name: action.data.name,
            container: group(),
            log: document.createElement('div'),
          }

          const groupLogHeader = document.createElement('h2')
          groupLogHeader.textContent = action.data.name
          appendLog(g.log, groupLogHeader)

          if (action.data.comment) {
            const groupLogComment = document.createElement('h3')
            groupLogComment.textContent = action.data.comment
            appendLog(g.log, groupLogComment)
          }

          groups.push(g)
          appendLog($log, g.log)
          $page.appendChild(g.container)
          break
        }

        case 'group.end': {
          const group = groups.pop()

          if (!group) {
            throw new Error(
              `cannot end group when not in a group: ${action.data.groupId}`
            )
          }

          if (group.groupId !== action.data.groupId) {
            throw new Error(
              `trying to end group '${action.data.name}' (${action.data.groupId}), but the current group is ${group.groupId}`
            )
          }
          break
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

class GraphicalInspectImageLogger<Types extends string>
  implements InspectImageLogger<Types> {
  public constructor(
    private readonly imageData: ImageData,
    protected readonly out: NodeJS.WritableStream
  ) {}

  public search(type: Types): SearchImageLogger<Types> {
    return new GraphicalSearchImageLogger(
      this.imageData,
      this.out,
      type,
      uuid()
    )
  }

  public landmark(type: Types, shape: Rect, comment?: string): this {
    return this.writeAction({
      type: 'landmark',
      data: { type, shape, comment },
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
        <meta charset="UTF-8">
        <style>
          :root {
            --log-width: 400px;
            --toolbar-height: 50px;
            --vx-purple-color: 108, 60, 184;
            --ballot-width: ${this.imageData.width}px;
            --ballot-height: ${this.imageData.height}px;
          }

          * {
            margin: 0;
            padding: 0;
          }

          body {
            font-family: -apple-system,BlinkMacSystemFont,"Segoe UI","Roboto","Oxygen","Ubuntu","Cantarell","Fira Sans","Droid Sans","Helvetica Neue",sans-serif;
          }

          .page {
            position: relative;
            width: calc(var(--ballot-width) * 5 + var(--log-width));
            transform-origin: top left;
          }

          .page-image {
            image-rendering: pixelated;
          }

          .log {
            position: fixed;
            overflow-x: hidden;
            overflow-y: auto;
            overscroll-behavior: contain;
            top: 0;
            right: 0;
            height: calc(100% - var(--toolbar-height));
            width: var(--log-width);
            background-color: #ffffffee;
            border-left: 2px solid rgb(var(--vx-purple-color));
          }

          .log--section--header {
            padding: 10px 10px 15px 10px;
            cursor: pointer;
          }

          .log--section--header h2 {
            font-size: 1.2em;
          }

          .log--section--header h3 {
            font-size: 0.7em;
            color: #666;
            font-style: italic;
          }

          .log--section--header.group-begin h2::before {
            content: '📦 '
          }

          .log--section--header.search-begin h2::before {
            content: '🔍 '
          }

          .log--section--entry.search-test p::before {
            content: '❓ '
          }

          .log--section--entry.search-add p::before {
            content: '➕ '
          }

          .log--section--entry.search-update p::before {
            content: '= '
          }

          .log--section--entry.landmark p::before {
            content: '📍 '
          }

          .log--section--footer {
            padding: 15px 10px 10px 10px;
            cursor: pointer;
          }

          .log--section--footer h2::before {
            content: '⏎ '
          }

          .log--section--footer.search-cancel h2::before {
            content: '🚫 '
          }

          .log--section--footer.search-commit h2::before {
            content: '🎯 '
          }

          .log--section--footer h2 {
            font-size: 1em;
          }

          .log--section--footer h3 {
            font-size: 0.5em;
            font-style: italic;
          }

          .log--section--header.active,
          .log--section--header.active:hover {
            background-color: rgba(var(--vx-purple-color), 0.4)
          }

          .log--section--header:hover {
            background-color: rgba(var(--vx-purple-color), 0.1)
          }

          .toolbar {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            height: var(--toolbar-height);
            color: white;
            background-color: rgb(var(--vx-purple-color));
          }

          .shape {
            position: absolute;
            min-height: 1px;
            min-width: 1px;
            opacity: 0.8;
          }

          .group {}

          .search--cutout {
            /*display: none;*/
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
            background-color: #f542e3;
          }

          .search--added {
            background-color: #00ff00;
          }

          .search--updated {
            background-color: #ffa500;
          }

          .shape.landmark {
            background-color: #4b0082;
          }
          .shape.landmark.contest-corner {
            outline: 20px double #ff0000;
          }
          .shape.landmark.contest-template-bounds {
            background-color: transparent;
            background-image: linear-gradient(45deg, #80808066 25%, transparent 25%), linear-gradient(-45deg, #80808066 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #80808066 75%), linear-gradient(-45deg, transparent 75%, #80808066 75%);
            background-size: 20px 20px;
            background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
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

          .search--added.reset,
          .search.cancel .search--added {
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
            <div class="overlay"></div>
          </div>
          <div class="log"></div>
          <div class="toolbar">
            <input class="scale" type="range" value="100" min="25" max="500">
            <span class="toolbar--coordinates">X: –, Y: –</span>
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

  protected writeAction(
    action: GraphicalInspectImageLoggerAction<Types>
  ): this {
    return this.writeScript(`actions.push(${JSON.stringify(action)})`)
  }

  protected writeScript(script: string): this {
    this.out.write(`<script>${script}</script>`)
    return this
  }
}

class GraphicalSearchImageLogger<Types extends string>
  extends GraphicalInspectImageLogger<Types>
  implements SearchImageLogger<Types> {
  private begun = false
  private ended = false

  public constructor(
    imageData: ImageData,
    out: NodeJS.WritableStream,
    private readonly type: Types,
    private readonly searchId: string
  ) {
    super(imageData, out)
  }

  public begin(bounds: Rect, comment?: string): this {
    assert(!this.begun)
    this.begun = true

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
    assert(this.begun)
    assert(!this.ended)
    this.ended = true

    this.writeAction({
      type: 'search.cancel',
      data: {
        searchId: this.searchId,
        comment,
      },
    })
  }

  public commit(comment?: string): void {
    assert(this.begun)
    assert(!this.ended)
    this.ended = true

    this.writeAction({
      type: 'search.commit',
      data: {
        searchId: this.searchId,
        comment,
      },
    })
  }
}

class GroupedGraphicalInspectImageLogger<Types extends string>
  extends GraphicalInspectImageLogger<Types>
  implements GroupedInspectImageLogger<Types> {
  private groupId = uuid()
  private begun = false
  private ended = false

  public constructor(
    imageData: ImageData,
    out: NodeJS.WritableStream,
    private readonly name: string
  ) {
    super(imageData, out)
  }

  public begin(): this {
    assert(!this.begun)
    this.begun = true

    return this.writeAction({
      type: 'group.begin',
      data: { groupId: this.groupId, name: this.name },
    })
  }

  public end(): void {
    assert(this.begun)
    assert(!this.ended)
    this.ended = true

    this.writeAction({
      type: 'group.end',
      data: { groupId: this.groupId, name: this.name },
    })
  }
}

export async function makeGraphicalLogger<Types extends string>(
  imageData: ImageData,
  out: NodeJS.WritableStream
): Promise<InspectImageLogger<Types>> {
  return await new GraphicalInspectImageLogger<Types>(imageData, out).init()
}
