import App from './App.js'

// @ts-expect-error
window.h = React.createElement

ReactDOM.render(h(App), document.getElementById('app-root'))
