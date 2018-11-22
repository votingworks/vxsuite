import React, { Component } from 'react';
import PrintProvider, { Print, NoPrint } from 'react-easy-print';
import './App.css';

class App extends Component {
  render() {
    return (
        <div className="App">
          <header className="App-header">
            <img src="./vw-checkmark.png" className="App-logo" alt="logo" />
          </header>
          <PrintProvider>
	    <Print printonly name="ballot">
              <table width="100%" style={{fontSize: "1.5em"}}>
                <tr><th colspan="2" style={{fontSize: "2em"}}>Official Ballot</th></tr>
                <tr><th>&nbsp;</th></tr>
                <tr><th align="left" width="30%">Senator</th><td>Dianne Feinstein</td></tr>
                <tr><th align="left" width="30%">Congressperson</th><td>Anna Eshoo</td></tr>
              </table>
	    </Print>
          </PrintProvider>
	</div>
    );
  }
}

export default App;
