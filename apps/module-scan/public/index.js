import App from './App.js'

// @ts-expect-error - assignment to undeclared property
window.h = React.createElement

ReactDOM.render(h(App), document.getElementById('app-root'))
