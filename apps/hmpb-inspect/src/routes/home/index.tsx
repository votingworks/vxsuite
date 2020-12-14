import { FunctionalComponent, h } from 'preact'
import * as style from './style.css'

const Home: FunctionalComponent = () => {
  return (
    <div class={style.home}>
      <div class={style.page}>
        <img src="/assets/ballot.png" />
      </div>
    </div>
  )
}

export default Home
